import { promises as fs } from 'fs';
import path from 'path';
import 'server-only';
import { classifyCommodity } from './classify';
import { getCoinSymbolMap } from './coingecko/coinCache';
import { renderPriceDb, hasGeneratedBanner } from './formatter';
import type { CommodityPriceRow } from './formatter';
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
import { runLedgerForUser } from '@/utils/runLedgerForUser';
import { user as userTable } from '@naeemba/next-starter/schema';
import { revalidateTag } from 'next/cache';

const log = createLogger('prices');

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
