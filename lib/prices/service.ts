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
import {
  extractDefinitions,
  hasDefinitions,
  parseAliasMap,
} from './definitions';
import {
  renderPriceDb,
  hasGeneratedBanner,
  DEFINITIONS_BANNER,
} from './formatter';
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
import { fetchPricesUsd, PIVOT_SYMBOL, type FetchPlan } from './provider';
import {
  type CommodityPriceRepository,
  type PriceFetchRunRepository,
} from './repository';
import { normalizeCommoditySymbol } from './symbols';
import type { CommodityMapping, ManualPrice } from '@/db/schema';
import type { DbInstance } from '@/lib/db/connection';
import {
  DEFINITIONS_NAME,
  GENERATED_PRICE_DB_NAME,
  PRICE_DB_NAME,
  getJournalCacheTag,
} from '@/lib/journal/layout';
import { resolveIncludes } from '@/lib/journal/loader';
import { withUserLock } from '@/lib/journal/mutex';
import type {
  JournalLayout,
  JournalRepository,
} from '@/lib/journal/repository';
import { verifyJournalParseable } from '@/lib/journal/verify';
import { createLogger } from '@/lib/log';
import { pull, push } from '@/lib/storage';
import { mapWithConcurrency } from '@/utils/mapWithConcurrency';
import { runLedgerForUser } from '@/utils/runLedgerForUser';
import { user as userTable } from '@naeemba/next-starter/schema';
import { revalidateTag } from 'next/cache';

const log = createLogger('prices');

// Backup written when a hand-maintained price DB was first migrated to the
// generated format. Holds the user's original commodity/account declarations.
const PRICE_DB_OLD_NAME = 'price-db_old.ledger';

// listKnownPrices shells out to `ledger prices` once per held commodity. Cap the
// fan-out so a user holding many commodities cannot spawn an unbounded number of
// subprocesses at once.
const PRICE_HISTORY_CONCURRENCY = 8;

// Decimal places for rendered Tether pivot legs. Ledger inherits an input
// price's decimal count when it inverts the leg to value a fiat, so padding to
// this many places keeps the derived `fiat → USD` rate accurate.
const PIVOT_PRICE_DECIMALS = 12;

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

    // Canonicalize every price symbol/quote through the aliases the journal
    // declares. ledger auto-creates a commodity from a `P` line's symbol/quote,
    // so a price that names an alias — quote `USD` when the journal declares
    // `commodity $ / alias USD`, or symbol `BTC` aliased to `BITCOIN` — collides
    // with the `alias` directive and aborts every read (pool.cc assertion). We
    // canonicalize at render, not at insert, so the base-currency quote stays
    // intact for listForQuote's filter above and cron-fetched rows are covered
    // too. See parseAliasMap and lib/journal/verify.ts.
    const aliasMap = await this.readCommodityAliasMap(layout);
    const canonical = (symbol: string): string =>
      aliasMap.get(symbol) ?? symbol;

    const userSymbols = new Set(
      await this.listNormalizedSymbolsForUser(userId)
    );
    // Match on the canonical symbol: a stored alias-symbol row still belongs to
    // a journal that only ever names the canonical commodity. Normalize the
    // canonical name before the membership test — `userSymbols` is upper-cased
    // (listNormalizedSymbolsForUser), while canonical() preserves the journal's
    // raw case, so a lower/mixed-case declaration (`commodity Bitcoin` / `alias
    // BTC`) would otherwise never match and drop the row silently.
    const canonicalSymbolOf = (symbol: string): string | null =>
      normalizeCommoditySymbol(canonical(symbol));
    const fetched = all.filter((r) => {
      const canonicalSymbol = canonicalSymbolOf(r.symbol);
      return canonicalSymbol !== null && userSymbols.has(canonicalSymbol);
    });

    // Fiat has no direct `<fiat> → USD` row; it is priced by the Tether pivot.
    // Include the `USDT → USD` anchor plus a `USDT → <fiat>` leg for every held
    // fiat so ledger can bridge `<fiat> → USDT → USD`. These rows are kept
    // regardless of whether USDT itself is a held commodity (it usually is not),
    // so the userSymbols filter above cannot be reused here.
    const normalizedBase = normalizeCommoditySymbol(base) ?? base;
    const pivotAll = await this.deps.commodityRepo.listBySymbol(PIVOT_SYMBOL);
    const isBaseQuote = (quote: string): boolean =>
      canonicalSymbolOf(quote) === normalizedBase;
    const heldFiatLegs = pivotAll.filter((r) => {
      if (isBaseQuote(r.quote)) return false;
      const canonicalQuote = canonicalSymbolOf(r.quote);
      return canonicalQuote !== null && userSymbols.has(canonicalQuote);
    });
    // Render pivot legs with padded precision so ledger's inversion of the
    // `USDT → <fiat>` leg keeps enough decimals (see CommodityPriceRow.priceText).
    const withPrecision = (r: CommodityPriceRow): CommodityPriceRow => ({
      ...r,
      priceText: r.price.toFixed(PIVOT_PRICE_DECIMALS),
    });
    const pivotRows =
      heldFiatLegs.length > 0
        ? [
            ...pivotAll.filter((r) => isBaseQuote(r.quote)),
            ...heldFiatLegs,
          ].map(withPrecision)
        : [];

    const manual = await this.deps.manualRepo.listForUser(userId);
    const manualRows: CommodityPriceRow[] = manual.map((m) => ({
      symbol: m.symbol,
      quote: m.quote,
      price: m.price,
      fetchedAt: m.pricedAt,
      fetchedDate: utcDate(m.pricedAt),
    }));
    // Concatenate fetched+pivot first, then stable-sort by instant: equal
    // timestamps keep fetched before manual, so a manual override ends up later
    // in the file and wins. Dedupe by (symbol|quote|fetchedDate) so a held-USDT
    // anchor row is not emitted twice (once via `fetched`, once via `pivotRows`).
    const deduped = [
      ...new Map(
        [...fetched, ...pivotRows].map((r) => [
          `${r.symbol}|${r.quote}|${r.fetchedDate}`,
          r,
        ])
      ).values(),
    ];
    const merged = [...deduped, ...manualRows].sort(
      (a, b) => a.fetchedAt.getTime() - b.fetchedAt.getTime()
    );
    const canonicalized = merged.map((r) => ({
      ...r,
      symbol: canonical(r.symbol),
      quote: canonical(r.quote),
    }));
    const body = renderPriceDb(canonicalized);
    const target = path.join(layout.dir, GENERATED_PRICE_DB_NAME);
    await this.deps.journalRepo.writeFileAtomic(target, body);
    try {
      revalidateTag(getJournalCacheTag(userId), 'max');
    } catch {
      // revalidateTag throws outside a Next.js request context (cron, tests).
      // Acceptable — the cache invalidates on the next request.
    }
  }

  /**
   * Alias→canonical-commodity map for the whole journal (empty when it declares
   * none). ledger honors `commodity`/`alias` blocks wherever they appear — a
   * common layout declares `commodity $` / `alias USD` directly in the main
   * journal, never in `definitions.ledger` — so consulting only the relocated
   * definitions file would miss them and let a generated `P … USD` collide with
   * the journal's `alias USD` (the pool.cc assertion this canonicalization
   * exists to prevent). We therefore parse every file reachable from the main
   * journal via its `include` directives, the same set ledger loads.
   *
   * `definitions.ledger` is read explicitly as well so the map still resolves if
   * include-resolution fails (an include cycle or a missing include, which would
   * make ledger itself fail to parse anyway). Later files win on a duplicate
   * alias, but a genuine duplicate `alias` would abort ledger regardless.
   */
  private async readCommodityAliasMap(
    layout: JournalLayout
  ): Promise<Map<string, string>> {
    const defsPath = path.join(layout.dir, DEFINITIONS_NAME);
    const files = [defsPath];
    try {
      for (const file of await resolveIncludes(layout.mainPath)) {
        // definitions.ledger is already first in the list; skip the duplicate.
        if (path.resolve(file) !== path.resolve(defsPath)) files.push(file);
      }
    } catch {
      // Include cycle or missing include — ledger would fail to parse too. Fall
      // back to the definitions.ledger declarations collected above.
    }

    const map = new Map<string, string>();
    for (const file of files) {
      const text = await this.deps.journalRepo.readFile(file).catch(() => '');
      if (!text) continue;
      for (const [alias, commodity] of parseAliasMap(text)) {
        map.set(alias, commodity);
      }
    }
    return map;
  }

  /**
   * Regenerate the user's price DB from the database and push it to canonical.
   * Repairs a price DB written before render-time canonicalization existed —
   * e.g. one that quoted an alias (`USD` for a journal declaring `alias USD`)
   * and aborted every read with a pool.cc assertion. Idempotent; safe to call
   * repeatedly.
   *
   * Takes the per-user lock, pulls fresh under it, regenerates, verifies the new
   * layout parses WITH the price DB (the collision only surfaces when both are
   * loaded), and pushes only on success. Runs in request context so an
   * encryption-enabled user's DEK is available for the push; a locked or
   * undecryptable journal bails before writing (`skipped`) so plaintext never
   * overwrites ciphertext.
   */
  async repairUserPriceDb(
    userId: string
  ): Promise<'repaired' | 'skipped' | 'failed'> {
    return withUserLock(userId, async () => {
      try {
        await pull(userId);
      } catch {
        return 'skipped';
      }
      const layout = await this.deps.journalRepo.ensureLayout(userId);
      await this.regenerateUserPriceDb(userId);
      const verify = await verifyJournalParseable(
        layout.mainPath,
        path.join(layout.dir, GENERATED_PRICE_DB_NAME)
      );
      // Never push a price DB that still can't be parsed alongside the journal.
      if (!verify.ok) return 'failed';
      await push(userId);
      return 'repaired';
    });
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
        this.deps.journalRepo,
        {
          includePriceDb: false,
        }
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
          .writeFile(path.join(layout.dir, GENERATED_PRICE_DB_NAME), '', {
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
        this.deps.journalRepo,
        {
          includePriceDb: false,
        }
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
        const latest = latestGenuinePrice(history, base);

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
   * Latest known price for every held commodity, valued into a target currency.
   * Reuses the raw rows from `listKnownPrices` for provenance and staleness,
   * then re-values each non-target holding through ledger's full price graph in
   * a single `balance -X <target>` call driven by a throwaway probe journal. A
   * holding with no conversion path to the target yields `price: null`.
   *
   * `targetCurrency` is the user-facing display currency (their selector) — NOT
   * the USD pricing base that `resolveBaseCurrency` returns for storage. It
   * defaults to that pricing base only so existing callers stay valid.
   */
  async listKnownPricesInBase(
    userId: string,
    targetCurrency?: string
  ): Promise<KnownPrice[]> {
    // Normalize the target the same way held symbols are normalized (uppercased,
    // `$`→USD). getBaseCurrency can hand back a currency in any case (e.g.
    // `Kirt`), and every downstream `=== base` check compares against a
    // normalized symbol — and `-X` must target the same canonical form ledger
    // valued into — so an un-normalized base would null every row.
    const rawBase = targetCurrency ?? (await this.resolveBaseCurrency(userId));
    const base = normalizeCommoditySymbol(rawBase) ?? rawBase;
    const raw = await this.listKnownPrices(userId);

    // The base row is the target currency valued in itself, so represent it as
    // the identity `1 <target>` rather than its raw quote. For the USD default
    // the raw row is already `1 USD`, so this is a no-op there; for a non-USD
    // target it stops the held target currency from rendering at its raw
    // USD-quoted price (e.g. `1.10 USD`) among rows all valued in the target.
    // Its symbol (e.g. `$`), date, staleness and provenance are preserved.
    const toBaseRow = (row: KnownPrice): KnownPrice =>
      normalizeCommoditySymbol(row.symbol) === base
        ? { ...row, price: 1, quote: base }
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
    // The bridge states `$` = 1 USD, a universal identity (the pricing base is
    // always USD), so it is valid for any target: a dollar-priced holding
    // reaches a non-USD target as `$`->USD->target. Only the ledger-build
    // viability gates it, not the target currency.
    const bridge = 'P 2000-01-01 $ 1 USD\n\n';
    const wantsBridge = getBridgeViability() !== 'aborts';
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
      // The target valued in itself is the identity `1 <target>` (see toBaseRow).
      if (normalizeCommoditySymbol(row.symbol) === base)
        return { ...row, price: 1, quote: base };
      const index = symbolIndex.get(row.symbol);
      const hit = index !== undefined ? valued.get(index) : undefined;
      // Ledger emits `$` for dollar-denominated legs even when `base` is the
      // string `USD`, so normalize before comparing — otherwise a genuinely
      // convertible holding would be reported as having no price. Only the price
      // is re-valued; date, staleness and provenance ride along from the raw
      // base-quote row (ledger has no accessor for the selected price's date).
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

  /**
   * Relocate legacy commodity/account declarations out of the fetcher-owned
   * price DB and into an included `definitions.ledger`, so regeneration can
   * never drop them again. This repairs the original data-loss bug: a
   * hand-maintained `price-db.ledger` was overwritten with prices only,
   * silently deleting every `commodity`/`alias`/`account` directive — which
   * split e.g. `KIRT` from `Kirt` and mis-valued holdings.
   *
   * Sources, in order: the `price-db_old.ledger` backup written when the file
   * was first migrated, else a still-legacy (non-banner) `price-db.ledger`.
   * Idempotent — a no-op once we've relocated (recognized by our banner in
   * `definitions.ledger`, not by the filename, since `definitions.ledger` is
   * also a common hand-authored split) or once the legacy source is gone.
   *
   * Takes the per-user lock, pulls fresh under it, relocates, verifies, and
   * pushes — a single lock acquisition and a single mirror-pull per call, so the
   * caller does NOT need to pull first. The session DEK (for an encryption-
   * enabled user) comes from the request context, not the pull. If the pull or
   * anything up to the verify fails, the pre-relocation state is restored so a
   * failure is a clean no-op rather than a persistently broken journal.
   */
  async relocateLegacyDefinitions(
    userId: string
  ): Promise<'relocated' | 'skipped'> {
    return withUserLock(userId, async () => {
      try {
        await pull(userId);
      } catch {
        // Locked/encrypted journal (no DEK) or a transient storage error. Bail
        // before writing so plaintext never overwrites ciphertext; a later
        // request-context call retries once the journal is decryptable.
        return 'skipped';
      }

      const layout = await this.deps.journalRepo.ensureLayout(userId);
      const defsPath = path.join(layout.dir, DEFINITIONS_NAME);

      // A `definitions.ledger` we generated carries our banner → already
      // relocated, nothing to do. A hand-authored one (no banner) is a normal
      // user split we must never clobber; we append to it below instead.
      const existingDefs = await this.deps.journalRepo
        .readFile(defsPath)
        .catch(() => null);
      if (existingDefs !== null && hasGeneratedBanner(existingDefs)) {
        return 'skipped';
      }

      const source = await this.readDefinitionsSource(layout.dir);
      if (!source) return 'skipped';

      // Snapshot everything we mutate so a failed verify restores the exact
      // pre-relocation state (the legacy source stays the source of truth until
      // verify passes and we delete it below).
      const mainOriginal = await this.deps.journalRepo
        .readFile(layout.mainPath)
        .catch(() => null);

      // Preserve any prices the legacy file still carried (idempotent upsert).
      // Rows are stored verbatim; the alias→commodity canonicalization that keeps
      // the generated price DB parseable happens at render time in
      // regenerateUserPriceDb (so it also covers rows the cron fetcher adds, and
      // so the base-currency quote stays intact for listForQuote's filter).
      const rows = parseLegacyPriceDb(source);
      if (rows.length > 0) await this.deps.commodityRepo.insert(rows);

      const relocated = extractDefinitions(source);
      // Never overwrite a hand-authored definitions file: append to it, so its
      // own declarations survive. A resulting duplicate declaration fails the
      // verify below and is rolled back cleanly.
      const body =
        existingDefs !== null && existingDefs.trim()
          ? `${existingDefs.replace(/\n+$/, '')}\n\n${relocated}\n`
          : `${DEFINITIONS_BANNER}\n${relocated}\n`;

      await this.deps.journalRepo.writeFileAtomic(defsPath, body);
      await this.prependInclude(layout.mainPath, defsPath);

      // Rebuild the generated price file under its own name (fully derived from
      // the DB, so safe to leave in place even on rollback).
      await this.regenerateUserPriceDb(userId);

      // Verify the NEW layout parses BEFORE deleting the legacy files, so a
      // failure is fully reversible. Load the generated price DB too, mirroring
      // the real read path: a commodity/alias collision between definitions and
      // the price DB only surfaces when both are parsed together.
      const verify = await verifyJournalParseable(
        layout.mainPath,
        path.join(layout.dir, GENERATED_PRICE_DB_NAME)
      );
      if (!verify.ok) {
        if (existingDefs === null) {
          await fs.rm(defsPath, { force: true });
        } else {
          await this.deps.journalRepo.writeFileAtomic(defsPath, existingDefs);
        }
        if (mainOriginal !== null) {
          await this.deps.journalRepo.writeFileAtomic(
            layout.mainPath,
            mainOriginal
          );
        }
        throw new Error(
          `definitions relocation left journal unparseable: ${verify.message}`
        );
      }

      // New layout is valid — drop the superseded legacy files so their
      // declarations aren't loaded twice (ledger aborts on a duplicate `alias`).
      await fs.rm(path.join(layout.dir, PRICE_DB_NAME), { force: true });
      await fs.rm(path.join(layout.dir, PRICE_DB_OLD_NAME), { force: true });

      await push(userId);
      return 'relocated';
    });
  }

  /** Prefer the migration backup; fall back to a still-legacy price DB. Skips a
   * regenerated (banner) file, which holds no user declarations. */
  private async readDefinitionsSource(dir: string): Promise<string | null> {
    for (const name of [PRICE_DB_OLD_NAME, PRICE_DB_NAME]) {
      let text: string;
      try {
        text = await fs.readFile(path.join(dir, name), 'utf-8');
      } catch {
        continue;
      }
      if (hasGeneratedBanner(text)) continue;
      if (hasDefinitions(text)) return text;
    }
    return null;
  }

  /** Prepend `include <relpath>` to the main journal unless already present, so
   * commodity aliases resolve before any posting that uses them. */
  private async prependInclude(
    mainPath: string,
    defsPath: string
  ): Promise<void> {
    const main = await this.deps.journalRepo.readFile(mainPath).catch(() => '');
    let rel = path
      .relative(path.dirname(mainPath), defsPath)
      .split(path.sep)
      .join('/');
    if (!rel.startsWith('.')) rel = `./${rel}`;
    const directive = `include ${rel}`;
    const mainDir = path.dirname(mainPath);
    const alreadyIncluded = main.split('\n').some((line) => {
      const trimmed = line.trim();
      if (!trimmed.startsWith('include ')) return false;
      const target = trimmed.slice('include '.length).trim();
      if (!target) return false;
      return path.resolve(mainDir, target) === path.resolve(defsPath);
    });
    if (alreadyIncluded) return;
    await this.deps.journalRepo.writeFileAtomic(
      mainPath,
      `${directive}\n${main}`
    );
  }
}
