import { user } from './user';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const passkey = sqliteTable('passkey', {
  id: text('id').primaryKey(),
  name: text('name'),
  publicKey: text('publicKey').notNull(),
  userId: text('userId')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  credentialID: text('credentialID').notNull(),
  counter: integer('counter').notNull(),
  deviceType: text('deviceType').notNull(),
  backedUp: integer('backedUp', { mode: 'boolean' }).notNull(),
  transports: text('transports'),
  createdAt: integer('createdAt', { mode: 'timestamp' }),
  aaguid: text('aaguid'),
});
