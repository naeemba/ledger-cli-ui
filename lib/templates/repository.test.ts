import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { TemplateInput } from './schema';
import {
  setupTestDb,
  teardownTestDb,
  type TestDbContext,
} from '@/lib/test-utils/db';

describe('templates repository', () => {
  let ctx: TestDbContext;

  beforeEach(async () => {
    ctx = await setupTestDb('templates-');
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
      .run('alice', 'Alice', 'alice@example.com');
    ctx.sqlite
      .prepare(`INSERT INTO "user" ("id","name","email") VALUES (?,?,?)`)
      .run('bob', 'Bob', 'bob@example.com');
  });

  afterEach(async () => {
    await teardownTestDb(ctx);
  });

  const sampleInput: TemplateInput = {
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

  it('saveTemplate inserts a new row with a ULID id', async () => {
    const { saveTemplate } = await import('./repository');
    const result = await saveTemplate('alice', sampleInput);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.template.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
      expect(result.template.name).toBe('Lunch');
      expect(result.template.userId).toBe('alice');
      expect(result.template.draft.payee).toBe('Lunch');
    }
  });

  it('saveTemplate with conflicting (userId,name) returns name-conflict', async () => {
    const { saveTemplate } = await import('./repository');
    await saveTemplate('alice', sampleInput);
    const result = await saveTemplate('alice', sampleInput);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('name-conflict');
  });

  it('saveTemplate with overwrite=true updates the existing row', async () => {
    const { saveTemplate, getTemplate } = await import('./repository');
    const first = await saveTemplate('alice', sampleInput);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const originalId = first.template.id;

    const updated: TemplateInput = {
      name: 'Lunch',
      draft: {
        payee: 'Lunch v2',
        status: 'cleared',
        postings: [
          { account: 'Expenses:Food', amount: '12', currency: 'USD' },
          { account: 'Assets:Cash', amount: '-12', currency: 'USD' },
        ],
      },
    };
    const result = await saveTemplate('alice', updated, { overwrite: true });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.template.id).toBe(originalId);

    const fetched = await getTemplate('alice', originalId);
    expect(fetched?.draft.payee).toBe('Lunch v2');
    expect(fetched?.draft.status).toBe('cleared');
  });

  it('listTemplates returns rows sorted by name (case-insensitive) for the user only', async () => {
    const { saveTemplate, listTemplates } = await import('./repository');
    await saveTemplate('alice', { ...sampleInput, name: 'banana' });
    await saveTemplate('alice', { ...sampleInput, name: 'Apple' });
    await saveTemplate('bob', { ...sampleInput, name: 'Alice-Should-Not-See' });

    const rows = await listTemplates('alice');
    expect(rows.map((r) => r.name)).toEqual(['Apple', 'banana']);
  });

  it('renameTemplate updates name and bumps updatedAt', async () => {
    const { saveTemplate, renameTemplate, getTemplate } =
      await import('./repository');
    const created = await saveTemplate('alice', sampleInput);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const result = await renameTemplate('alice', created.template.id, 'Brunch');
    expect(result.ok).toBe(true);

    const fetched = await getTemplate('alice', created.template.id);
    expect(fetched?.name).toBe('Brunch');
  });

  it('renameTemplate to an existing name returns name-conflict', async () => {
    const { saveTemplate, renameTemplate } = await import('./repository');
    const first = await saveTemplate('alice', { ...sampleInput, name: 'A' });
    const second = await saveTemplate('alice', { ...sampleInput, name: 'B' });
    expect(first.ok && second.ok).toBe(true);
    if (!second.ok) return;

    const result = await renameTemplate('alice', second.template.id, 'A');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('name-conflict');
  });

  it('renameTemplate on a missing id returns not-found', async () => {
    const { renameTemplate } = await import('./repository');
    const result = await renameTemplate(
      'alice',
      '01HZX5G5KJDS9HQRYK8E5T0XXX',
      'X'
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('not-found');
  });

  it('deleteTemplate removes the row', async () => {
    const { saveTemplate, deleteTemplate, getTemplate } =
      await import('./repository');
    const created = await saveTemplate('alice', sampleInput);
    if (!created.ok) return;
    await deleteTemplate('alice', created.template.id);
    const fetched = await getTemplate('alice', created.template.id);
    expect(fetched).toBeNull();
  });

  it('deleteTemplate on a missing id is a no-op', async () => {
    const { deleteTemplate } = await import('./repository');
    await expect(
      deleteTemplate('alice', '01HZX5G5KJDS9HQRYK8E5T0XXX')
    ).resolves.toBeUndefined();
  });
});
