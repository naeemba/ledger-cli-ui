import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupCrypto } from './setupCrypto';
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

const VALID = {
  wrapPassphrase: 'd2FwUA==',
  passSalt: 'c2FsdA==',
  argonParams: { m: 65536, t: 3, p: 1 },
  wrapRecovery: 'd2FwUg==',
};

describe('setupCrypto', () => {
  let ctx: TestDbContext;
  beforeEach(async () => {
    ctx = await setupTestDb('setup-crypto-');
    await ctx.insertUser('alice');
    repoHolder.repo = new UserCryptoRepository(ctx.db);
  });
  afterEach(async () => {
    await teardownTestDb(ctx);
    vi.clearAllMocks();
  });

  it('creates the userCrypto row', async () => {
    const res = await setupCrypto(VALID);
    expect(res.ok).toBe(true);
    expect(await repoHolder.repo!.exists('alice')).toBe(true);
  });

  it('rejects a second setup', async () => {
    await setupCrypto(VALID);
    const res = await setupCrypto(VALID);
    expect(res.ok).toBe(false);
  });

  it('rejects a malformed payload', async () => {
    const res = await setupCrypto({
      ...VALID,
      argonParams: { m: -1, t: 3, p: 1 },
    });
    expect(res.ok).toBe(false);
  });
});
