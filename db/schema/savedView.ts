import { sql } from 'drizzle-orm';
import { user } from './user';
import {
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

export const savedView = sqliteTable(
  'savedView',
  {
    id: text('id').primaryKey(),
    userId: text('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    targetPath: text('targetPath').notNull(),
    createdAt: integer('createdAt', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer('updatedAt', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => ({
    uniqueNamePerUser: uniqueIndex('savedView_user_name').on(t.userId, t.name),
  })
);

export type SavedView = typeof savedView.$inferSelect;
