import { promises as fs } from 'fs';
import path from 'path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getJournalDir } from './layout';
import { JournalRepository } from './repository';
import { JournalService } from './service';
import { resetObjectStore } from '@/lib/storage';
import {
  setupTestDb,
  teardownTestDb,
  type TestDbContext,
} from '@/lib/test-utils/db';

describe('JournalService.addRecurring (structured schedule)', () => {
  let ctx: TestDbContext;
  let service: JournalService;

  beforeEach(async () => {
    resetObjectStore();
    ctx = await setupTestDb('journal-recurring-');
    await ctx.insertUser('test-user', 'Test', 'test@example.com');
    service = new JournalService(new JournalRepository(ctx.db));
    await fs.mkdir(getJournalDir('test-user'), { recursive: true });
  });

  afterEach(async () => {
    await teardownTestDb(ctx);
    resetObjectStore();
  });

  it('serializes the schedule and initializes :handled: to the last occurrence before today', async () => {
    const result = await service.addRecurring(
      'test-user',
      {
        schedule: { unit: 'month', count: 1, anchor: '2026-01-05' },
        note: 'Netflix',
        postings: [
          { account: 'Expenses:Netflix', amount: '15', currency: 'USD' },
          { account: 'Assets:Checking', amount: '', currency: '' },
        ],
      },
      '2026-07-16'
    );
    expect(result.ok).toBe(true);
    const text = await fs.readFile(
      path.join(getJournalDir('test-user'), 'main.ledger'),
      'utf-8'
    );
    expect(text).toContain('~ every 1 months from 2026/01/05');
    expect(text).toContain('; :handled: 2026-07-05');
  });

  it('omits :handled: for a future anchor (no backlog either way)', async () => {
    const result = await service.addRecurring(
      'test-user',
      {
        schedule: { unit: 'month', count: 1, anchor: '2026-09-05' },
        postings: [
          { account: 'Expenses:Rent', amount: '900', currency: 'USD' },
          { account: 'Assets:Checking', amount: '', currency: '' },
        ],
      },
      '2026-07-16'
    );
    expect(result.ok).toBe(true);
    const text = await fs.readFile(
      path.join(getJournalDir('test-user'), 'main.ledger'),
      'utf-8'
    );
    expect(text).toContain('~ every 1 months from 2026/09/05');
    expect(text).not.toContain(':handled:');
  });

  it('rejects a draft without a schedule', async () => {
    const result = await service.addRecurring(
      'test-user',
      { period: 'Monthly', postings: [] },
      '2026-07-16'
    );
    expect(result.ok).toBe(false);
  });
});
