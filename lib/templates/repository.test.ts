import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TemplateRepository } from './repository';
import type { TemplateInput } from './schema';
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

describe('TemplateRepository', () => {
  let ctx: TestDbContext;
  let repo: TemplateRepository;

  beforeEach(async () => {
    ctx = await setupTestDb('templates-');
    ctx.sqlite.exec(TEMPLATE_TABLE);
    ctx.sqlite
      .prepare(`INSERT INTO "user" ("id","name","email") VALUES (?,?,?)`)
      .run('alice', 'Alice', 'alice@example.com');
    ctx.sqlite
      .prepare(`INSERT INTO "user" ("id","name","email") VALUES (?,?,?)`)
      .run('bob', 'Bob', 'bob@example.com');
    repo = new TemplateRepository(drizzle(ctx.sqlite, { schema }));
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

  it('save inserts a new row with a ULID id', async () => {
    const row = await repo.save('alice', sampleInput);
    expect(row.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(row.name).toBe('Lunch');
    expect(row.userId).toBe('alice');
    expect(row.draft.payee).toBe('Lunch');
  });

  it('save throws on UNIQUE (userId, name) conflict', async () => {
    await repo.save('alice', sampleInput);
    await expect(repo.save('alice', sampleInput)).rejects.toThrow(
      /UNIQUE constraint failed/i
    );
  });

  it('find returns the row by id for the user', async () => {
    const created = await repo.save('alice', sampleInput);
    const fetched = await repo.find('alice', created.id);
    expect(fetched?.id).toBe(created.id);
  });

  it('find returns null when the id belongs to another user', async () => {
    const created = await repo.save('alice', sampleInput);
    expect(await repo.find('bob', created.id)).toBeNull();
  });

  it('findByName returns the row for (userId, name)', async () => {
    await repo.save('alice', sampleInput);
    const fetched = await repo.findByName('alice', 'Lunch');
    expect(fetched?.name).toBe('Lunch');
  });

  it('findByName returns null for an unknown name', async () => {
    expect(await repo.findByName('alice', 'Nope')).toBeNull();
  });

  it('list returns rows sorted by name (case-insensitive), filtered by user', async () => {
    await repo.save('alice', { ...sampleInput, name: 'banana' });
    await repo.save('alice', { ...sampleInput, name: 'Apple' });
    await repo.save('bob', { ...sampleInput, name: 'Alice-Should-Not-See' });
    const rows = await repo.list('alice');
    expect(rows.map((r) => r.name)).toEqual(['Apple', 'banana']);
  });

  it('update sets new name and/or draft and bumps updatedAt', async () => {
    const created = await repo.save('alice', sampleInput);
    const updated = await repo.update('alice', created.id, { name: 'Brunch' });
    expect(updated?.name).toBe('Brunch');
    expect(updated?.id).toBe(created.id);
  });

  it('update returns null when the id is not found for the user', async () => {
    const result = await repo.update('alice', 'missing-id', { name: 'X' });
    expect(result).toBeNull();
  });

  it('update throws on UNIQUE conflict when changing name', async () => {
    await repo.save('alice', { ...sampleInput, name: 'A' });
    const second = await repo.save('alice', { ...sampleInput, name: 'B' });
    await expect(
      repo.update('alice', second.id, { name: 'A' })
    ).rejects.toThrow(/UNIQUE constraint failed/i);
  });

  it('delete removes the row', async () => {
    const created = await repo.save('alice', sampleInput);
    await repo.delete('alice', created.id);
    expect(await repo.find('alice', created.id)).toBeNull();
  });

  it('delete on a missing id is a no-op', async () => {
    await expect(repo.delete('alice', 'missing-id')).resolves.toBeUndefined();
  });
});
