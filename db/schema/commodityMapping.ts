import { sql } from 'drizzle-orm';
import { user } from '@naeemba/next-starter/schema';
import { pgTable, serial, text, timestamp, unique } from 'drizzle-orm/pg-core';

export const commodityMapping = pgTable(
  'commodity_mapping',
  {
    id: serial('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    symbol: text('symbol').notNull(),
    // 'crypto' | 'fiat' | 'manual'
    kind: text('kind').notNull(),
    // CoinGecko id (crypto), ISO fiat code, or null for manual
    providerId: text('provider_id'),
    // 'auto' = filled by the classifier; 'user' = explicitly chosen. A 'user'
    // row is never overwritten by the classifier.
    source: text('source').notNull().default('auto'),
    updatedAt: timestamp('updated_at')
      .notNull()
      .default(sql`now()`),
  },
  (t) => [unique('commodity_mapping_unique_per_symbol').on(t.userId, t.symbol)]
);

export type CommodityMapping = typeof commodityMapping.$inferSelect;
