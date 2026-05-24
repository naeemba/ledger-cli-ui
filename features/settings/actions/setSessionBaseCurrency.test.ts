import { describe, it, expect, vi, beforeEach } from 'vitest';

const cookieSet = vi.fn();
const revalidatePath = vi.fn();

vi.mock('next/headers', () => ({
  cookies: async () => ({ set: cookieSet }),
}));

vi.mock('next/cache', () => ({
  revalidatePath: (...a: unknown[]) => revalidatePath(...a),
}));

vi.mock('@/lib/settings', () => ({
  baseCurrencySchema: {
    safeParse: (v: unknown) =>
      typeof v === 'string' && v.trim().length > 0
        ? { success: true, data: v.trim() }
        : { success: false, error: new Error('bad') },
  },
  COOKIE_NAME: 'baseCurrency',
}));

beforeEach(() => {
  cookieSet.mockReset();
  revalidatePath.mockReset();
});

describe('setSessionBaseCurrencyAction', () => {
  it('writes a long-lived lax cookie and revalidates', async () => {
    const { setSessionBaseCurrencyAction } =
      await import('./setSessionBaseCurrency');
    const result = await setSessionBaseCurrencyAction('EUR');
    expect(result).toEqual({ ok: true });
    expect(cookieSet).toHaveBeenCalledWith(
      'baseCurrency',
      'EUR',
      expect.objectContaining({
        maxAge: 60 * 60 * 24 * 365,
        sameSite: 'lax',
        path: '/',
      })
    );
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout');
  });

  it('rejects an invalid value without writing the cookie', async () => {
    vi.resetModules();
    const { setSessionBaseCurrencyAction } =
      await import('./setSessionBaseCurrency');
    const result = await setSessionBaseCurrencyAction('');
    expect(result.ok).toBe(false);
    expect(cookieSet).not.toHaveBeenCalled();
  });
});
