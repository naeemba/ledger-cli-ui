import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PRICE_DB_NAME } from './layout';
import { getJournalDirSize, journalQuotaBytes } from './quota';

let dataDir: string;
const userId = 'user-quota';

beforeEach(async () => {
  dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'quota-'));
  process.env.DATA_DIR = dataDir;
});

afterEach(async () => {
  await fs.rm(dataDir, { recursive: true, force: true });
  delete process.env.DATA_DIR;
  delete process.env.JOURNAL_QUOTA_MB;
});

describe('journalQuotaBytes', () => {
  it('defaults to 100 MB', () => {
    delete process.env.JOURNAL_QUOTA_MB;
    expect(journalQuotaBytes()).toBe(100 * 1024 * 1024);
  });

  it('reads JOURNAL_QUOTA_MB from the environment', () => {
    process.env.JOURNAL_QUOTA_MB = '5';
    expect(journalQuotaBytes()).toBe(5 * 1024 * 1024);
  });

  it.each(['abc', '0', '-5'])(
    'falls back to 100 MB (fail closed) for invalid value %j',
    (value) => {
      process.env.JOURNAL_QUOTA_MB = value;
      expect(journalQuotaBytes()).toBe(100 * 1024 * 1024);
    }
  );
});

describe('getJournalDirSize', () => {
  it('returns 0 when the dir does not exist', async () => {
    expect(await getJournalDirSize(userId)).toBe(0);
  });

  it('sums nested file sizes', async () => {
    const dir = path.join(dataDir, 'journals', userId);
    await fs.mkdir(path.join(dir, 'sub'), { recursive: true });
    await fs.writeFile(path.join(dir, 'main.ledger'), 'a'.repeat(100));
    await fs.writeFile(path.join(dir, 'sub', 'inc.ledger'), 'b'.repeat(50));
    expect(await getJournalDirSize(userId)).toBe(150);
  });

  it('excludes the auto-managed price DB from the total', async () => {
    const dir = path.join(dataDir, 'journals', userId);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'main.ledger'), 'a'.repeat(100));
    await fs.writeFile(path.join(dir, PRICE_DB_NAME), 'p'.repeat(500));
    expect(await getJournalDirSize(userId)).toBe(100);
  });
});
