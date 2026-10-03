import { beforeEach, describe, expect, it, vi } from 'vitest';

const { revoke, record } = vi.hoisted(() => ({
  revoke: vi.fn(),
  record: vi.fn(async () => undefined),
}));
vi.mock('@/lib/debt-share', () => ({ debtShareService: { revoke } }));
vi.mock('@/lib/auth/require-user', () => ({
  requireUser: async () => ({ id: 'alice' }),
}));
vi.mock('@/lib/audit', () => ({
  auditService: { record },
  auditRequestMeta: async () => ({}),
}));
vi.mock('@/lib/rate-limit', () => ({
  rateLimit: () => ({ allowed: true }),
  WRITE: 'write',
  RATE_LIMIT_MESSAGE: 'slow down',
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const { revokeDebtShareAction } = await import('./revokeDebtShare');
const shareId = 'A'.repeat(22);

describe('revokeDebtShareAction', () => {
  beforeEach(() => {
    revoke.mockReset();
    record.mockClear();
  });

  it('revokes and audits a success', async () => {
    revoke.mockResolvedValue(true);
    expect(await revokeDebtShareAction(shareId)).toEqual({ ok: true });
    expect(revoke).toHaveBeenCalledWith('alice', shareId);
    expect(record).toHaveBeenCalledWith(
      'alice',
      expect.objectContaining({ action: 'debtShare.revoke', result: 'success' })
    );
  });

  it('reports an already revoked link', async () => {
    revoke.mockResolvedValue(false);
    expect(await revokeDebtShareAction(shareId)).toEqual({
      ok: false,
      error: 'That link was already revoked.',
    });
    expect(record).toHaveBeenCalledWith(
      'alice',
      expect.objectContaining({ result: 'failure' })
    );
  });

  it('rejects a malformed id without calling the service or auditing', async () => {
    for (const bad of ['short', 'x'.repeat(23), 42 as unknown as string]) {
      expect((await revokeDebtShareAction(bad)).ok).toBe(false);
    }
    expect(revoke).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
  });

  it('returns an error instead of throwing when the service fails', async () => {
    revoke.mockRejectedValue(new Error('db down'));
    expect(await revokeDebtShareAction(shareId)).toEqual({
      ok: false,
      error: 'Could not revoke the link. Try again.',
    });
  });
});
