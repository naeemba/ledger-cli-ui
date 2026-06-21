import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SavedViewRepository } from './repository';
import { SavedViewService } from './service';
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

describe('SavedViewService', () => {
  let ctx: TestDbContext;
  let service: SavedViewService;

  beforeEach(async () => {
    ctx = await setupTestDb('saved-views-svc-');
    ctx.sqlite.exec(SAVED_VIEW_TABLE);
    ctx.sqlite
      .prepare(`INSERT INTO "user" ("id","name","email") VALUES (?,?,?)`)
      .run('alice', 'Alice', 'alice@example.com');
    const repo = new SavedViewRepository(drizzle(ctx.sqlite, { schema }));
    service = new SavedViewService(repo);
  });

  afterEach(async () => {
    await teardownTestDb(ctx);
  });

  it('saveOrOverwrite happy path returns ok:true', async () => {
    const result = await service.saveOrOverwrite('alice', {
      name: 'Food',
      targetPath: '/transactions?account=Expenses:Food',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.view.name).toBe('Food');
    }
  });

  it('saveOrOverwrite returns name-conflict on duplicate name', async () => {
    await service.saveOrOverwrite('alice', {
      name: 'Food',
      targetPath: '/transactions',
    });
    const result = await service.saveOrOverwrite('alice', {
      name: 'Food',
      targetPath: '/balance',
    });
    expect(result).toEqual({ ok: false, reason: 'name-conflict' });
  });

  it('saveOrOverwrite with overwrite:true replaces the existing row', async () => {
    const first = await service.saveOrOverwrite('alice', {
      name: 'Food',
      targetPath: '/transactions',
    });
    if (!first.ok) throw new Error('precondition failed');
    const firstId = first.view.id;
    const firstCreatedAt = first.view.createdAt.getTime();
    await new Promise((r) => setTimeout(r, 1100));

    const result = await service.saveOrOverwrite(
      'alice',
      { name: 'Food', targetPath: '/balance' },
      { overwrite: true }
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.view.id).toBe(firstId);
      expect(result.view.createdAt.getTime()).toBe(firstCreatedAt);
      expect(result.view.targetPath).toBe('/balance');
      expect(result.view.updatedAt.getTime()).toBeGreaterThan(firstCreatedAt);
    }
  });

  it('rename happy path', async () => {
    const saved = await service.saveOrOverwrite('alice', {
      name: 'Food',
      targetPath: '/transactions',
    });
    if (!saved.ok) throw new Error('precondition failed');
    const result = await service.rename('alice', saved.view.id, 'Groceries');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.view.name).toBe('Groceries');
  });

  it('rename returns name-conflict when target name exists', async () => {
    await service.saveOrOverwrite('alice', {
      name: 'A',
      targetPath: '/balance',
    });
    const b = await service.saveOrOverwrite('alice', {
      name: 'B',
      targetPath: '/transactions',
    });
    if (!b.ok) throw new Error('precondition failed');
    expect(await service.rename('alice', b.view.id, 'A')).toEqual({
      ok: false,
      reason: 'name-conflict',
    });
  });

  it('rename returns not-found for unknown id', async () => {
    expect(await service.rename('alice', 'nope', 'X')).toEqual({
      ok: false,
      reason: 'not-found',
    });
  });

  it('delete is a silent no-op for unknown id', async () => {
    await expect(service.delete('alice', 'nope')).resolves.toBeUndefined();
  });

  it('delete removes the row', async () => {
    const saved = await service.saveOrOverwrite('alice', {
      name: 'Food',
      targetPath: '/transactions',
    });
    if (!saved.ok) throw new Error('precondition failed');
    await service.delete('alice', saved.view.id);
    expect(await service.list('alice')).toEqual([]);
  });
});
