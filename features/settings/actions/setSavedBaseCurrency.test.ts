import { describe, it, expect, vi, beforeEach } from 'vitest';

const requireUser = vi.fn();
const saveBaseCurrency = vi.fn();
const revalidatePath = vi.fn();

vi.mock('@/lib/auth/require-user', () => ({
  requireUser: () => requireUser(),
}));

vi.mock('@/lib/settings', () => ({
  userSettingService: {
    saveBaseCurrency: (...a: unknown[]) => saveBaseCurrency(...a),
  },
  baseCurrencySchema: {
    safeParse: (v: unknown) =>
      typeof v === 'string' && v.trim().length > 0
        ? { success: true, data: v.trim() }
        : { success: false, error: new Error('bad') },
  },
}));

vi.mock('next/cache', () => ({
  revalidatePath: (...a: unknown[]) => revalidatePath(...a),
}));

beforeEach(() => {
  requireUser.mockReset();
  saveBaseCurrency.mockReset();
  revalidatePath.mockReset();
});

describe('setSavedBaseCurrencyAction', () => {
  it('saves the validated value and revalidates layouts', async () => {
    requireUser.mockResolvedValue({ id: 'alice' });
    const { setSavedBaseCurrencyAction } =
      await import('./setSavedBaseCurrency');
    const result = await setSavedBaseCurrencyAction('EUR');
    expect(result).toEqual({ ok: true });
    expect(saveBaseCurrency).toHaveBeenCalledWith('alice', 'EUR');
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout');
  });

  it('rejects an empty value without saving', async () => {
    requireUser.mockResolvedValue({ id: 'alice' });
    vi.resetModules();
    const { setSavedBaseCurrencyAction } =
      await import('./setSavedBaseCurrency');
    const result = await setSavedBaseCurrencyAction('');
    expect(result.ok).toBe(false);
    expect(saveBaseCurrency).not.toHaveBeenCalled();
  });
});
