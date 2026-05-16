import { sql } from 'drizzle-orm';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const user = sqliteTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: integer('emailVerified', { mode: 'boolean' })
    .notNull()
    .default(false),
  image: text('image'),
  // Relative path (within the user's journal directory) of the main ledger
  // file — the one passed to `ledger --file`. All `include` directives in
  // that file resolve relative to it, so a multi-file journal can live
  // alongside the main file.
  journalMain: text('journalMain').notNull().default('main.ledger'),
  createdAt: integer('createdAt', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer('updatedAt', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
});
