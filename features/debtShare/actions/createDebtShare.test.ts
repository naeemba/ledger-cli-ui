import { beforeEach, describe, expect, it, vi } from 'vitest';

const { create, hasSessionDek, pull, order } = vi.hoisted(() => ({
  create: vi.fn(),
  hasSessionDek: vi.fn(),
  pull: vi.fn(async () => ({ fingerprint: 'f' })),
  order: [] as string[],
}));
vi.mock('@/lib/debt-share', () => ({ debtShareService: { create } }));
vi.mock('@/lib/auth/require-user', () => ({
  requireUser: async () => ({ id: 'alice' }),
}));
vi.mock('@/lib/crypto/sessionKeys', () => ({ hasSessionDek }));
vi.mock('@/lib/storage/sync', () => ({ pull }));
vi.mock('@/lib/journal/mutex', () => ({
  withUserLock: async (_userId: string, work: () => Promise<unknown>) => {
    order.push('lock');
    try {
      return await work();
    } finally {
      order.push('unlock');
    }
  },
}));
vi.mock('@/lib/audit', () => ({
  auditService: { record: vi.fn() },
  auditRequestMeta: async () => ({}),
}));
vi.mock('@/lib/rate-limit', () => ({
  rateLimit: () => ({ allowed: true }),
  WRITE: 'write',
  RATE_LIMIT_MESSAGE: 'slow down',
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const { createDebtShareAction } = await import('./createDebtShare');

describe('createDebtShareAction', () => {
  beforeEach(() => {
    create.mockReset();
    order.length = 0;
    pull.mockImplementation(async () => {
      order.push('pull');
      return { fingerprint: 'f' };
    });
    create.mockImplementation(async () => {
      order.push('create');
      return { shareId: 's1', key: 'k', updatedAt: new Date() };
    });
    pull.mockClear();
    hasSessionDek.mockReturnValue(true);
  });

  it('pulls the journal, then creates the share', async () => {
    expect(await createDebtShareAction('Bashir', ' Naeem ')).toEqual({
      ok: true,
      shareId: 's1',
      key: 'k',
    });
    expect(order).toEqual(['lock', 'pull', 'create', 'unlock']);
    expect(pull).toHaveBeenCalledWith('alice');
    expect(create).toHaveBeenCalledWith('alice', 'Bashir', 'Naeem');
  });

  it('rejects an empty or overlong display name and a flag-like person', async () => {
    expect((await createDebtShareAction('Bashir', '  ')).ok).toBe(false);
    expect((await createDebtShareAction('Bashir', 'x'.repeat(61))).ok).toBe(
      false
    );
    expect(
      (await createDebtShareAction('--file=/etc/passwd', 'Naeem')).ok
    ).toBe(false);
    expect(create).not.toHaveBeenCalled();
  });

  it('asks to unlock when locked', async () => {
    hasSessionDek.mockReturnValue(false);
    expect(await createDebtShareAction('Bashir', 'Naeem')).toEqual({
      ok: false,
      error: 'Unlock your journal first.',
    });
  });

  it('reports a failure without throwing', async () => {
    create.mockRejectedValue(new Error('ledger broke'));
    expect(await createDebtShareAction('Bashir', 'Naeem')).toEqual({
      ok: false,
      error: 'Could not create the link. Try again.',
    });
  });
});
