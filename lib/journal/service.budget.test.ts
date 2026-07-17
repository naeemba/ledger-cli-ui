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

describe('JournalService.addBudget / listBudgets', () => {
  let ctx: TestDbContext;
  let service: JournalService;

  beforeEach(async () => {
    resetObjectStore();
    ctx = await setupTestDb('journal-budget-');
    await ctx.insertUser('test-user', 'Test', 'test@example.com');
    service = new JournalService(new JournalRepository(ctx.db));
    await fs.mkdir(getJournalDir('test-user'), { recursive: true });
  });

  afterEach(async () => {
    await teardownTestDb(ctx);
    resetObjectStore();
  });

  it('writes a :budget: tagged directive with no :handled: line', async () => {
    const result = await service.addBudget('test-user', {
      schedule: { unit: 'month', count: 1, anchor: '2026-07-01' },
      note: 'Groceries budget',
      postings: [
        { account: 'Expenses:Food', amount: '400', currency: 'USD' },
        { account: 'Assets:Checking', amount: '', currency: '' },
      ],
    });
    expect(result.ok).toBe(true);
    const text = await fs.readFile(
      path.join(getJournalDir('test-user'), 'main.ledger'),
      'utf-8'
    );
    expect(text).toContain('~ every 1 months from 2026/07/01');
    expect(text).toContain('; :budget:');
    expect(text).not.toContain(':handled:');
  });

  it('listBudgets returns only budget rules; listRecurring still returns both', async () => {
    await service.addBudget('test-user', {
      schedule: { unit: 'month', count: 1, anchor: '2026-07-01' },
      postings: [
        { account: 'Expenses:Food', amount: '400', currency: 'USD' },
        { account: 'Assets:Checking', amount: '', currency: '' },
      ],
    });
    await service.addRecurring(
      'test-user',
      {
        schedule: { unit: 'month', count: 1, anchor: '2026-01-05' },
        note: 'Netflix',
        postings: [
          { account: 'Expenses:Subscriptions', amount: '15', currency: 'USD' },
          { account: 'Assets:Checking', amount: '', currency: '' },
        ],
      },
      '2026-07-17'
    );
    expect(await service.listBudgets('test-user')).toHaveLength(1);
    expect(await service.listRecurring('test-user')).toHaveLength(2);
  });

  it('rejects an invalid draft with fieldErrors', async () => {
    const result = await service.addBudget('test-user', { postings: [] });
    expect(result.ok).toBe(false);
  });
});
