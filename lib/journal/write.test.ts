import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import * as schema from '@/db/schema';
import { drizzle } from 'drizzle-orm/better-sqlite3';

describe('writeJournal — edit', () => {
  let tmp: string;
  let sqlite: Database.Database;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'write-'));
    const dbPath = path.join(tmp, 'db.sqlite');
    sqlite = new Database(dbPath);
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

  it('rewrites only the target block; rest byte-exact', async () => {
    const { getJournalDir } = await import('@/lib/journals');
    const userId = 'test-user';
    const dir = getJournalDir(userId);
    await fs.mkdir(dir, { recursive: true });
    const before =
      '; header comment\n\n' +
      '2024-09-01 lunch\n' +
      '    ; :uid: 01HZX5G5KJDS9HQRYK8E5T0DJC\n' +
      '    Expenses:Food                            USD 10\n' +
      '    Assets:Cash                              USD -10\n' +
      '\n' +
      '2024-09-02 coffee\n' +
      '    ; :uid: 01HZX5G5KJDS9HQRYK8E5T0DKZ\n' +
      '    Expenses:Coffee                          USD 4\n' +
      '    Assets:Cash                              USD -4\n';
    await fs.writeFile(path.join(dir, 'main.ledger'), before);

    const { writeJournal } = await import('./write');
    const { fingerprintDraft } = await import('./fingerprint');
    const draftBefore = {
      date: '2024-09-01',
      payee: 'lunch',
      status: 'none' as const,
      uid: '01HZX5G5KJDS9HQRYK8E5T0DJC',
      postings: [
        { account: 'Expenses:Food', amount: '10', currency: 'USD' },
        { account: 'Assets:Cash', amount: '-10', currency: 'USD' },
      ],
    };
    const fp = fingerprintDraft(draftBefore);

    const result = await writeJournal(userId, {
      kind: 'edit',
      uid: '01HZX5G5KJDS9HQRYK8E5T0DJC',
      expectedFingerprint: fp,
      draft: {
        ...draftBefore,
        postings: [
          { account: 'Expenses:Food', amount: '12', currency: 'USD' },
          { account: 'Assets:Cash', amount: '-12', currency: 'USD' },
        ],
      },
    });
    expect(result.ok).toBe(true);

    const after = await fs.readFile(path.join(dir, 'main.ledger'), 'utf-8');
    expect(after).toContain('USD 12');
    expect(after).toContain('USD -12');
    expect(after).toContain('2024-09-02 coffee');
    expect(after).toContain('USD 4');
    expect(after.startsWith('; header comment\n\n')).toBe(true);
  });

  it('returns stale when fingerprint does not match', async () => {
    const { getJournalDir } = await import('@/lib/journals');
    const userId = 'test-user';
    const dir = getJournalDir(userId);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, 'main.ledger'),
      '2024-09-01 lunch\n    ; :uid: 01HZX5G5KJDS9HQRYK8E5T0DJC\n    Expenses:Food  USD 10\n    Assets:Cash\n'
    );
    const { writeJournal } = await import('./write');
    const result = await writeJournal(userId, {
      kind: 'edit',
      uid: '01HZX5G5KJDS9HQRYK8E5T0DJC',
      expectedFingerprint: 'deadbeef'.repeat(8),
      draft: {
        date: '2024-09-01',
        payee: 'lunch',
        status: 'none',
        uid: '01HZX5G5KJDS9HQRYK8E5T0DJC',
        postings: [
          { account: 'Expenses:Food', amount: '12', currency: 'USD' },
          { account: 'Assets:Cash', amount: '-12', currency: 'USD' },
        ],
      },
    });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe('stale');
  });

  it('returns not-found for unknown uid', async () => {
    const { getJournalDir } = await import('@/lib/journals');
    const userId = 'test-user';
    await fs.mkdir(getJournalDir(userId), { recursive: true });
    await fs.writeFile(
      path.join(getJournalDir(userId), 'main.ledger'),
      '2024-09-01 lunch\n    Expenses:Food  USD 10\n    Assets:Cash\n'
    );
    const { writeJournal } = await import('./write');
    const result = await writeJournal(userId, {
      kind: 'edit',
      uid: '01HZX5G5KJDS9HQRYK8E5T0XXX',
      expectedFingerprint: 'deadbeef'.repeat(8),
      draft: {
        date: '2024-09-01',
        payee: 'lunch',
        status: 'none',
        uid: '01HZX5G5KJDS9HQRYK8E5T0XXX',
        postings: [
          { account: 'Expenses:Food', amount: '10', currency: 'USD' },
          { account: 'Assets:Cash', amount: '-10', currency: 'USD' },
        ],
      },
    });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe('not-found');
  });
});

describe('writeJournal — delete', () => {
  let tmp: string;
  let sqlite: Database.Database;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'write-del-'));
    const dbPath = path.join(tmp, 'db.sqlite');
    sqlite = new Database(dbPath);
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

  it('removes the block plus the trailing blank line', async () => {
    const { getJournalDir } = await import('@/lib/journals');
    const userId = 'test-user';
    const dir = getJournalDir(userId);
    await fs.mkdir(dir, { recursive: true });

    const before =
      '2024-09-01 lunch\n' +
      '    ; :uid: 01HZX5G5KJDS9HQRYK8E5T0DJC\n' +
      '    Expenses:Food  USD 10\n' +
      '    Assets:Cash\n' +
      '\n' +
      '2024-09-02 coffee\n' +
      '    Expenses:Coffee  USD 4\n' +
      '    Assets:Cash\n';
    await fs.writeFile(path.join(dir, 'main.ledger'), before);

    const { writeJournal } = await import('./write');
    const { fingerprintDraft } = await import('./fingerprint');

    const draft = {
      date: '2024-09-01',
      payee: 'lunch',
      status: 'none' as const,
      uid: '01HZX5G5KJDS9HQRYK8E5T0DJC',
      postings: [
        { account: 'Expenses:Food', amount: '10', currency: 'USD' },
        { account: 'Assets:Cash', amount: '', currency: '' },
      ],
    };
    const fp = fingerprintDraft(draft);

    const result = await writeJournal(userId, {
      kind: 'delete',
      uid: '01HZX5G5KJDS9HQRYK8E5T0DJC',
      expectedFingerprint: fp,
    });
    expect(result.ok).toBe(true);

    const after = await fs.readFile(path.join(dir, 'main.ledger'), 'utf-8');
    expect(after).toBe(
      '2024-09-02 coffee\n    Expenses:Coffee  USD 4\n    Assets:Cash\n'
    );
  });

  it('removes the leading blank line when block is last in file', async () => {
    const { getJournalDir } = await import('@/lib/journals');
    const userId = 'test-user';
    const dir = getJournalDir(userId);
    await fs.mkdir(dir, { recursive: true });

    const before =
      '2024-09-02 coffee\n' +
      '    Expenses:Coffee  USD 4\n' +
      '    Assets:Cash\n' +
      '\n' +
      '2024-09-01 lunch\n' +
      '    ; :uid: 01HZX5G5KJDS9HQRYK8E5T0DJC\n' +
      '    Expenses:Food  USD 10\n' +
      '    Assets:Cash\n';
    await fs.writeFile(path.join(dir, 'main.ledger'), before);

    const { writeJournal } = await import('./write');
    const { fingerprintDraft } = await import('./fingerprint');

    const draft = {
      date: '2024-09-01',
      payee: 'lunch',
      status: 'none' as const,
      uid: '01HZX5G5KJDS9HQRYK8E5T0DJC',
      postings: [
        { account: 'Expenses:Food', amount: '10', currency: 'USD' },
        { account: 'Assets:Cash', amount: '', currency: '' },
      ],
    };
    const fp = fingerprintDraft(draft);

    const result = await writeJournal(userId, {
      kind: 'delete',
      uid: '01HZX5G5KJDS9HQRYK8E5T0DJC',
      expectedFingerprint: fp,
    });
    expect(result.ok).toBe(true);

    const after = await fs.readFile(path.join(dir, 'main.ledger'), 'utf-8');
    expect(after).toBe(
      '2024-09-02 coffee\n    Expenses:Coffee  USD 4\n    Assets:Cash\n'
    );
  });
});
