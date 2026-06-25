import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { UserCryptoRepository } from './userCryptoRepository';
import {
  setupTestDb,
  teardownTestDb,
  type TestDbContext,
} from '@/lib/test-utils/db';

describe('UserCryptoRepository', () => {
  let ctx: TestDbContext;
  let repo: UserCryptoRepository;

  beforeEach(async () => {
    ctx = await setupTestDb('user-crypto-');
    await ctx.insertUser('alice');
    repo = new UserCryptoRepository(ctx.db);
  });

  afterEach(async () => {
    await teardownTestDb(ctx);
  });

  it('create → get → exists round-trips', async () => {
    expect(await repo.exists('alice')).toBe(false);
    await repo.create({
      userId: 'alice',
      wrapPassphrase: 'd2FwUA==',
      passSalt: 'c2FsdA==',
      argonParams: { m: 65536, t: 3, p: 1 },
      wrapRecovery: 'd2FwUg==',
    });
    expect(await repo.exists('alice')).toBe(true);
    const row = await repo.get('alice');
    expect(row?.wrapPassphrase).toBe('d2FwUA==');
    expect(row?.argonParams).toEqual({ m: 65536, t: 3, p: 1 });
    expect(row?.kdfVersion).toBe(1);
  });

  it('exists is false for an unknown user', async () => {
    expect(await repo.exists('nobody')).toBe(false);
  });
});
