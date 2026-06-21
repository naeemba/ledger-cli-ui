import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as schema from '@/db/schema';
import { SavedViewRepository } from '@/lib/savedViews/repository';
import { SavedViewService } from '@/lib/savedViews/service';
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

describe('saved views integration', () => {
  let ctx: TestDbContext;
  let service: SavedViewService;

  beforeEach(async () => {
    ctx = await setupTestDb('saved-views-integration-');
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

  it('runs through save → list → rename conflict → rename → delete', async () => {
    const saveA = await service.saveOrOverwrite('alice', {
      name: 'Food',
      targetPath: '/transactions?account=Expenses:Food',
    });
    expect(saveA.ok).toBe(true);

    const saveB = await service.saveOrOverwrite('alice', {
      name: 'This quarter',
      targetPath: '/balance/2026-01-01/2026-03-31',
    });
    expect(saveB.ok).toBe(true);

    const list = await service.list('alice');
    expect(list.map((v) => v.name)).toEqual(['Food', 'This quarter']);

    if (!saveB.ok) throw new Error('precondition failed');
    const conflict = await service.rename('alice', saveB.view.id, 'Food');
    expect(conflict).toEqual({ ok: false, reason: 'name-conflict' });

    const renamed = await service.rename('alice', saveB.view.id, 'Q1 2026');
    expect(renamed.ok).toBe(true);

    if (!saveA.ok) throw new Error('precondition failed');
    await service.delete('alice', saveA.view.id);
    expect((await service.list('alice')).map((v) => v.name)).toEqual([
      'Q1 2026',
    ]);
  });
});
