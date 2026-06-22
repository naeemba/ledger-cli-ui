import { promises as fs } from 'fs';
import path from 'path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TemplateRepository } from './repository';
import type { TemplateInput } from './schema';
import { TemplateService } from './service';
import { findUidInBlock } from '@/lib/journal/uid';
import {
  setupTestDb,
  teardownTestDb,
  type TestDbContext,
} from '@/lib/test-utils/db';

describe('Phase 4.2 integration', () => {
  let ctx: TestDbContext;
  let repo: TemplateRepository;
  let service: TemplateService;

  beforeEach(async () => {
    ctx = await setupTestDb('tpl-int-');
    await ctx.insertUser('test-user', 'Test', 'test@example.com');
    repo = new TemplateRepository(ctx.db);
    service = new TemplateService(repo);
  });

  afterEach(async () => {
    await teardownTestDb(ctx);
  });

  it('save → list → use → addTransaction round-trip', async () => {
    const userId = 'test-user';
    const input: TemplateInput = {
      name: 'Lunch',
      draft: {
        payee: 'Lunch',
        status: 'none',
        postings: [
          { account: 'Expenses:Food', amount: '10', currency: 'USD' },
          { account: 'Assets:Cash', amount: '-10', currency: 'USD' },
        ],
      },
    };

    const saved = await service.saveOrOverwrite(userId, input);
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;

    const list = await repo.list(userId);
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('Lunch');

    const fetched = await repo.find(userId, saved.template.id);
    expect(fetched?.draft.payee).toBe('Lunch');

    // Simulate the "use" flow: build an addTransaction input from the template
    const { JournalRepository } = await import('@/lib/journal/repository');
    const { JournalService } = await import('@/lib/journal/service');
    const { getJournalDir } = await import('@/lib/journal/layout');
    const journalService = new JournalService(new JournalRepository(ctx.db));
    await fs.mkdir(getJournalDir(userId), { recursive: true });

    const todayISO = new Date().toISOString().slice(0, 10);
    const result = await journalService.addTransaction(userId, {
      date: todayISO,
      payee: fetched!.draft.payee,
      status: fetched!.draft.status,
      note: fetched!.draft.note,
      postings: fetched!.draft.postings,
    });
    expect(result.ok).toBe(true);

    const text = await fs.readFile(
      path.join(getJournalDir(userId), 'main.ledger'),
      'utf-8'
    );
    expect(findUidInBlock(text)).not.toBeNull();
    expect(text).toContain(todayISO);
    expect(text).toContain('Lunch');
  });
});
