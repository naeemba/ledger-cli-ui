import {
  integer,
  real,
  sqliteTable,
  text,
  unique,
} from 'drizzle-orm/sqlite-core';

export const commodityPrice = sqliteTable(
  'commodity_price',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    symbol: text('symbol').notNull(),
    quote: text('quote').notNull(),
    price: real('price').notNull(),
    fetchedAt: integer('fetched_at', { mode: 'timestamp' }).notNull(),
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
