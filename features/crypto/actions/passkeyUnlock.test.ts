import { beforeEach, describe, expect, it, vi } from 'vitest';
import { disablePasskeyUnlockAction } from './disablePasskeyUnlock';
import { enablePasskeyUnlockAction } from './enablePasskeyUnlock';

const exists = vi.fn();
const create = vi.fn();
const deleteByCredential = vi.fn();
const allowed = vi.fn(() => ({ allowed: true }));

vi.mock('@/lib/auth/require-user', () => ({
  requireUser: async () => ({ id: 'alice' }),
}));
vi.mock('@/lib/crypto', () => ({
  getUserCryptoRepository: () => ({ exists }),
  getPasskeyWrapRepository: () => ({ create, deleteByCredential }),
}));
vi.mock('@/lib/rate-limit', () => ({
  rateLimit: () => allowed(),
  WRITE: { name: 'write' },
  RATE_LIMIT_MESSAGE: 'slow down',
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const validEnable = {
  credentialId: 'cred-A',
  wrap: 'd3JhcA==',
  label: 'Laptop',
};

beforeEach(() => {
  vi.clearAllMocks();
  exists.mockResolvedValue(true);
  allowed.mockReturnValue({ allowed: true });
});

describe('enablePasskeyUnlockAction', () => {
  it('creates a wrap for a valid request', async () => {
    const res = await enablePasskeyUnlockAction(validEnable);
    expect(res).toEqual({ ok: true });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'alice',
        credentialId: 'cred-A',
        label: 'Laptop',
      })
    );
  });

  it('rejects when encryption is not set up', async () => {
    exists.mockResolvedValue(false);
    expect(await enablePasskeyUnlockAction(validEnable)).toMatchObject({
      ok: false,
    });
    expect(create).not.toHaveBeenCalled();
  });

  it('rejects invalid input', async () => {
    expect(await enablePasskeyUnlockAction({ credentialId: '' })).toMatchObject(
      { ok: false }
    );
  });

  it('rejects when rate-limited', async () => {
    allowed.mockReturnValue({ allowed: false });
    expect(await enablePasskeyUnlockAction(validEnable)).toEqual({
      ok: false,
      message: 'slow down',
    });
  });
});

describe('disablePasskeyUnlockAction', () => {
  it('deletes the wrap', async () => {
    const res = await disablePasskeyUnlockAction({ credentialId: 'cred-A' });
    expect(res).toEqual({ ok: true });
    expect(deleteByCredential).toHaveBeenCalledWith('alice', 'cred-A');
  });
});
