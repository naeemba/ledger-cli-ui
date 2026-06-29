import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { UserSettingRepository } from './repository';
import { UserSettingService } from './service';
import {
  setupTestDb,
  teardownTestDb,
  type TestDbContext,
} from '@/lib/test-utils/db';

describe('UserSettingService', () => {
  let ctx: TestDbContext;
  let service: UserSettingService;

  beforeEach(async () => {
    ctx = await setupTestDb('settings-svc-');
    await ctx.insertUser('alice', 'Alice', 'alice@example.com');
    const repo = new UserSettingRepository(ctx.db);
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

  it('saveEntryTabOrder serializes and round-trips through get', async () => {
    await service.saveEntryTabOrder('alice', ['raw', 'types', 'form']);
    const row = await service.get('alice');
    expect(row?.entryTabOrder).toBe('raw,types,form');
  });
});
