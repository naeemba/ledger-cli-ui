import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { requestEncryptionResetAction } from './requestEncryptionReset';
import { UserCryptoRepository } from '@/lib/crypto';
import type { IssueResult } from '@/lib/crypto/resetChallenge';
import {
  setupTestDb,
  teardownTestDb,
  type TestDbContext,
} from '@/lib/test-utils/db';

// Fake user backed by real test DB
const repoHolder: { repo: UserCryptoRepository | null } = { repo: null };
vi.mock('@/lib/auth/require-user', () => ({
  requireUser: vi.fn(async () => ({ id: 'alice', email: 'alice@example.com' })),
}));
vi.mock('@/lib/crypto', async (orig) => ({
  ...(await orig<typeof import('@/lib/crypto')>()),
  getUserCryptoRepository: () => repoHolder.repo,
}));

// Use vi.hoisted so the mock factory can reference these before variable init
const { mockIssueCode, mockRateLimit } = vi.hoisted(() => ({
  mockIssueCode: vi.fn(async (): Promise<IssueResult> => ({ ok: true })),
  mockRateLimit: vi.fn(() => ({ allowed: true })),
}));

vi.mock('@/lib/crypto/resetChallenge', () => ({
  encryptionResetService: { issueCode: mockIssueCode },
}));
vi.mock('@/lib/rate-limit', async (orig) => ({
  ...(await orig<typeof import('@/lib/rate-limit')>()),
  rateLimit: mockRateLimit,
}));

const INITIAL_CRYPTO = {
  userId: 'alice',
  wrapPassphrase: 'd2FwUA==',
  passSalt: 'c2FsdA==',
  argonParams: { m: 65536, t: 3, p: 1 },
  wrapRecovery: 'd2FwUg==',
};

describe('requestEncryptionResetAction', () => {
  let ctx: TestDbContext;

  beforeEach(async () => {
    ctx = await setupTestDb('req-enc-reset-');
    await ctx.insertUser('alice', 'Alice', 'alice@example.com');
    repoHolder.repo = new UserCryptoRepository(ctx.db);
    mockIssueCode.mockClear();
    mockRateLimit.mockReturnValue({ allowed: true });
  });

  afterEach(async () => {
    await teardownTestDb(ctx);
    vi.clearAllMocks();
  });

  it('returns throttled when rate limit is exceeded', async () => {
    mockRateLimit.mockReturnValue({ allowed: false });
    await repoHolder.repo!.create(INITIAL_CRYPTO);
    const res = await requestEncryptionResetAction();
    expect(res).toEqual({ ok: false, reason: 'throttled' });
    expect(mockIssueCode).not.toHaveBeenCalled();
  });

  it('returns not-set-up when no userCrypto row exists', async () => {
    const res = await requestEncryptionResetAction();
    expect(res).toEqual({ ok: false, reason: 'not-set-up' });
    expect(mockIssueCode).not.toHaveBeenCalled();
  });

  it('calls issueCode and returns its result when crypto row exists', async () => {
    await repoHolder.repo!.create(INITIAL_CRYPTO);
    const res = await requestEncryptionResetAction();
    expect(mockIssueCode).toHaveBeenCalledWith('alice', 'alice@example.com');
    expect(res).toEqual({ ok: true });
  });

  it('forwards throttled result from issueCode', async () => {
    await repoHolder.repo!.create(INITIAL_CRYPTO);
    mockIssueCode.mockResolvedValueOnce({ ok: false, reason: 'throttled' });
    const res = await requestEncryptionResetAction();
    expect(res).toEqual({ ok: false, reason: 'throttled' });
  });
});
