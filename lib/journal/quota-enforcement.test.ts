import { promises as fs } from 'fs';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getJournalDir } from './layout';
import { JournalRepository } from './repository';
import { JournalService } from './service';
import { resetObjectStore } from '@/lib/storage';
import {
  setupTestDb,
  teardownTestDb,
  type TestDbContext,
} from '@/lib/test-utils/db';

const userId = 'user-quota-enforce';

describe('quota enforcement', () => {
  let ctx: TestDbContext;
  let service: JournalService;

  beforeEach(async () => {
    resetObjectStore();
    ctx = await setupTestDb('quota-enf-');
    await ctx.insertUser(userId);
    service = new JournalService(new JournalRepository(ctx.db));
    process.env.STORAGE_BACKEND = 'memory';
    process.env.JOURNAL_QUOTA_MB = '1'; // 1 MB cap
  });

  afterEach(async () => {
    await teardownTestDb(ctx);
    resetObjectStore();
    delete process.env.JOURNAL_QUOTA_MB;
  });

  it('rejects a single-file import over the quota without writing', async () => {
    const big = Buffer.alloc(2 * 1024 * 1024, '\n'); // 2 MB > 1 MB cap
    const result = await service.replaceFromSingleFile(userId, big);
    expect(result.quotaExceeded).toBe(true);
    // Nothing was written to the journal dir.
    const dir = path.join(ctx.tmpDir, 'journals', userId, 'main.ledger');
    await expect(fs.stat(dir)).rejects.toBeTruthy();
  });

  it('allows a small import', async () => {
    await fs.mkdir(getJournalDir(userId), { recursive: true });
    const small = Buffer.from(
      '2020-01-01 Opening\n  Assets  1\n  Equity  -1\n'
    );
    const result = await service.replaceFromSingleFile(userId, small);
    expect(result.quotaExceeded).toBeUndefined();
  });
});
