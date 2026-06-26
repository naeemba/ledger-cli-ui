import { and, desc, eq, sql } from 'drizzle-orm';
import { manualPrice, type ManualPrice } from '@/db/schema';
import type { DbInstance } from '@/lib/db/connection';

export type ManualPriceInput = {
  userId: string;
  symbol: string;
  quote: string;
  price: number;
  pricedAt: Date;
};

export class ManualPriceRepository {
  constructor(private readonly db: DbInstance) {}

  /** Upsert rows by (userId, symbol, quote, pricedAt) in a single statement. */
  async upsertMany(rows: ManualPriceInput[]): Promise<void> {
    if (rows.length === 0) return;
    // Collapse duplicate conflict keys before the batched upsert: a single
    // ON CONFLICT DO UPDATE that targets the same row twice throws Postgres
    // 21000. Last-wins matches the upsert's intent.
    const deduped = [
      ...new Map(
        rows.map((r) => [
          `${r.userId}|${r.symbol}|${r.quote}|${r.pricedAt.toISOString()}`,
          r,
        ])
      ).values(),
    ];
    await this.db
      .insert(manualPrice)
      .values(deduped)
      .onConflictDoUpdate({
        target: [
          manualPrice.userId,
          manualPrice.symbol,
          manualPrice.quote,
          manualPrice.pricedAt,
        ],
        set: { price: sql`excluded.price` },
      });
  }

  async listForUser(userId: string): Promise<ManualPrice[]> {
    return this.db
      .select()
      .from(manualPrice)
      .where(eq(manualPrice.userId, userId))
      .orderBy(desc(manualPrice.pricedAt), desc(manualPrice.id));
  }

  async deleteForUser(userId: string, id: number): Promise<void> {
    await this.db
      .delete(manualPrice)
      .where(and(eq(manualPrice.userId, userId), eq(manualPrice.id, id)));
  }
}
