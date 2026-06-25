import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

const getMock = vi.fn();
vi.mock('@/lib/auth/require-user', () => ({
  requireUser: vi.fn(async () => ({ id: 'alice' })),
}));
vi.mock('@/lib/crypto', () => ({
  getUserCryptoRepository: () => ({ get: getMock }),
}));

afterEach(() => vi.clearAllMocks());

describe('GET /api/crypto/material', () => {
  it('returns the opaque material when set up', async () => {
    getMock.mockResolvedValue({
      passSalt: 's',
      argonParams: { m: 1, t: 1, p: 1 },
      wrapPassphrase: 'wp',
      wrapRecovery: 'wr',
    });
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      passSalt: 's',
      argonParams: { m: 1, t: 1, p: 1 },
      wrapPassphrase: 'wp',
      wrapRecovery: 'wr',
    });
  });
  it('404s when not set up', async () => {
    getMock.mockResolvedValue(null);
    expect((await GET()).status).toBe(404);
  });
});
