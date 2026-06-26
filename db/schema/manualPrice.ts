import { sql } from 'drizzle-orm';
import { user } from '@naeemba/next-starter/schema';
import {
  pgTable,
  real,
  serial,
  text,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core';

export const manualPrice = pgTable(
  'manual_price',
  {
    id: serial('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    symbol: text('symbol').notNull(),
    quote: text('quote').notNull(),
    price: real('price').notNull(),
    pricedAt: timestamp('priced_at').notNull(),
    createdAt: timestamp('created_at')
      .notNull()
      .default(sql`now()`),
  },
  (t) => [
    unique('manual_price_unique_per_instant').on(
      t.userId,
      t.symbol,
      t.quote,
      t.pricedAt
    ),
  ]
);

export type ManualPrice = typeof manualPrice.$inferSelect;
