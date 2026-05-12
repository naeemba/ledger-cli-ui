import Database from 'better-sqlite3';
import * as schema from '@/db/schema';
import { env } from '@/lib/env';
import { drizzle } from 'drizzle-orm/better-sqlite3';

const dbPath = env.DATABASE_URL ?? `${env.DATA_DIR}/db.sqlite`;

const sqlite = new Database(dbPath);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

export const db = drizzle(sqlite, { schema });
