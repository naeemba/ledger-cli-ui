import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import * as schema from '@/db/schema';
import { findUidInBlock } from '@/lib/journal/uid';
import { drizzle } from 'drizzle-orm/better-sqlite3';

describe('addTransaction', () => {
  let tmp: string;
  let sqlite: Database.Database;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'journals-'));
    const dbPath = path.join(tmp, 'db.sqlite');
    sqlite = new Database(dbPath);
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = ON');

    // Create tables
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

    // Set environment variables before importing journals
    process.env.DATA_DIR = tmp;
    process.env.DATABASE_URL = dbPath;
    process.env.BETTER_AUTH_SECRET = 'x'.repeat(32);
  });

  afterEach(async () => {
    try {
      sqlite.close();
      await fs.rm(tmp, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('stamps a ULID on the new block', async () => {
    const { addTransaction, getJournalDir } = await import('@/lib/journals');
    const userId = 'test-user';
    await fs.mkdir(getJournalDir(userId), { recursive: true });

    const result = await addTransaction(userId, {
      date: '2024-09-01',
      payee: 'lunch',
      status: 'none',
      postings: [
        { account: 'Expenses:Food', amount: '10', currency: 'USD' },
        { account: 'Assets:Cash', amount: '-10', currency: 'USD' },
      ],
    });
    expect(result.ok).toBe(true);
    const text = await fs.readFile(
      path.join(getJournalDir(userId), 'main.ledger'),
      'utf-8'
    );
    expect(findUidInBlock(text)).not.toBeNull();
  });
});
