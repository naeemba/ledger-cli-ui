import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { UserSettingRepository } from './repository';
import {
  setupTestDb,
  teardownTestDb,
  type TestDbContext,
} from '@/lib/test-utils/db';

describe('UserSettingRepository', () => {
  let ctx: TestDbContext;
  let repo: UserSettingRepository;

  beforeEach(async () => {
    ctx = await setupTestDb('settings-');
    await ctx.insertUser('alice', 'Alice', 'alice@example.com');
    repo = new UserSettingRepository(ctx.db);
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
    await ctx.client.query(`DELETE FROM "user" WHERE id = $1`, ['alice']);
    expect(await repo.get('alice')).toBeNull();
  });

  it('upsertEntryTabOrder creates a row on first call', async () => {
    await repo.upsertEntryTabOrder('alice', 'raw,types,form');
    const row = await repo.get('alice');
    expect(row?.entryTabOrder).toBe('raw,types,form');
  });

  it('upsertEntryTabOrder updates in place without clobbering baseCurrency', async () => {
    await repo.upsertBaseCurrency('alice', 'EUR');
    await repo.upsertEntryTabOrder('alice', 'form,raw,types');
    const row = await repo.get('alice');
    expect(row?.entryTabOrder).toBe('form,raw,types');
    expect(row?.baseCurrency).toBe('EUR');
  });
});
