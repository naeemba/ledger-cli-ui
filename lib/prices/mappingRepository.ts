import { eq, sql } from 'drizzle-orm';
import { commodityMapping, type CommodityMapping } from '@/db/schema';
import type { DbInstance } from '@/lib/db/connection';

export type CommodityMappingInput = {
  userId: string;
  symbol: string;
  kind: string;
  providerId: string | null;
  source: 'auto' | 'user';
};

export class CommodityMappingRepository {
  constructor(private readonly db: DbInstance) {}

  async listForUser(userId: string): Promise<CommodityMapping[]> {
    return this.db
      .select()
      .from(commodityMapping)
      .where(eq(commodityMapping.userId, userId))
      .orderBy(commodityMapping.symbol);
  }

  async mapForUser(userId: string): Promise<Map<string, CommodityMapping>> {
    const rows = await this.listForUser(userId);
    return new Map(rows.map((row) => [row.symbol, row]));
  }

  async upsert(row: CommodityMappingInput): Promise<void> {
    await this.upsertMany([row]);
  }

  async upsertMany(rows: CommodityMappingInput[]): Promise<void> {
    if (rows.length === 0) return;
    // Collapse duplicate conflict keys before the batched upsert: a single
    // ON CONFLICT DO UPDATE targeting the same row twice throws Postgres 21000.
    // Last-wins matches the upsert intent.
    const deduplicated = [
      ...new Map(
        rows.map((row) => [`${row.userId}|${row.symbol}`, row])
      ).values(),
    ];
    await this.db
      .insert(commodityMapping)
      .values(deduplicated)
      .onConflictDoUpdate({
        target: [commodityMapping.userId, commodityMapping.symbol],
        set: {
          kind: sql`excluded.kind`,
          providerId: sql`excluded.provider_id`,
          source: sql`excluded.source`,
          updatedAt: sql`now()`,
        },
      });
  }
}
