import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { confirmEncryptionResetAction } from './confirmEncryptionReset';
import type { VerifyResult } from '@/lib/crypto/resetChallenge';
import {
  setupTestDb,
  teardownTestDb,
  type TestDbContext,
} from '@/lib/test-utils/db';

vi.mock('@/lib/auth/require-user', () => ({
  requireUser: vi.fn(async () => ({ id: 'alice', email: 'alice@example.com' })),
}));

const { mockVerifyAndReset, mockRateLimit, mockRevalidatePath } = vi.hoisted(
  () => ({
    mockVerifyAndReset: vi.fn(async (): Promise<VerifyResult> => ({
      ok: true,
    })),
    mockRateLimit: vi.fn(() => ({ allowed: true })),
    mockRevalidatePath: vi.fn(),
  })
);

vi.mock('@/lib/crypto/resetChallenge', () => ({
  encryptionResetService: { verifyAndReset: mockVerifyAndReset },
  resetCodeSchema: {
    safeParse: (v: unknown) => {
      if (typeof v === 'string' && /^\d{6}$/.test(v.trim())) {
        return { success: true, data: v.trim() };
      }
      return { success: false };
    },
  },
}));
vi.mock('@/lib/rate-limit', async (orig) => ({
  ...(await orig<typeof import('@/lib/rate-limit')>()),
  rateLimit: mockRateLimit,
}));
vi.mock('next/cache', () => ({ revalidatePath: mockRevalidatePath }));

describe('confirmEncryptionResetAction', () => {
  let ctx: TestDbContext;

  beforeEach(async () => {
    ctx = await setupTestDb('conf-enc-reset-');
    await ctx.insertUser('alice', 'Alice', 'alice@example.com');
    mockVerifyAndReset.mockClear();
    mockRateLimit.mockReturnValue({ allowed: true });
    mockRevalidatePath.mockClear();
  });

  afterEach(async () => {
    await teardownTestDb(ctx);
    vi.clearAllMocks();
  });

  it('returns too-many-attempts when rate limit is exceeded', async () => {
    mockRateLimit.mockReturnValue({ allowed: false });
    const res = await confirmEncryptionResetAction('123456');
    expect(res).toEqual({ ok: false, reason: 'too-many-attempts' });
    expect(mockVerifyAndReset).not.toHaveBeenCalled();
  });

  it('returns invalid when code fails schema validation', async () => {
    const res = await confirmEncryptionResetAction('bad');
    expect(res).toEqual({ ok: false, reason: 'invalid', remaining: 0 });
    expect(mockVerifyAndReset).not.toHaveBeenCalled();
  });

  it('returns invalid when code is not a string', async () => {
    const res = await confirmEncryptionResetAction(12345);
    expect(res).toEqual({ ok: false, reason: 'invalid', remaining: 0 });
    expect(mockVerifyAndReset).not.toHaveBeenCalled();
  });

  it('calls verifyAndReset and revalidatePath on a valid code', async () => {
    const res = await confirmEncryptionResetAction('123456');
    expect(mockVerifyAndReset).toHaveBeenCalledWith('alice', '123456');
    expect(mockRevalidatePath).toHaveBeenCalledWith('/', 'layout');
    expect(res).toEqual({ ok: true });
  });

  it('does not revalidatePath when verifyAndReset returns failure', async () => {
    mockVerifyAndReset.mockResolvedValueOnce({
      ok: false,
      reason: 'invalid',
      remaining: 3,
    });
    const res = await confirmEncryptionResetAction('123456');
    expect(mockRevalidatePath).not.toHaveBeenCalled();
    expect(res).toEqual({ ok: false, reason: 'invalid', remaining: 3 });
  });

  it('forwards no-code result from verifyAndReset', async () => {
    mockVerifyAndReset.mockResolvedValueOnce({ ok: false, reason: 'no-code' });
    const res = await confirmEncryptionResetAction('123456');
    expect(res).toEqual({ ok: false, reason: 'no-code' });
  });

  it('forwards expired result from verifyAndReset', async () => {
    mockVerifyAndReset.mockResolvedValueOnce({ ok: false, reason: 'expired' });
    const res = await confirmEncryptionResetAction('123456');
    expect(res).toEqual({ ok: false, reason: 'expired' });
  });
});
