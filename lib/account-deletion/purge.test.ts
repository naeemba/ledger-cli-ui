import { promises as fs } from 'fs';
import path from 'path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { purgeUserData } from './purge';
import {
  setupTestDb,
  teardownTestDb,
  type TestDbContext,
} from '@/lib/test-utils/db';
import { user } from '@naeemba/next-starter/schema';

describe('purgeUserData', () => {
  let ctx: TestDbContext;

  beforeEach(async () => {
    ctx = await setupTestDb('acct-purge-');
    await ctx.insertUser('alice', 'Alice', 'alice@example.com');
  });

  afterEach(async () => {
    await teardownTestDb(ctx);
  });

  it('runs clear → removeLocal → db.delete(user) in order', async () => {
    const calls: string[] = [];
    await purgeUserData('alice', ctx.db, {
      clearRemote: async () => {
        calls.push('clear');
      },
      removeLocalJournal: async () => {
        calls.push('local');
      },
    });
    expect(calls).toEqual(['clear', 'local']);
    const rows = await ctx.db.select().from(user).where(eq(user.id, 'alice'));
    expect(rows).toHaveLength(0);
  });

  it('default removeLocalJournal deletes the journal dir', async () => {
    const dir = path.join(ctx.tmpDir, 'journals', 'alice');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'main.ledger'), '; test\n');
    const prev = process.env.DATA_DIR;
    process.env.DATA_DIR = ctx.tmpDir;
    try {
      await purgeUserData('alice', ctx.db, { clearRemote: async () => {} });
    } finally {
      process.env.DATA_DIR = prev;
    }
    await expect(fs.access(dir)).rejects.toThrow();
  });
});
