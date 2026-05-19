import { sql } from 'drizzle-orm';
import { user } from './user';
import type { TemplateDraft } from '@/lib/templates/schema';
import {
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

export const template = sqliteTable(
  'template',
  {
    id: text('id').primaryKey(),
    userId: text('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    draft: text('draft', { mode: 'json' }).notNull().$type<TemplateDraft>(),
    createdAt: integer('createdAt', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer('updatedAt', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => ({
    uniqueNamePerUser: uniqueIndex('template_user_name').on(t.userId, t.name),
  })
);

export type Template = typeof template.$inferSelect;
