import { sql } from 'drizzle-orm';
import { user } from '@naeemba/next-starter/schema';
import { index, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

// One row per person whose debt page the owner shares by link. Both blobs are
// AES-256-GCM sealed with keys derived from the owner's DEK (lib/debt-share/
// seal.ts), so the database never learns who is shared with or what they see.
export const debtShare = pgTable(
  'debtShare',
  {
    id: text('id').primaryKey(), // 16 random bytes, base64url; also the GCM associated data
    userId: text('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    sealedMeta: text('sealedMeta').notNull(), // base64 { person, ownerName }
    sealedPage: text('sealedPage').notNull(), // base64 SharedDebtPage
    createdAt: timestamp('createdAt')
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp('updatedAt')
      .notNull()
      .default(sql`now()`),
  },
  (t) => [index('debtShare_userId').on(t.userId)]
);

export type DebtShare = typeof debtShare.$inferSelect;
export type NewDebtShare = typeof debtShare.$inferInsert;
