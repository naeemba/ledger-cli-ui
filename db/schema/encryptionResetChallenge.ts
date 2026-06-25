import { sql } from 'drizzle-orm';
import { user } from '@naeemba/next-starter/schema';
import { integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

// One active encryption-reset challenge per user (PK = userId; re-requesting
// a code upserts this row). Holds only a hash of the 6-digit code — never plaintext.
export const encryptionResetChallenge = pgTable('encryptionResetChallenge', {
  userId: text('userId')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  codeHash: text('codeHash').notNull(),
  expiresAt: timestamp('expiresAt').notNull(),
  attempts: integer('attempts').notNull().default(0),
  createdAt: timestamp('createdAt')
    .notNull()
    .default(sql`now()`),
});

export type EncryptionResetChallenge =
  typeof encryptionResetChallenge.$inferSelect;
