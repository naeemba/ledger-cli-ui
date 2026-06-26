import { sql } from 'drizzle-orm';
import { user } from '@naeemba/next-starter/schema';
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

export const auditLog = pgTable(
  'auditLog',
  {
    id: text('id').primaryKey(),
    userId: text('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    // Action name, validated app-side by the Zod AUDIT_ACTIONS enum.
    action: text('action').notNull(),
    // 'success' | 'failure'.
    result: text('result').notNull(),
    // Transaction ULID, where the action targets a specific transaction.
    targetUid: text('targetUid'),
    // Journal-dir size (bytes) before/after a journal mutation.
    bytesBefore: integer('bytesBefore'),
    bytesAfter: integer('bytesAfter'),
    // Small metadata only — NEVER journal content. e.g. { fileCount } / { reason }.
    detail: jsonb('detail'),
    ip: text('ip'),
    userAgent: text('userAgent'),
    createdAt: timestamp('createdAt')
      .notNull()
      .default(sql`now()`),
  },
  // This is the largest, most append-heavy table in the schema (a row per
  // journal mutation + security event). Postgres does not auto-index FK
  // columns, so serve `listByUser` (filter userId, order/keyset by id desc —
  // id is a ULID, so desc(id) orders newest-first) with a matching composite
  // index instead of a full table scan.
  (t) => [index('auditLog_user_id').on(t.userId, t.id.desc())]
);

export type AuditLog = typeof auditLog.$inferSelect;
export type NewAuditLog = typeof auditLog.$inferInsert;
