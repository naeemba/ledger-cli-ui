import Database from 'better-sqlite3';
import * as schema from '@/db/schema';
import { drizzle } from 'drizzle-orm/better-sqlite3';

export type DbInstance = ReturnType<typeof drizzle<typeof schema>>;

export const createDbConnection = (url: string): DbInstance => {
  const sqlite = new Database(url);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  return drizzle(sqlite, { schema });
};
