import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { changePassphraseAction } from './changePassphrase';
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

const NEW_WRAP = {
  wrapPassphrase: 'bmV3V3JhcA==',
  passSalt: 'bmV3U2FsdA==',
  argonParams: { m: 131072, t: 4, p: 2 },
};

describe('changePassphraseAction', () => {
  let ctx: TestDbContext;
  beforeEach(async () => {
    ctx = await setupTestDb('change-passphrase-');
    await ctx.insertUser('alice');
    repoHolder.repo = new UserCryptoRepository(ctx.db);
  });
  afterEach(async () => {
    await teardownTestDb(ctx);
    vi.clearAllMocks();
  });

  it('updates wrapPassphrase, passSalt, argonParams when row exists', async () => {
    await repoHolder.repo!.create(INITIAL);
    const res = await changePassphraseAction(NEW_WRAP);
    expect(res.ok).toBe(true);
    const row = await repoHolder.repo!.get('alice');
    expect(row?.wrapPassphrase).toBe(NEW_WRAP.wrapPassphrase);
    expect(row?.passSalt).toBe(NEW_WRAP.passSalt);
    expect(row?.argonParams).toEqual(NEW_WRAP.argonParams);
  });

  it('does not change wrapRecovery when updating passphrase', async () => {
    await repoHolder.repo!.create(INITIAL);
    await changePassphraseAction(NEW_WRAP);
    const row = await repoHolder.repo!.get('alice');
    expect(row?.wrapRecovery).toBe(INITIAL.wrapRecovery);
  });

  it('returns ok:false when no userCrypto row exists', async () => {
    const res = await changePassphraseAction(NEW_WRAP);
    expect(res.ok).toBe(false);
    expect((res as { ok: false; message: string }).message).toContain(
      'not set up'
    );
  });

  it('returns ok:false for malformed payload (bad base64)', async () => {
    await repoHolder.repo!.create(INITIAL);
    const res = await changePassphraseAction({
      ...NEW_WRAP,
      wrapPassphrase: 'not base64!',
    });
    expect(res.ok).toBe(false);
  });

  it('returns ok:false for malformed payload (invalid argonParams)', async () => {
    await repoHolder.repo!.create(INITIAL);
    const res = await changePassphraseAction({
      ...NEW_WRAP,
      argonParams: { m: -1, t: 3, p: 1 },
    });
    expect(res.ok).toBe(false);
  });

  it('returns ok:false for over-long passSalt', async () => {
    await repoHolder.repo!.create(INITIAL);
    const res = await changePassphraseAction({
      ...NEW_WRAP,
      passSalt: 'A'.repeat(65),
    });
    expect(res.ok).toBe(false);
  });
});
