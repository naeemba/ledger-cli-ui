import { promises as fs } from 'fs';
import path from 'path';
import { eq } from 'drizzle-orm';
import 'server-only';
import { renderPriceDb, hasGeneratedBanner } from './formatter';
import { withPriceLock } from './lock';
import { parseLegacyPriceDb } from './migration';
import { fetchPrices, type QuotePair } from './provider';
import {
  type CommodityPriceRepository,
  type PriceFetchRunRepository,
} from './repository';
import { normalizeCommoditySymbol } from './symbols';
import { user as userTable, userSetting } from '@/db/schema';
import type { DbInstance } from '@/lib/db/connection';
import { env } from '@/lib/env';
import { PRICE_DB_NAME, getJournalCacheTag } from '@/lib/journal/layout';
import type { JournalRepository } from '@/lib/journal/repository';
import { runLedgerForUser } from '@/utils/runLedgerForUser';
import { revalidateTag } from 'next/cache';

export type RefreshResult =
  | { status: 'success'; fetched: number }
  | { status: 'partial'; fetched: number; failed: string[] }
  | { status: 'failed'; message: string };

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
    const filtered = all.filter((r) => userSymbols.has(r.symbol));
    const body = renderPriceDb(filtered);
    const target = path.join(layout.dir, PRICE_DB_NAME);
    await this.deps.journalRepo.writeFileAtomic(target, body);
    try {
      revalidateTag(getJournalCacheTag(userId), 'default');
    } catch {
      // revalidateTag throws outside a Next.js request context (e.g. cron, tests).
      // This is acceptable — the cache will be invalidated on the next request.
    }
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

      const pairs = new Map<string, QuotePair>(); // key: `${symbol}|${quote}`
      for (const userId of users) {
        const base = await this.resolveBaseCurrency(userId);
        const symbols = await this.listNormalizedSymbolsForUser(userId);
        const filtered = symbols.filter((s) => s !== base);
        for (const s of filtered) {
          pairs.set(`${s}|${base}`, { symbol: s, quote: base });
        }
      }

      const result = await fetchPrices(Array.from(pairs.values()));

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
      console.error('[prices] refresh failed:', err);
      await this.deps.runRepo.update(run.id, {
        completedAt: new Date(),
        status: 'failed',
        errorMessage: message,
      });
      return { status: 'failed', message };
    }
  }

  private async listUsers(): Promise<string[]> {
    const rows = this.deps.db
      .select({ id: userTable.id })
      .from(userTable)
      .all();
    return rows.map((r) => r.id);
  }

  private async resolveBaseCurrency(userId: string): Promise<string> {
    const row = this.deps.db
      .select({ baseCurrency: userSetting.baseCurrency })
      .from(userSetting)
      .where(eq(userSetting.userId, userId))
      .get();
    return row?.baseCurrency ?? env.DEFAULT_CURRENCY;
  }

  private async listNormalizedSymbolsForUser(
    userId: string
  ): Promise<string[]> {
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
