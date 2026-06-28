import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

const getMock = vi.fn();
const listByUserMock = vi.fn();
vi.mock('@/lib/auth/require-user', () => ({
  requireUser: vi.fn(async () => ({ id: 'alice' })),
}));
vi.mock('@/lib/crypto', () => ({
  getUserCryptoRepository: () => ({ get: getMock }),
  getPasskeyWrapRepository: () => ({ listByUser: listByUserMock }),
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
    listByUserMock.mockResolvedValue([]);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      passSalt: 's',
      argonParams: { m: 1, t: 1, p: 1 },
      wrapPassphrase: 'wp',
      wrapRecovery: 'wr',
      passkeys: [],
    });
  });
  it('404s when not set up', async () => {
    getMock.mockResolvedValue(null);
    expect((await GET()).status).toBe(404);
  });
  it('projects passkey wraps to strip internal fields', async () => {
    getMock.mockResolvedValue({
      passSalt: 's',
      argonParams: { m: 1, t: 1, p: 1 },
      wrapPassphrase: 'wp',
      wrapRecovery: 'wr',
    });
    listByUserMock.mockResolvedValue([
      {
        id: 'w1',
        userId: 'alice',
        credentialId: 'cred-A',
        wrap: 'd3JhcA==',
        label: 'Laptop',
        createdAt: new Date(),
      },
    ]);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.passkeys).toEqual([
      { credentialId: 'cred-A', wrap: 'd3JhcA==' },
    ]);
    expect(Object.keys(body.passkeys[0]).sort()).toEqual([
      'credentialId',
      'wrap',
    ]);
  });
});
