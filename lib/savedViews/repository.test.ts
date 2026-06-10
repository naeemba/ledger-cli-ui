import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SavedViewRepository } from './repository';
import type { SavedViewInput } from './schema';
import * as schema from '@/db/schema';
import {
  setupTestDb,
  teardownTestDb,
  type TestDbContext,
} from '@/lib/test-utils/db';
import { drizzle } from 'drizzle-orm/better-sqlite3';

const SAVED_VIEW_TABLE = `
  CREATE TABLE IF NOT EXISTS "savedView" (
    "id" text PRIMARY KEY NOT NULL,
    "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
    "name" text NOT NULL,
    "targetPath" text NOT NULL,
    "createdAt" integer NOT NULL DEFAULT (unixepoch()),
    "updatedAt" integer NOT NULL DEFAULT (unixepoch())
  );
  CREATE UNIQUE INDEX IF NOT EXISTS "savedView_user_name"
    ON "savedView"("userId", "name");
`;

const sample: SavedViewInput = {
  name: 'Food',
  targetPath: '/transactions?account=Expenses:Food',
};

describe('SavedViewRepository', () => {
  let ctx: TestDbContext;
  let repo: SavedViewRepository;

  beforeEach(async () => {
    ctx = await setupTestDb('saved-views-');
    ctx.sqlite.exec(SAVED_VIEW_TABLE);
    ctx.sqlite
      .prepare(`INSERT INTO "user" ("id","name","email") VALUES (?,?,?)`)
      .run('alice', 'Alice', 'alice@example.com');
    ctx.sqlite
      .prepare(`INSERT INTO "user" ("id","name","email") VALUES (?,?,?)`)
      .run('bob', 'Bob', 'bob@example.com');
    repo = new SavedViewRepository(drizzle(ctx.sqlite, { schema }));
  });

  afterEach(async () => {
    await teardownTestDb(ctx);
  });

  it('create returns a row with a ULID id', async () => {
    const row = await repo.create('alice', sample);
    expect(row.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(row.name).toBe('Food');
    expect(row.targetPath).toBe('/transactions?account=Expenses:Food');
    expect(row.userId).toBe('alice');
  });

  it('create throws on UNIQUE (userId, name) conflict', async () => {
    await repo.create('alice', sample);
    await expect(repo.create('alice', sample)).rejects.toThrow(
      /UNIQUE constraint failed/i
    );
  });

  it('create succeeds for the same name owned by a different user', async () => {
    await repo.create('alice', sample);
    const bobRow = await repo.create('bob', sample);
    expect(bobRow.userId).toBe('bob');
  });

  it('find returns the row by id for the user', async () => {
    const created = await repo.create('alice', sample);
    const fetched = await repo.find('alice', created.id);
    expect(fetched?.id).toBe(created.id);
  });

  it('find returns null for another user', async () => {
    const created = await repo.create('alice', sample);
    expect(await repo.find('bob', created.id)).toBeNull();
  });

  it('findByName is case-sensitive and user-scoped', async () => {
    await repo.create('alice', sample);
    expect((await repo.findByName('alice', 'Food'))?.name).toBe('Food');
    expect(await repo.findByName('alice', 'food')).toBeNull();
    expect(await repo.findByName('bob', 'Food')).toBeNull();
  });

  it('list orders by lower(name)', async () => {
    await repo.create('alice', { name: 'Zeta', targetPath: '/transactions' });
    await repo.create('alice', { name: 'alpha', targetPath: '/balance' });
    await repo.create('alice', {
      name: 'Mango',
      targetPath: '/payees/2026-01-01/2026-03-31',
    });
    const names = (await repo.list('alice')).map((v) => v.name);
    expect(names).toEqual(['alpha', 'Mango', 'Zeta']);
  });

  it('list returns only the requested user rows', async () => {
    await repo.create('alice', sample);
    await repo.create('bob', { name: 'Bobs', targetPath: '/transactions' });
    expect((await repo.list('alice')).map((v) => v.name)).toEqual(['Food']);
  });

  it('update patches name and bumps updatedAt', async () => {
    const created = await repo.create('alice', sample);
    const before = created.updatedAt.getTime();
    await new Promise((r) => setTimeout(r, 1100)); // unixepoch() = whole seconds
    const updated = await repo.update('alice', created.id, {
      name: 'Groceries',
    });
    expect(updated?.name).toBe('Groceries');
    expect(updated?.updatedAt.getTime()).toBeGreaterThan(before);
  });

  it('update returns null when id does not belong to user', async () => {
    const created = await repo.create('alice', sample);
    expect(await repo.update('bob', created.id, { name: 'X' })).toBeNull();
  });

  it('update throws on UNIQUE conflict when renaming', async () => {
    await repo.create('alice', sample);
    const second = await repo.create('alice', {
      name: 'Other',
      targetPath: '/balance',
    });
    await expect(
      repo.update('alice', second.id, { name: 'Food' })
    ).rejects.toThrow(/UNIQUE constraint failed/i);
  });

  it('delete returns true then false for the same id', async () => {
    const created = await repo.create('alice', sample);
    expect(await repo.delete('alice', created.id)).toBe(true);
    expect(await repo.delete('alice', created.id)).toBe(false);
  });

  it('cascades when the parent user is deleted', async () => {
    await repo.create('alice', sample);
    ctx.sqlite.prepare('DELETE FROM "user" WHERE id = ?').run('alice');
    expect(await repo.list('alice')).toEqual([]);
  });
});
