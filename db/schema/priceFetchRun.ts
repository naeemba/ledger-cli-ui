import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const priceFetchRun = sqliteTable('price_fetch_run', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  startedAt: integer('started_at', { mode: 'timestamp' }).notNull(),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
  status: text('status', { enum: ['success', 'partial', 'failed'] }).notNull(),
  symbolsFetched: integer('symbols_fetched').notNull().default(0),
  symbolsFailed: integer('symbols_failed').notNull().default(0),
  errorMessage: text('error_message'),
});

export type PriceFetchRun = typeof priceFetchRun.$inferSelect;
