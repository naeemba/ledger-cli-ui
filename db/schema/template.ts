import { sql } from 'drizzle-orm';
import { user } from '@naeemba/next-starter/schema';
import type { TemplateDraft } from '@/lib/templates/schema';
import {
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const template = pgTable(
  'template',
  {
    id: text('id').primaryKey(),
    userId: text('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    draft: jsonb('draft').notNull().$type<TemplateDraft>(),
    createdAt: timestamp('createdAt').notNull().default(sql`now()`),
    updatedAt: timestamp('updatedAt').notNull().default(sql`now()`),
  },
  (t) => [uniqueIndex('template_user_name').on(t.userId, t.name)]
);

export type Template = typeof template.$inferSelect;
