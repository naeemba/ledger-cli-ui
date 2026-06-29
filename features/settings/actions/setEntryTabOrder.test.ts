import { describe, it, expect, vi, beforeEach } from 'vitest';

const requireUser = vi.fn();
const saveEntryTabOrder = vi.fn();
const revalidatePath = vi.fn();

vi.mock('@/lib/auth/require-user', () => ({
  requireUser: () => requireUser(),
}));

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: () => ({ allowed: true }),
  WRITE: 'write',
  RATE_LIMIT_MESSAGE: 'Too many requests.',
}));

vi.mock('@/lib/settings', () => ({
  userSettingService: {
    saveEntryTabOrder: (...a: unknown[]) => saveEntryTabOrder(...a),
  },
}));

vi.mock('next/cache', () => ({
  revalidatePath: (...a: unknown[]) => revalidatePath(...a),
}));

beforeEach(() => {
  requireUser.mockReset();
  saveEntryTabOrder.mockReset();
  revalidatePath.mockReset();
  vi.resetModules();
});

describe('setEntryTabOrderAction', () => {
  it('saves a validated order and revalidates layouts', async () => {
    requireUser.mockResolvedValue({ id: 'alice' });
    const { setEntryTabOrderAction } = await import('./setEntryTabOrder');
    const result = await setEntryTabOrderAction(['raw', 'types', 'form']);
    expect(result).toEqual({ ok: true });
    expect(saveEntryTabOrder).toHaveBeenCalledWith('alice', [
      'raw',
      'types',
      'form',
    ]);
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout');
  });

  it('rejects an order with unknown ids without saving', async () => {
    requireUser.mockResolvedValue({ id: 'alice' });
    const { setEntryTabOrderAction } = await import('./setEntryTabOrder');
    const result = await setEntryTabOrderAction(['raw', 'bogus']);
    expect(result.ok).toBe(false);
    expect(saveEntryTabOrder).not.toHaveBeenCalled();
  });
});
