import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PasskeyWrapRepository } from './passkeyWrapRepository';
import {
  setupTestDb,
  teardownTestDb,
  type TestDbContext,
} from '@/lib/test-utils/db';

describe('PasskeyWrapRepository', () => {
  let ctx: TestDbContext;
  let repo: PasskeyWrapRepository;

  beforeEach(async () => {
    ctx = await setupTestDb('passkey-wrap-');
    await ctx.insertUser('alice');
    repo = new PasskeyWrapRepository(ctx.db);
  });

  afterEach(async () => {
    await teardownTestDb(ctx);
  });

  const row = (
    over: Partial<Parameters<PasskeyWrapRepository['create']>[0]> = {}
  ) => ({
    id: 'wrap-1',
    userId: 'alice',
    credentialId: 'cred-A',
    wrap: 'd3JhcA==',
    label: 'Laptop',
    ...over,
  });

  it('create → listByUser round-trips', async () => {
    expect(await repo.listByUser('alice')).toEqual([]);
    await repo.create(row());
    const all = await repo.listByUser('alice');
    expect(all).toHaveLength(1);
    expect(all[0].credentialId).toBe('cred-A');
    expect(all[0].label).toBe('Laptop');
  });

  it('supports multiple passkeys per user', async () => {
    await repo.create(row({ id: 'wrap-1', credentialId: 'cred-A' }));
    await repo.create(
      row({ id: 'wrap-2', credentialId: 'cred-B', label: 'Phone' })
    );
    expect(await repo.listByUser('alice')).toHaveLength(2);
  });

  it('create is idempotent per (user, credential) — re-enable updates the wrap', async () => {
    await repo.create(
      row({ id: 'wrap-1', credentialId: 'cred-A', wrap: 'old==' })
    );
    await repo.create(
      row({
        id: 'wrap-2',
        credentialId: 'cred-A',
        wrap: 'new==',
      })
    );
    const all = await repo.listByUser('alice');
    expect(all).toHaveLength(1);
    expect(all[0].wrap).toBe('new==');
  });

  it('deleteByCredential removes only the matching row', async () => {
    await repo.create(row({ id: 'wrap-1', credentialId: 'cred-A' }));
    await repo.create(row({ id: 'wrap-2', credentialId: 'cred-B' }));
    await repo.deleteByCredential('alice', 'cred-A');
    const all = await repo.listByUser('alice');
    expect(all).toHaveLength(1);
    expect(all[0].credentialId).toBe('cred-B');
  });
});
