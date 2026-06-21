import { sql } from 'drizzle-orm';
import { user } from '@naeemba/next-starter/schema';
import { pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

export const savedView = pgTable(
  'savedView',
  {
    id: text('id').primaryKey(),
    userId: text('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    targetPath: text('targetPath').notNull(),
    createdAt: timestamp('createdAt')
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp('updatedAt')
      .notNull()
      .default(sql`now()`),
  },
  (t) => [uniqueIndex('savedView_user_name').on(t.userId, t.name)]
);

export type SavedView = typeof savedView.$inferSelect;
