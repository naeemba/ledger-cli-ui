import { sql } from 'drizzle-orm';
import { user } from '@naeemba/next-starter/schema';
import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const userSetting = pgTable('userSetting', {
  userId: text('userId')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  // Nullable: a row may exist holding only journalMain before the user picks a
  // base currency. Consumers fall back to env.DEFAULT_CURRENCY when null.
  baseCurrency: text('baseCurrency'),
  // Relative path (within the user's journal dir) of the main ledger file.
  // Folded in from the old user table, which the auth package now owns.
  journalMain: text('journalMain').notNull().default('main.ledger'),
  // Comma-joined order of the transaction-entry tabs (e.g. "types,form,raw").
  // Nullable: consumers fall back to DEFAULT_TAB_ORDER when null. The first id
  // is the default tab the entry shell opens on.
  entryTabOrder: text('entryTabOrder'),
  updatedAt: timestamp('updatedAt')
    .notNull()
    .default(sql`now()`),
});

export type UserSetting = typeof userSetting.$inferSelect;
