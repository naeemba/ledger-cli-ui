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

  it('hasMigrated is false until markMigrated stamps the row', async () => {
    await repo.create({
      userId: 'alice',
      wrapPassphrase: 'd2FwUA==',
      passSalt: 'c2FsdA==',
      argonParams: { m: 65536, t: 3, p: 1 },
      wrapRecovery: 'd2FwUg==',
    });
    expect(await repo.hasMigrated('alice')).toBe(false);
    expect((await repo.get('alice'))?.migratedAt).toBeNull();

    await repo.markMigrated('alice');
    expect(await repo.hasMigrated('alice')).toBe(true);
    expect((await repo.get('alice'))?.migratedAt).toBeInstanceOf(Date);
  });

  it('markMigrated is idempotent', async () => {
    await repo.create({
      userId: 'alice',
      wrapPassphrase: 'd2FwUA==',
      passSalt: 'c2FsdA==',
      argonParams: { m: 65536, t: 3, p: 1 },
      wrapRecovery: 'd2FwUg==',
    });
    await repo.markMigrated('alice');
    await repo.markMigrated('alice');
    expect(await repo.hasMigrated('alice')).toBe(true);
  });

  it('updateWrapPassphrase replaces the passphrase wrap fields', async () => {
    await repo.create({
      userId: 'alice',
      wrapPassphrase: 'w1',
      passSalt: 's1',
      argonParams: { m: 65536, t: 3, p: 1 },
      wrapRecovery: 'r1',
    });
    await repo.updateWrapPassphrase('alice', 'w2', 's2', {
      m: 19456,
      t: 2,
      p: 1,
    });
    const row = await repo.get('alice');
    expect(row?.wrapPassphrase).toBe('w2');
    expect(row?.passSalt).toBe('s2');
    expect(row?.argonParams).toEqual({ m: 19456, t: 2, p: 1 });
    expect(row?.wrapRecovery).toBe('r1'); // recovery wrap untouched
  });

  it('updateWrapRecovery replaces the recovery wrap and bumps recoveryCreatedAt', async () => {
    await repo.create({
      userId: 'alice',
      wrapPassphrase: 'w1',
      passSalt: 's1',
      argonParams: { m: 65536, t: 3, p: 1 },
      wrapRecovery: 'r1',
    });
    const before = (await repo.get('alice'))!.recoveryCreatedAt;
    await repo.updateWrapRecovery('alice', 'r2');
    const row = await repo.get('alice');
    expect(row?.wrapRecovery).toBe('r2');
    expect(row?.wrapPassphrase).toBe('w1'); // passphrase wrap untouched
    expect(row!.recoveryCreatedAt.getTime()).toBeGreaterThanOrEqual(
      before.getTime()
    );
  });

  it('delete removes the row', async () => {
    await repo.create({
      userId: 'alice',
      wrapPassphrase: 'w1',
      passSalt: 's1',
      argonParams: { m: 65536, t: 3, p: 1 },
      wrapRecovery: 'r1',
    });
    await repo.delete('alice');
    expect(await repo.exists('alice')).toBe(false);
  });
});
