import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TemplateRepository } from './repository';
import type { TemplateInput } from './schema';
import { TemplateService } from './service';
import * as schema from '@/db/schema';
import {
  setupTestDb,
  teardownTestDb,
  type TestDbContext,
} from '@/lib/test-utils/db';
import { drizzle } from 'drizzle-orm/better-sqlite3';

const TEMPLATE_TABLE = `
  CREATE TABLE IF NOT EXISTS "template" (
    "id" text PRIMARY KEY NOT NULL,
    "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
    "name" text NOT NULL,
    "draft" text NOT NULL,
    "createdAt" integer NOT NULL DEFAULT (unixepoch()),
    "updatedAt" integer NOT NULL DEFAULT (unixepoch())
  );
  CREATE UNIQUE INDEX IF NOT EXISTS "template_user_name" ON "template"("userId", "name");
`;

describe('TemplateService', () => {
  let ctx: TestDbContext;
  let service: TemplateService;
  let repo: TemplateRepository;

  beforeEach(async () => {
    ctx = await setupTestDb('templates-svc-');
    ctx.sqlite.exec(TEMPLATE_TABLE);
    ctx.sqlite
      .prepare(`INSERT INTO "user" ("id","name","email") VALUES (?,?,?)`)
      .run('alice', 'Alice', 'alice@example.com');
    repo = new TemplateRepository(drizzle(ctx.sqlite, { schema }));
    service = new TemplateService(repo);
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

  describe('saveOrOverwrite', () => {
    it('inserts a new template when no name conflict', async () => {
      const result = await service.saveOrOverwrite('alice', sampleInput);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.template.name).toBe('Lunch');
    });

    it('returns name-conflict when a template with the same name exists', async () => {
      await service.saveOrOverwrite('alice', sampleInput);
      const result = await service.saveOrOverwrite('alice', sampleInput);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe('name-conflict');
    });

    it('updates the existing row when overwrite=true', async () => {
      const first = await service.saveOrOverwrite('alice', sampleInput);
      if (!first.ok) throw new Error('expected ok');
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
      const result = await service.saveOrOverwrite('alice', updated, {
        overwrite: true,
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.template.id).toBe(originalId);
        expect(result.template.draft.payee).toBe('Lunch v2');
      }
    });
  });

  describe('rename', () => {
    it('renames an existing template', async () => {
      const created = await repo.save('alice', sampleInput);
      const result = await service.rename('alice', created.id, 'Brunch');
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.template.name).toBe('Brunch');
    });

    it('returns name-conflict when the new name is taken', async () => {
      await repo.save('alice', { ...sampleInput, name: 'A' });
      const second = await repo.save('alice', { ...sampleInput, name: 'B' });
      const result = await service.rename('alice', second.id, 'A');
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe('name-conflict');
    });

    it('returns not-found when the id does not belong to the user', async () => {
      const result = await service.rename('alice', 'missing-id', 'X');
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe('not-found');
    });
  });
});
