import { describe, it, expect, vi, beforeEach } from 'vitest';

const cookieGet = vi.fn();
const getOptionalUser = vi.fn();
const repoGet = vi.fn();

vi.mock('next/headers', () => ({
  cookies: async () => ({ get: cookieGet }),
}));

vi.mock('@/lib/auth/require-user', () => ({
  getOptionalUser: () => getOptionalUser(),
}));

vi.mock('./index', () => ({
  userSettingRepository: { get: (id: string) => repoGet(id) },
}));

vi.mock('@/lib/env', () => ({
  env: { DEFAULT_CURRENCY: 'USD' },
}));

beforeEach(() => {
  cookieGet.mockReset();
  getOptionalUser.mockReset();
  repoGet.mockReset();
});

describe('getBaseCurrency', () => {
  it('returns the cookie value when present and valid', async () => {
    cookieGet.mockReturnValue({ value: 'EUR' });
    const { getBaseCurrency } = await import('./getBaseCurrency');
    expect(await getBaseCurrency()).toBe('EUR');
    expect(repoGet).not.toHaveBeenCalled();
    expect(getOptionalUser).not.toHaveBeenCalled();
  });

  it('falls through a malformed cookie to the saved row', async () => {
    cookieGet.mockReturnValue({ value: 'bad\x00ccy' });
    getOptionalUser.mockResolvedValue({ id: 'alice' });
    repoGet.mockResolvedValue({ baseCurrency: 'JPY' });
    vi.resetModules();
    const { getBaseCurrency } = await import('./getBaseCurrency');
    expect(await getBaseCurrency()).toBe('JPY');
  });

  it('returns the saved row when no cookie is set', async () => {
    cookieGet.mockReturnValue(undefined);
    getOptionalUser.mockResolvedValue({ id: 'alice' });
    repoGet.mockResolvedValue({ baseCurrency: 'GBP' });
    vi.resetModules();
    const { getBaseCurrency } = await import('./getBaseCurrency');
    expect(await getBaseCurrency()).toBe('GBP');
  });

  it('falls back to env when no cookie and no saved row', async () => {
    cookieGet.mockReturnValue(undefined);
    getOptionalUser.mockResolvedValue({ id: 'alice' });
    repoGet.mockResolvedValue(null);
    vi.resetModules();
    const { getBaseCurrency } = await import('./getBaseCurrency');
    expect(await getBaseCurrency()).toBe('USD');
  });

  it('falls back to env for unauthenticated requests', async () => {
    cookieGet.mockReturnValue(undefined);
    getOptionalUser.mockResolvedValue(null);
    vi.resetModules();
    const { getBaseCurrency } = await import('./getBaseCurrency');
    expect(await getBaseCurrency()).toBe('USD');
    expect(repoGet).not.toHaveBeenCalled();
  });
});
