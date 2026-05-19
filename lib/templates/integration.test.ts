import { promises as fs } from 'fs';
import path from 'path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { findUidInBlock } from '@/lib/journal/uid';
import type { TemplateInput } from '@/lib/templates/schema';
import {
  setupTestDb,
  teardownTestDb,
  type TestDbContext,
} from '@/lib/test-utils/db';

describe('Phase 4.2 integration', () => {
  let ctx: TestDbContext;

  beforeEach(async () => {
    ctx = await setupTestDb('tpl-int-');
    ctx.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS "template" (
        "id" text PRIMARY KEY NOT NULL,
        "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
        "name" text NOT NULL,
        "draft" text NOT NULL,
        "createdAt" integer NOT NULL DEFAULT (unixepoch()),
        "updatedAt" integer NOT NULL DEFAULT (unixepoch())
      );
      CREATE UNIQUE INDEX IF NOT EXISTS "template_user_name" ON "template"("userId", "name");
    `);
    ctx.sqlite
      .prepare(`INSERT INTO "user" ("id","name","email") VALUES (?,?,?)`)
      .run('test-user', 'Test', 'test@example.com');
  });

  afterEach(async () => {
    await teardownTestDb(ctx);
  });

  it('save → list → use → addTransaction round-trip', async () => {
    const userId = 'test-user';
    const { saveTemplate, listTemplates, getTemplate } =
      await import('@/lib/templates/repository');
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

    const saved = await saveTemplate(userId, input);
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;

    const list = await listTemplates(userId);
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('Lunch');

    const fetched = await getTemplate(userId, saved.template.id);
    expect(fetched?.draft.payee).toBe('Lunch');

    // Simulate the "use" flow: build an addTransaction input from the template
    const { addTransaction, getJournalDir } = await import('@/lib/journals');
    await fs.mkdir(getJournalDir(userId), { recursive: true });

    const todayISO = new Date().toISOString().slice(0, 10);
    const result = await addTransaction(userId, {
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
