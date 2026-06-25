import { sql } from 'drizzle-orm';
import { user } from '@naeemba/next-starter/schema';
import { integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/** Client-side Argon2id parameters, stored for forward-compat. */
export type ArgonParams = { m: number; t: number; p: number };

export const userCrypto = pgTable('userCrypto', {
  userId: text('userId')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  // All wraps are opaque base64 blobs created client-side; the server never unwraps them.
  wrapPassphrase: text('wrapPassphrase').notNull(),
  passSalt: text('passSalt').notNull(),
  argonParams: jsonb('argonParams').notNull().$type<ArgonParams>(),
  wrapRecovery: text('wrapRecovery').notNull(),
  recoveryCreatedAt: timestamp('recoveryCreatedAt')
    .notNull()
    .default(sql`now()`),
  kdfVersion: integer('kdfVersion').notNull().default(1),
  createdAt: timestamp('createdAt')
    .notNull()
    .default(sql`now()`),
  updatedAt: timestamp('updatedAt')
    .notNull()
    .default(sql`now()`)
    .$onUpdate(() => sql`now()`),
});

export type UserCrypto = typeof userCrypto.$inferSelect;
export type NewUserCrypto = typeof userCrypto.$inferInsert;
