import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { UserSettingRepository } from './repository';
import * as schema from '@/db/schema';
import {
  setupTestDb,
  teardownTestDb,
  type TestDbContext,
} from '@/lib/test-utils/db';
import { drizzle } from 'drizzle-orm/better-sqlite3';

const USER_SETTING_TABLE = `
  CREATE TABLE IF NOT EXISTS "userSetting" (
    "userId" text PRIMARY KEY NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
    "baseCurrency" text NOT NULL,
    "updatedAt" integer NOT NULL DEFAULT (unixepoch())
  );
`;

describe('UserSettingRepository', () => {
  let ctx: TestDbContext;
  let repo: UserSettingRepository;

  beforeEach(async () => {
    ctx = await setupTestDb('settings-');
    ctx.sqlite.exec(USER_SETTING_TABLE);
    ctx.sqlite
      .prepare(`INSERT INTO "user" ("id","name","email") VALUES (?,?,?)`)
      .run('alice', 'Alice', 'alice@example.com');
    repo = new UserSettingRepository(drizzle(ctx.sqlite, { schema }));
  });

  afterEach(async () => {
    await teardownTestDb(ctx);
  });

  it('get returns null when no row', async () => {
    expect(await repo.get('alice')).toBeNull();
  });

  it('upsert creates a row on first call', async () => {
    await repo.upsertBaseCurrency('alice', 'EUR');
    const row = await repo.get('alice');
    expect(row?.baseCurrency).toBe('EUR');
    expect(row?.userId).toBe('alice');
  });

  it('upsert updates an existing row in place', async () => {
    await repo.upsertBaseCurrency('alice', 'EUR');
    await repo.upsertBaseCurrency('alice', 'JPY');
    const row = await repo.get('alice');
    expect(row?.baseCurrency).toBe('JPY');
  });

  it('cascade-deletes when the user row is deleted', async () => {
    await repo.upsertBaseCurrency('alice', 'EUR');
    ctx.sqlite.prepare(`DELETE FROM "user" WHERE id = ?`).run('alice');
    expect(await repo.get('alice')).toBeNull();
  });
});
