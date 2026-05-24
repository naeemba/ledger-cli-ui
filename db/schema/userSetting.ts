import { sql } from 'drizzle-orm';
import { user } from './user';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const userSetting = sqliteTable('userSetting', {
  userId: text('userId')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  baseCurrency: text('baseCurrency').notNull(),
  updatedAt: integer('updatedAt', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
});

export type UserSetting = typeof userSetting.$inferSelect;
