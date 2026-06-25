import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { rotateRecoveryAction } from './rotateRecovery';
import { UserCryptoRepository } from '@/lib/crypto';
import {
  setupTestDb,
  teardownTestDb,
  type TestDbContext,
} from '@/lib/test-utils/db';

const repoHolder: { repo: UserCryptoRepository | null } = { repo: null };
vi.mock('@/lib/auth/require-user', () => ({
  requireUser: vi.fn(async () => ({ id: 'alice' })),
}));
vi.mock('@/lib/crypto', async (orig) => ({
  ...(await orig<typeof import('@/lib/crypto')>()),
  getUserCryptoRepository: () => repoHolder.repo,
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const INITIAL = {
  userId: 'alice',
  wrapPassphrase: 'd2FwUA==',
  passSalt: 'c2FsdA==',
  argonParams: { m: 65536, t: 3, p: 1 },
  wrapRecovery: 'd2FwUg==',
};

const NEW_RECOVERY = {
  wrapRecovery: 'bmV3UmVjb3Zlcnk=',
};

describe('rotateRecoveryAction', () => {
  let ctx: TestDbContext;
  beforeEach(async () => {
    ctx = await setupTestDb('rotate-recovery-');
    await ctx.insertUser('alice');
    repoHolder.repo = new UserCryptoRepository(ctx.db);
  });
  afterEach(async () => {
    await teardownTestDb(ctx);
    vi.clearAllMocks();
  });

  it('updates wrapRecovery when row exists', async () => {
    await repoHolder.repo!.create(INITIAL);
    const res = await rotateRecoveryAction(NEW_RECOVERY);
    expect(res.ok).toBe(true);
    const row = await repoHolder.repo!.get('alice');
    expect(row?.wrapRecovery).toBe(NEW_RECOVERY.wrapRecovery);
  });

  it('does not change wrapPassphrase or passSalt when rotating recovery', async () => {
    await repoHolder.repo!.create(INITIAL);
    await rotateRecoveryAction(NEW_RECOVERY);
    const row = await repoHolder.repo!.get('alice');
    expect(row?.wrapPassphrase).toBe(INITIAL.wrapPassphrase);
    expect(row?.passSalt).toBe(INITIAL.passSalt);
    expect(row?.argonParams).toEqual(INITIAL.argonParams);
  });

  it('returns ok:false when no userCrypto row exists', async () => {
    const res = await rotateRecoveryAction(NEW_RECOVERY);
    expect(res.ok).toBe(false);
    expect((res as { ok: false; message: string }).message).toContain(
      'not set up'
    );
  });

  it('returns ok:false for malformed payload (bad base64)', async () => {
    await repoHolder.repo!.create(INITIAL);
    const res = await rotateRecoveryAction({ wrapRecovery: 'not base64!' });
    expect(res.ok).toBe(false);
  });

  it('returns ok:false for over-long wrapRecovery', async () => {
    await repoHolder.repo!.create(INITIAL);
    const res = await rotateRecoveryAction({
      wrapRecovery: 'A'.repeat(513),
    });
    expect(res.ok).toBe(false);
  });

  it('returns ok:false for missing wrapRecovery field', async () => {
    await repoHolder.repo!.create(INITIAL);
    const res = await rotateRecoveryAction({});
    expect(res.ok).toBe(false);
  });
});
