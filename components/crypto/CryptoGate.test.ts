import { describe, it, expect, vi, beforeEach } from 'vitest';

const headerStore = new Map<string, string>();
const redirectMock = vi.fn((_dest: string): never => {
  // Mirror Next's redirect(), which throws to halt rendering.
  throw new Error('NEXT_REDIRECT');
});
const getOptionalUser = vi.fn();
const cryptoStatus = vi.fn();

vi.mock('next/headers', () => ({
  headers: async () => new Headers(Object.fromEntries(headerStore)),
}));
vi.mock('next/navigation', () => ({
  redirect: (dest: string) => redirectMock(dest),
}));
vi.mock('@/lib/auth/require-user', () => ({
  getOptionalUser: () => getOptionalUser(),
}));
vi.mock('@/lib/crypto/gate', () => ({
  cryptoStatus: (id: string) => cryptoStatus(id),
}));

const setHeaders = (h: Record<string, string>) => {
  headerStore.clear();
  for (const [k, v] of Object.entries(h)) headerStore.set(k, v);
};

beforeEach(() => {
  redirectMock.mockClear();
  getOptionalUser.mockReset();
  cryptoStatus.mockReset();
  getOptionalUser.mockResolvedValue({ id: 'u1', email: 'u@e.co' });
});

describe('CryptoGate', () => {
  it('redirects a locked user to /crypto/unlock on a real navigation', async () => {
    setHeaders({ 'x-pathname': '/dashboard', 'RSC': '1' });
    cryptoStatus.mockResolvedValue('locked');
    const { CryptoGate } = await import('./CryptoGate');
    await expect(CryptoGate()).rejects.toThrow('NEXT_REDIRECT');
    expect(redirectMock).toHaveBeenCalledWith('/crypto/unlock');
  });

  it('does NOT redirect a locked user on a prefetch request (avoids the _rsc storm)', async () => {
    setHeaders({
      'x-pathname': '/dashboard',
      'RSC': '1',
      'next-router-prefetch': '1',
    });
    cryptoStatus.mockResolvedValue('locked');
    const { CryptoGate } = await import('./CryptoGate');
    await expect(CryptoGate()).resolves.toBeNull();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it('does NOT redirect an unset user on a prefetch request', async () => {
    setHeaders({ 'x-pathname': '/dashboard', 'purpose': 'prefetch' });
    cryptoStatus.mockResolvedValue('unset');
    const { CryptoGate } = await import('./CryptoGate');
    await expect(CryptoGate()).resolves.toBeNull();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it('is a no-op on the unlock page itself', async () => {
    setHeaders({ 'x-pathname': '/crypto/unlock' });
    cryptoStatus.mockResolvedValue('locked');
    const { CryptoGate } = await import('./CryptoGate');
    await expect(CryptoGate()).resolves.toBeNull();
    expect(redirectMock).not.toHaveBeenCalled();
  });
});
