import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import 'server-only';
import {
  getBridgeViability,
  recordBridgeAborts,
  recordBridgeViable,
} from './bridgeViability';
import { classifyCommodity } from './classify';
import { getCoinSymbolMap } from './coingecko/coinCache';
import { renderPriceDb, hasGeneratedBanner } from './formatter';
import type { CommodityPriceRow } from './formatter';
import {
  BALANCE_BASE_FORMAT,
  PRICES_FORMAT,
  STALE_THRESHOLD_DAYS,
  ageInDays,
  deriveSource,
  latestGenuinePrice,
  parseBaseBalance,
  parsePriceHistory,
  priceKey,
  type KnownPrice,
  type PricePoint,
} from './knownPrices';
import { withPriceLock } from './lock';
import type { ManualPriceRepository } from './manualRepository';
import { buildPricedAt, type ManualPriceDraft } from './manualSchema';
import type { CommodityMappingRepository } from './mappingRepository';
import { parseLegacyPriceDb } from './migration';
import { fetchPricesUsd, type FetchPlan } from './provider';
import {
  type CommodityPriceRepository,
  type PriceFetchRunRepository,
} from './repository';
import { normalizeCommoditySymbol } from './symbols';
import type { CommodityMapping, ManualPrice } from '@/db/schema';
import type { DbInstance } from '@/lib/db/connection';
import { PRICE_DB_NAME, getJournalCacheTag } from '@/lib/journal/layout';
import type { JournalRepository } from '@/lib/journal/repository';
import { createLogger } from '@/lib/log';
import { mapWithConcurrency } from '@/utils/mapWithConcurrency';
import { runLedgerForUser } from '@/utils/runLedgerForUser';
import { user as userTable } from '@naeemba/next-starter/schema';
import { revalidateTag } from 'next/cache';

const log = createLogger('prices');

// listKnownPrices shells out to `ledger prices` once per held commodity. Cap the
// fan-out so a user holding many commodities cannot spawn an unbounded number of
// subprocesses at once.
const PRICE_HISTORY_CONCURRENCY = 8;

export type RefreshResult =
  | { status: 'success'; fetched: number }
  | { status: 'partial'; fetched: number; failed: string[] }
  | { status: 'failed'; message: string };

/**
 * Outcome of a manual-price mutation. Shared between the service and the
 * server actions so the success/error shape can't drift between the two.
 */
export type ManualPriceResult = { ok: true } | { ok: false; formError: string };

const sanitize = (msg: string): string =>
  msg.replace(/\/[^\s]+/g, '<path>').slice(0, 500);

const utcDate = (d: Date): string => {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

type Deps = {
  db: DbInstance;
  commodityRepo: CommodityPriceRepository;
  runRepo: PriceFetchRunRepository;
  journalRepo: JournalRepository;
  manualRepo: ManualPriceRepository;
  mappingRepo: CommodityMappingRepository;
};

export class PriceService {
  constructor(private readonly deps: Deps) {}

  async refreshAll(): Promise<RefreshResult> {
    return withPriceLock(() => this.runOnce());
  }

  async getLastRun() {
    return this.deps.runRepo.latest();
  }

  async regenerateUserPriceDb(userId: string): Promise<void> {
    const layout = await this.deps.journalRepo.ensureLayout(userId);
    const base = await this.resolveBaseCurrency(userId);
    const all = await this.deps.commodityRepo.listForQuote(base);
    const userSymbols = new Set(
      await this.listNormalizedSymbolsForUser(userId)
    );
    const fetched = all.filter((r) => userSymbols.has(r.symbol));
    const manual = await this.deps.manualRepo.listForUser(userId);
    const manualRows: CommodityPriceRow[] = manual.map((m) => ({
      symbol: m.symbol,
      quote: m.quote,
      price: m.price,
      fetchedAt: m.pricedAt,
      fetchedDate: utcDate(m.pricedAt),
    }));
    // Concatenate fetched-first, then stable-sort by instant: equal timestamps
    // keep fetched before manual, so manual ends up later in the file and wins.
    const merged = [...fetched, ...manualRows].sort(
      (a, b) => a.fetchedAt.getTime() - b.fetchedAt.getTime()
    );
    const body = renderPriceDb(merged);
    const target = path.join(layout.dir, PRICE_DB_NAME);
    await this.deps.journalRepo.writeFileAtomic(target, body);
    try {
      revalidateTag(getJournalCacheTag(userId), 'max');
    } catch {
      // revalidateTag throws outside a Next.js request context (cron, tests).
      // Acceptable — the cache invalidates on the next request.
    }
  }

  async addManualPrices(
    userId: string,
    draft: ManualPriceDraft
  ): Promise<ManualPriceResult> {
    const quote = normalizeCommoditySymbol(draft.quote);
    if (!quote) return { ok: false, formError: 'Invalid quote currency' };
    const pricedAt = buildPricedAt(draft.date, draft.time);
    if (!pricedAt) return { ok: false, formError: 'Invalid date or time' };

    const byKey = new Map<
      string,
      {
        userId: string;
        symbol: string;
        quote: string;
        price: number;
        pricedAt: Date;
      }
    >();
    for (const row of draft.rows) {
      const symbol = normalizeCommoditySymbol(row.symbol);
      if (!symbol) {
        return { ok: false, formError: `Invalid commodity: ${row.symbol}` };
      }
      if (symbol === quote) {
        return { ok: false, formError: `Cannot price ${symbol} in itself` };
      }
      byKey.set(symbol, { userId, symbol, quote, price: row.price, pricedAt });
    }

    await this.deps.manualRepo.upsertMany([...byKey.values()]);
    await this.regenerateUserPriceDb(userId);
    return { ok: true };
  }

  async listManualPrices(userId: string): Promise<ManualPrice[]> {
    return this.deps.manualRepo.listForUser(userId);
  }

  /** Returns true when a row owned by the user was actually removed. */
  async deleteManualPrice(userId: string, id: number): Promise<boolean> {
    const removed = await this.deps.manualRepo.deleteForUser(userId, id);
    if (removed) await this.regenerateUserPriceDb(userId);
    return removed;
  }

  private async runOnce(): Promise<RefreshResult> {
    const startedAt = new Date();
    // Tombstone the run as 'failed' up front so a hard process termination
    // (SIGKILL, OOM, host restart) between insert and final update leaves an
    // honest record instead of a phantom successful row.
    const run = await this.deps.runRepo.insert({
      startedAt,
      status: 'failed',
    });

    try {
      const users = await this.listUsers();
      await this.maybeMigrateLegacyFiles(users);

      const plan: FetchPlan = { crypto: [], fiat: [] };
      const seen = new Set<string>();
      for (const userId of users) {
        const symbols = await this.listNormalizedSymbolsForUser(userId);
        const filtered = symbols.filter((s) => s !== 'USD');
        const mappings = await this.ensureMappings(userId, filtered);
        this.planFromMappings(
          filtered
            .map((s) => mappings.get(s))
            .filter((m): m is CommodityMapping => Boolean(m)),
          plan,
          seen
        );
      }

      const result = await fetchPricesUsd(plan);

      await this.deps.commodityRepo.insert(
        result.quotes.map((q) => ({
          symbol: q.symbol,
          quote: q.quote,
          price: q.price,
          fetchedAt: q.fetchedAt,
          fetchedDate: utcDate(q.fetchedAt),
        }))
      );

      for (const userId of users) {
        await this.regenerateUserPriceDb(userId);
      }

      const failedSymbols = result.failed.map((p) => p.symbol);
      const status = result.failed.length === 0 ? 'success' : 'partial';
      await this.deps.runRepo.update(run.id, {
        completedAt: new Date(),
        status,
        symbolsFetched: result.quotes.length,
        symbolsFailed: result.failed.length,
        errorMessage:
          failedSymbols.length > 0 ? failedSymbols.join(', ') : null,
      });

      if (status === 'partial') {
        return {
          status: 'partial',
          fetched: result.quotes.length,
          failed: failedSymbols,
        };
      }
      return { status: 'success', fetched: result.quotes.length };
    } catch (err) {
      const message = sanitize(
        err instanceof Error ? err.message : String(err)
      );
      log.error({ err }, 'refresh failed');
      await this.deps.runRepo.update(run.id, {
        completedAt: new Date(),
        status: 'failed',
        errorMessage: message,
      });
      return { status: 'failed', message };
    }
  }

  private async listUsers(): Promise<string[]> {
    const rows = await this.deps.db
      .select({ id: userTable.id })
      .from(userTable);
    return rows.map((r) => r.id);
  }

  // Pricing base is USD: CoinGecko cannot quote USDT, so all fetched prices are
  // stored in USD and journals value with `-X USD`. Kept as a method so callers
  // (price-DB regeneration, prices UI) share one source of truth.
  async resolveBaseCurrency(_userId: string): Promise<string> {
    return 'USD';
  }

  /** Raw commodity symbols the user holds, as `ledger commodities` prints them. */
  async listHeldCommodities(userId: string): Promise<string[]> {
    let stdout: string;
    try {
      stdout = await runLedgerForUser(
        userId,
        ['commodities'],
        this.deps.journalRepo
      );
    } catch {
      return [];
    }
    return stdout
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  }

  /**
   * Full known price history for one commodity, ascending by date.
   *
   * Side effect: when no price-db.ledger exists yet this method creates an
   * empty one so that `ledger prices` can surface P directives. The file is
   * created with an exclusive open (`wx`) so a concurrent regeneration is never
   * clobbered.
   */
  async listPriceHistory(
    userId: string,
    symbol: string
  ): Promise<PricePoint[]> {
    if (!symbol.trim() || /[\n\r]/.test(symbol)) return [];
    let stdout: string;
    try {
      // ledger prices only surfaces P directives when --price-db is present,
      // even if the file is empty. Ensure one exists before shelling out.
      const layout = await this.deps.journalRepo.ensureLayout(userId);
      if (!layout.priceDbPath) {
        await fs
          .writeFile(path.join(layout.dir, PRICE_DB_NAME), '', {
            encoding: 'utf-8',
            flag: 'wx',
          })
          .catch((error: NodeJS.ErrnoException) => {
            if (error.code !== 'EEXIST') throw error;
            // File already exists (a prior call or a concurrent regeneration created
            // it). Either way --price-db will be passed by runLedgerForUser.
          });
      }
      stdout = await runLedgerForUser(
        userId,
        ['prices', '--prices-format', PRICES_FORMAT, '--', symbol],
        this.deps.journalRepo
      );
    } catch {
      return [];
    }
    return parsePriceHistory(stdout);
  }

  async listNormalizedSymbolsForUser(userId: string): Promise<string[]> {
    let stdout: string;
    try {
      stdout = await runLedgerForUser(
        userId,
        ['commodities'],
        this.deps.journalRepo
      );
    } catch {
      return [];
    }
    const out = new Set<string>();
    for (const line of stdout.split('\n')) {
      const sym = normalizeCommoditySymbol(line);
      if (sym) out.add(sym);
    }
    return Array.from(out);
  }

  /**
   * Ensure every in-use symbol has a mapping row. Symbols with no row are
   * auto-classified and persisted as source='auto'. Existing rows (auto or
   * user) are left untouched so a user override is never clobbered.
   */
  private async ensureMappings(
    userId: string,
    symbols: string[]
  ): Promise<Map<string, CommodityMapping>> {
    const existing = await this.deps.mappingRepo.mapForUser(userId);
    const missing = symbols.filter((s) => !existing.has(s));
    if (missing.length === 0) return existing;
    const coinMap = await getCoinSymbolMap();
    const rows = missing.map((symbol) => {
      const { kind, providerId } = classifyCommodity(symbol, coinMap);
      return { userId, symbol, kind, providerId, source: 'auto' as const };
    });
    await this.deps.mappingRepo.upsertMany(rows);
    return this.deps.mappingRepo.mapForUser(userId);
  }

  private planFromMappings(
    mappings: Iterable<CommodityMapping>,
    into: FetchPlan,
    seen: Set<string>
  ): void {
    for (const m of mappings) {
      if (m.kind === 'crypto' && m.providerId) {
        const key = `c:${m.symbol}`;
        if (!seen.has(key)) {
          seen.add(key);
          into.crypto.push({ symbol: m.symbol, id: m.providerId });
        }
      } else if (m.kind === 'fiat' && m.providerId) {
        const key = `f:${m.symbol}`;
        if (!seen.has(key)) {
          seen.add(key);
          into.fiat.push({ symbol: m.symbol, code: m.providerId });
        }
      }
      // kind === 'manual' → skipped: user supplies the price.
    }
  }

  /** Latest known price for every held commodity, with provenance and staleness. */
  async listKnownPrices(userId: string): Promise<KnownPrice[]> {
    const base = await this.resolveBaseCurrency(userId);
    const [held, manual, fetched] = await Promise.all([
      this.listHeldCommodities(userId),
      this.deps.manualRepo.listForUser(userId),
      this.deps.commodityRepo.listForQuote(base),
    ]);

    const manualKeys = new Set(
      manual.map((row) =>
        priceKey(row.symbol, row.quote, utcDate(row.pricedAt))
      )
    );
    const fetchedKeys = new Set(
      fetched.map((row) => priceKey(row.symbol, row.quote, row.fetchedDate))
    );

    const today = utcDate(new Date());

    const rows = await mapWithConcurrency(
      held,
      PRICE_HISTORY_CONCURRENCY,
      async (symbol): Promise<KnownPrice> => {
        const symbolNormalized = normalizeCommoditySymbol(symbol);

        if (symbolNormalized && symbolNormalized === base) {
          return {
            symbol,
            price: 1,
            quote: base,
            date: null,
            ageDays: null,
            stale: false,
            source: 'base',
          };
        }

        const history = await this.listPriceHistory(userId, symbol);
        const latest = latestGenuinePrice(history);

        if (!latest) {
          return {
            symbol,
            price: null,
            quote: null,
            date: null,
            ageDays: null,
            stale: false,
            source: 'none',
          };
        }

        const quoteNormalized =
          normalizeCommoditySymbol(latest.quote) ?? latest.quote;
        const ageDays = ageInDays(latest.date, today);
        return {
          symbol,
          price: latest.price,
          quote: quoteNormalized,
          date: latest.date,
          ageDays,
          stale: ageDays > STALE_THRESHOLD_DAYS,
          source: deriveSource({
            symbolNormalized,
            quoteNormalized,
            date: latest.date,
            base,
            manualKeys,
            fetchedKeys,
          }),
        };
      }
    );

    return rows.sort((a, b) =>
      a.symbol.localeCompare(b.symbol, undefined, { sensitivity: 'base' })
    );
  }

  /**
   * Latest known price for every held commodity, valued into the base currency.
   * Reuses the raw rows from `listKnownPrices` for provenance and staleness,
   * then re-values each non-base holding through ledger's full price graph in a
   * single `balance -X <base>` call driven by a throwaway probe journal. A
   * holding with no conversion path to the base yields `price: null`.
   */
  async listKnownPricesInBase(userId: string): Promise<KnownPrice[]> {
    const base = await this.resolveBaseCurrency(userId);
    const raw = await this.listKnownPrices(userId);

    // The base row keeps whatever symbol ledger prints for it (e.g. `$`), so
    // the row's identity matches the original-quote view exactly — only the
    // non-base rows get re-valued.
    const toBaseRow = (row: KnownPrice): KnownPrice =>
      normalizeCommoditySymbol(row.symbol) === base
        ? row
        : { ...row, price: null, quote: null };

    // `ledger commodities` surrounds any name that is not a bare alphanumeric
    // run with double quotes (e.g. it prints `"1INCH"` for the digit-bearing
    // 1inch ticker — such names are only legal quoted in a journal anyway).
    // Recover the bare commodity name by stripping one surrounding quote pair,
    // then reject anything that still carries a quote or newline, which would
    // let a crafted holding break out of the throwaway journal.
    const probeName = (symbol: string): string | null => {
      const stripped =
        symbol.length >= 2 &&
        ((symbol.startsWith('"') && symbol.endsWith('"')) ||
          (symbol.startsWith("'") && symbol.endsWith("'")))
          ? symbol.slice(1, -1)
          : symbol;
      return /["\n\r]/.test(stripped) ? null : stripped;
    };

    // Probe only non-base commodities with a journal-safe name. Keep the raw
    // symbol as the row identity so results match back exactly.
    const probeSymbols = raw
      .filter(
        (row) =>
          normalizeCommoditySymbol(row.symbol) !== base &&
          probeName(row.symbol) !== null
      )
      .map((row) => row.symbol);

    if (probeSymbols.length === 0) return raw.map(toBaseRow);

    // Map each held symbol to its probe index once, so the final re-value pass
    // is linear rather than O(n²) via a per-row `indexOf` scan. First index
    // wins on the off chance two rows carry the same symbol.
    const symbolIndex = new Map<string, number>();
    probeSymbols.forEach((symbol, index) => {
      if (!symbolIndex.has(symbol)) symbolIndex.set(symbol, index);
    });

    // One balanced `1 <symbol>` transaction per commodity, indexed by position
    // so the account name carries no commodity-specific characters. Blank lines
    // separate transactions; an explicit offset balances each one. The bare
    // commodity name is always double-quoted, which is legal for every name and
    // is required for digit-bearing tickers (`1 1INCH` fails: "Unexpected char
    // '1'"). An optional bridge directive may be prepended.
    const buildJournal = (bridge: string): string =>
      bridge +
      probeSymbols
        .map((symbol, index) => {
          const name = probeName(symbol) as string;
          return `2000-01-01 * probe\n  Probe:c${index}    1 "${name}"\n  Offset:c${index}    -1 "${name}"\n`;
        })
        .join('\n');

    const runProbe = async (journal: string): Promise<string> => {
      const probePath = path.join(
        os.tmpdir(),
        `ledger-probe-${randomUUID()}.ledger`
      );
      try {
        await fs.writeFile(probePath, journal, 'utf-8');
        return await runLedgerForUser(
          userId,
          [
            '--file',
            probePath,
            'balance',
            '^Probe:c',
            '--flat',
            '--empty',
            '--no-total',
            '-X',
            base,
            '--format',
            BALANCE_BASE_FORMAT,
          ],
          this.deps.journalRepo
        );
      } finally {
        await fs.rm(probePath, { force: true }).catch(() => {});
      }
    };

    // Ledger builds that keep `$` and the literal `USD` distinct will not
    // bridge a `$`-priced holding into a `USD` base on their own, so seed the
    // identity `$` = 1 USD, dated in the distant past so any real `$`/USD price
    // in the user's journal takes precedence over it. Builds that canonicalize
    // `$` to `USD` (e.g. Ledger 3.4.x) reject that directive as a self-price
    // ("Assertion failed … source != price.commodity()") and abort the whole
    // parse — but they also already value `$` into `USD` natively, so the
    // bridge is redundant there. Try with the bridge, then retry without it on
    // failure to stay correct across both build behaviours — and remember which
    // build this binary is, so a canonicalizing build skips the known-fatal
    // bridge attempt (and its guaranteed retry) on every later render.
    const bridge = 'P 2000-01-01 $ 1 USD\n\n';
    const wantsBridge = base === 'USD' && getBridgeViability() !== 'aborts';
    let stdout: string | null = null;
    try {
      stdout = await runProbe(buildJournal(wantsBridge ? bridge : ''));
      if (wantsBridge) recordBridgeViable();
    } catch {
      if (wantsBridge) {
        recordBridgeAborts();
        stdout = await runProbe(buildJournal('')).catch(() => null);
      }
    }
    // Ledger failed outright → no valuation available; degrade to no-price rows.
    if (stdout === null) return raw.map(toBaseRow);

    const valued = parseBaseBalance(stdout);
    return raw.map((row) => {
      if (normalizeCommoditySymbol(row.symbol) === base) return row;
      const index = symbolIndex.get(row.symbol);
      const hit = index !== undefined ? valued.get(index) : undefined;
      // Ledger emits `$` for dollar-denominated legs even when `base` is the
      // string `USD`, so normalize before comparing — otherwise a genuinely
      // convertible holding would be reported as having no price.
      return hit && normalizeCommoditySymbol(hit.commodity) === base
        ? { ...row, price: hit.price, quote: base }
        : { ...row, price: null, quote: null };
    });
  }

  private async maybeMigrateLegacyFiles(users: string[]): Promise<void> {
    for (const userId of users) {
      const layout = await this.deps.journalRepo.ensureLayout(userId);
      const target = path.join(layout.dir, PRICE_DB_NAME);
      let text: string;
      try {
        text = await fs.readFile(target, 'utf-8');
      } catch {
        continue; // no existing file → nothing to migrate
      }
      if (hasGeneratedBanner(text)) continue;
      const rows = parseLegacyPriceDb(text);
      if (rows.length === 0) continue;
      await this.deps.commodityRepo.insert(rows);
    }
  }
}
