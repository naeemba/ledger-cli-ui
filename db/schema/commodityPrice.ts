import {
  pgTable,
  real,
  serial,
  text,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core';

export const commodityPrice = pgTable(
  'commodity_price',
  {
    id: serial('id').primaryKey(),
    symbol: text('symbol').notNull(),
    quote: text('quote').notNull(),
    price: real('price').notNull(),
    fetchedAt: timestamp('fetched_at').notNull(),
    fetchedDate: text('fetched_date').notNull(),
  },
  (t) => [
    unique('commodity_price_unique_per_day').on(
      t.symbol,
      t.quote,
      t.fetchedDate
    ),
  ]
);

export type CommodityPrice = typeof commodityPrice.$inferSelect;
