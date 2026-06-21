import { integer, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

export const priceFetchRun = pgTable('price_fetch_run', {
  id: serial('id').primaryKey(),
  startedAt: timestamp('started_at').notNull(),
  completedAt: timestamp('completed_at'),
  status: text('status', { enum: ['success', 'partial', 'failed'] }).notNull(),
  symbolsFetched: integer('symbols_fetched').notNull().default(0),
  symbolsFailed: integer('symbols_failed').notNull().default(0),
  errorMessage: text('error_message'),
});

export type PriceFetchRun = typeof priceFetchRun.$inferSelect;
