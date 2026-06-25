import { sql } from 'drizzle-orm';
import { user } from '@naeemba/next-starter/schema';
import { pgTable, text, timestamp, unique } from 'drizzle-orm/pg-core';

// One row per (user, passkey) that can unlock the journal. The DEK is wrapped
// by a key derived from that passkey's PRF output. credentialId mirrors the
// better-auth passkey credentialID (base64url); it is NOT a foreign key because
// better-auth's credentialID column is indexed, not unique. Orphan rows (passkey
// later deleted) are harmless — they can never assert — and the Settings UI hides
// them by cross-referencing the live passkey list.
export const cryptoPasskeyWrap = pgTable(
  'cryptoPasskeyWrap',
  {
    id: text('id').primaryKey(), // ULID
    userId: text('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    credentialId: text('credentialId').notNull(),
    prfSalt: text('prfSalt').notNull(), // base64, 32 bytes
    wrap: text('wrap').notNull(), // opaque base64; DEK wrapped by the PRF-derived KEK
    label: text('label').notNull(), // mirrors the passkey name, for the UI
    createdAt: timestamp('createdAt')
      .notNull()
      .default(sql`now()`),
  },
  (t) => [unique('cryptoPasskeyWrap_user_cred').on(t.userId, t.credentialId)]
);

export type CryptoPasskeyWrap = typeof cryptoPasskeyWrap.$inferSelect;
export type NewCryptoPasskeyWrap = typeof cryptoPasskeyWrap.$inferInsert;
