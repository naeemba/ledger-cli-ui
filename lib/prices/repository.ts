import { desc, eq, sql } from 'drizzle-orm';
import {
  commodityPrice,
  priceFetchRun,
  type CommodityPrice,
  type PriceFetchRun,
} from '@/db/schema';
import type { DbInstance } from '@/lib/db/connection';

export type CommodityPriceInput = {
  symbol: string;
  quote: string;
  price: number;
  fetchedAt: Date;
  fetchedDate: string;
};

export class CommodityPriceRepository {
  constructor(private readonly db: DbInstance) {}

  /** Upsert rows by (symbol, quote, fetched_date) in a single statement. */
  async insert(rows: CommodityPriceInput[]): Promise<void> {
    if (rows.length === 0) return;
    // Collapse duplicate conflict keys before the batched upsert: a single
    // `ON CONFLICT DO UPDATE` statement that targets the same row twice throws
    // Postgres 21000. The legacy-import path (one row per `P` directive) can
    // carry several same-day entries for one commodity, so dedupe last-wins to
    // match the upsert's intent.
    const deduped = [
      ...new Map(
        rows.map((r) => [`${r.symbol}|${r.quote}|${r.fetchedDate}`, r])
      ).values(),
    ];
    // One batched upsert rather than N round-trips: a single statement is
    // atomic, so the set lands all-or-nothing instead of partially committing
    // on a mid-loop failure.
    await this.db
      .insert(commodityPrice)
      .values(deduped)
      .onConflictDoUpdate({
        target: [
          commodityPrice.symbol,
          commodityPrice.quote,
          commodityPrice.fetchedDate,
        ],
        set: {
          price: sql`excluded.price`,
          fetchedAt: sql`excluded.fetched_at`,
        },
      });
  }

  async listForQuote(quote: string): Promise<CommodityPrice[]> {
    return this.db
      .select()
      .from(commodityPrice)
      .where(eq(commodityPrice.quote, quote))
      .orderBy(commodityPrice.fetchedAt);
  }

  /** Distinct symbols already fetched against the given quote. */
  async knownSymbolsForQuote(quote: string): Promise<string[]> {
    const rows = await this.db
      .selectDistinct({ symbol: commodityPrice.symbol })
      .from(commodityPrice)
      .where(eq(commodityPrice.quote, quote));
    return rows.map((r) => r.symbol);
  }
}

export type PriceFetchRunInsert = {
  startedAt: Date;
  status: PriceFetchRun['status'];
};

export type PriceFetchRunUpdate = Partial<{
  completedAt: Date;
  status: PriceFetchRun['status'];
  symbolsFetched: number;
  symbolsFailed: number;
  errorMessage: string | null;
}>;

export class PriceFetchRunRepository {
  constructor(private readonly db: DbInstance) {}

  async insert(input: PriceFetchRunInsert): Promise<PriceFetchRun> {
    const rows = await this.db.insert(priceFetchRun).values(input).returning();
    return rows[0]!;
  }

  async update(id: number, patch: PriceFetchRunUpdate): Promise<void> {
    await this.db
      .update(priceFetchRun)
      .set(patch)
      .where(eq(priceFetchRun.id, id));
  }

  async latest(): Promise<PriceFetchRun | null> {
    const rows = await this.db
      .select()
      .from(priceFetchRun)
      .orderBy(desc(priceFetchRun.id))
      .limit(1);
    return rows[0] ?? null;
  }
}
