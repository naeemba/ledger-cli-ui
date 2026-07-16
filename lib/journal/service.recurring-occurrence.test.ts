import { promises as fs } from 'fs';
import path from 'path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getJournalDir } from './layout';
import { JournalRepository } from './repository';
import { JournalService } from './service';
import { push, resetObjectStore } from '@/lib/storage';
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

describe('JournalService.postRecurringOccurrence / skipRecurringOccurrence', () => {
  let ctx: TestDbContext;
  let service: JournalService;

  beforeEach(async () => {
    resetObjectStore();
    ctx = await setupTestDb('journal-recurring-occurrence-');
    await ctx.insertUser('test-user', 'Test', 'test@example.com');
    service = new JournalService(new JournalRepository(ctx.db));
    await fs.mkdir(getJournalDir('test-user'), { recursive: true });
  });

  afterEach(async () => {
    await teardownTestDb(ctx);
    resetObjectStore();
  });

  const seedRule = async (userId: string, handled?: string) => {
    const block = [
      '~ every 1 months from 2026/01/05',
      '    ; :uid: 01HZX5G5KJDS9HQRYK8E5T0DJC',
      ...(handled ? [`    ; :handled: ${handled}`] : []),
      '    ; Netflix',
      '    Expenses:Netflix                            USD 15',
      '    Assets:Checking                             USD -15',
      '',
    ].join('\n');
    await fs.writeFile(path.join(getJournalDir(userId), 'main.ledger'), block);
    await push(userId);
    const rules = await service.listRecurring(userId);
    return rules[0];
  };

  describe('postRecurringOccurrence', () => {
    it('writes the transaction, tags provenance, and advances :handled:', async () => {
      const rule = await seedRule('test-user', '2026-06-05');
      const result = await service.postRecurringOccurrence('test-user', {
        uid: rule.uid!,
        expectedFingerprint: rule.fingerprint,
        dueDate: '2026-07-05',
        today: '2026-07-16',
      });
      expect(result.ok).toBe(true);
      const text = await fs.readFile(
        path.join(getJournalDir('test-user'), 'main.ledger'),
        'utf-8'
      );
      expect(text).toContain('2026-07-05 Netflix');
      expect(text).toContain('; :recurring: 01HZX5G5KJDS9HQRYK8E5T0DJC');
      expect(text).toContain('; :handled: 2026-07-05');
      expect(text).not.toContain('; :handled: 2026-06-05');
    });

    it('rejects a replay: the first post changed the fingerprint', async () => {
      const rule = await seedRule('test-user', '2026-06-05');
      const input = {
        uid: rule.uid!,
        expectedFingerprint: rule.fingerprint,
        dueDate: '2026-07-05',
        today: '2026-07-16',
      };
      expect(
        (await service.postRecurringOccurrence('test-user', input)).ok
      ).toBe(true);
      const replay = await service.postRecurringOccurrence('test-user', input);
      expect(replay.ok).toBe(false);
      if (!replay.ok) expect(replay.reason).toBe('stale');
    });

    it('rejects posting a non-oldest occurrence', async () => {
      const rule = await seedRule('test-user', '2026-05-05');
      const result = await service.postRecurringOccurrence('test-user', {
        uid: rule.uid!,
        expectedFingerprint: rule.fingerprint,
        dueDate: '2026-07-05', // 2026-06-05 is still unhandled
        today: '2026-07-16',
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe('invalid');
    });

    it('rule without :handled: has no backlog: only a today-dated occurrence is due', async () => {
      const rule = await seedRule('test-user'); // no handled line
      const result = await service.postRecurringOccurrence('test-user', {
        uid: rule.uid!,
        expectedFingerprint: rule.fingerprint,
        dueDate: '2026-07-05',
        today: '2026-07-16',
      });
      expect(result.ok).toBe(false); // oldest unhandled is 2026-08-05 (> today) — nothing due
    });
  });

  describe('skipRecurringOccurrence', () => {
    it('advances :handled: without writing a transaction', async () => {
      const rule = await seedRule('test-user', '2026-06-05');
      const result = await service.skipRecurringOccurrence('test-user', {
        uid: rule.uid!,
        expectedFingerprint: rule.fingerprint,
        dueDate: '2026-07-05',
        today: '2026-07-16',
      });
      expect(result.ok).toBe(true);
      const text = await fs.readFile(
        path.join(getJournalDir('test-user'), 'main.ledger'),
        'utf-8'
      );
      expect(text).toContain('; :handled: 2026-07-05');
      expect(text).not.toContain('2026-07-05 Netflix');
    });
  });
});
