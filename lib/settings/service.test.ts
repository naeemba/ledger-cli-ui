import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { UserSettingRepository } from './repository';
import { UserSettingService } from './service';
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

describe('UserSettingService', () => {
  let ctx: TestDbContext;
  let service: UserSettingService;

  beforeEach(async () => {
    ctx = await setupTestDb('settings-svc-');
    ctx.sqlite.exec(USER_SETTING_TABLE);
    ctx.sqlite
      .prepare(`INSERT INTO "user" ("id","name","email") VALUES (?,?,?)`)
      .run('alice', 'Alice', 'alice@example.com');
    const repo = new UserSettingRepository(drizzle(ctx.sqlite, { schema }));
    service = new UserSettingService(repo);
  });

  afterEach(async () => {
    await teardownTestDb(ctx);
  });

  it('saveBaseCurrency round-trips through get', async () => {
    await service.saveBaseCurrency('alice', 'EUR');
    const row = await service.get('alice');
    expect(row?.baseCurrency).toBe('EUR');
  });
});
