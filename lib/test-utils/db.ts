import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import Database from 'better-sqlite3';
import * as schema from '@/db/schema';
import { drizzle } from 'drizzle-orm/better-sqlite3';

export type TestDbContext = {
  tmpDir: string;
  dbPath: string;
  sqlite: Database.Database;
};

export const setupTestDb = async (
  prefix = 'ledger-test-'
): Promise<TestDbContext> => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  const dbPath = path.join(tmpDir, 'db.sqlite');
  const sqlite = new Database(dbPath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');

  drizzle(sqlite, { schema });
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS "user" (
      "id" text PRIMARY KEY NOT NULL,
      "name" text NOT NULL,
      "email" text NOT NULL UNIQUE,
      "emailVerified" integer NOT NULL DEFAULT 0,
      "image" text,
      "journalMain" text NOT NULL DEFAULT 'main.ledger',
      "createdAt" integer NOT NULL DEFAULT (unixepoch()),
      "updatedAt" integer NOT NULL DEFAULT (unixepoch())
    );
  `);

  process.env.DATA_DIR = tmpDir;
  process.env.DATABASE_URL = dbPath;
  process.env.BETTER_AUTH_SECRET = 'x'.repeat(32);
  process.env.PRICE_REFRESH_ENABLED = 'false';

  return { tmpDir, dbPath, sqlite };
};

export const teardownTestDb = async (ctx: TestDbContext): Promise<void> => {
  try {
    ctx.sqlite.close();
  } catch {
    // already closed
  }
  await fs.rm(ctx.tmpDir, { recursive: true, force: true });
};
