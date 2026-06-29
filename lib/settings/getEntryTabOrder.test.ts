import { describe, it, expect, vi, beforeEach } from 'vitest';

const getOptionalUser = vi.fn();
const repoGet = vi.fn();

vi.mock('@/lib/auth/require-user', () => ({
  getOptionalUser: () => getOptionalUser(),
}));

vi.mock('./instances', () => ({
  userSettingRepository: { get: (id: string) => repoGet(id) },
}));

vi.mock('@/lib/log', () => ({
  createLogger: () => ({ error: vi.fn() }),
}));

beforeEach(() => {
  getOptionalUser.mockReset();
  repoGet.mockReset();
  vi.resetModules();
});

describe('getEntryTabOrder', () => {
  it('returns the default order for an anonymous user', async () => {
    getOptionalUser.mockResolvedValue(null);
    const { getEntryTabOrder } = await import('./getEntryTabOrder');
    expect(await getEntryTabOrder()).toEqual(['types', 'form', 'raw']);
    expect(repoGet).not.toHaveBeenCalled();
  });

  it('parses a stored order for a signed-in user', async () => {
    getOptionalUser.mockResolvedValue({ id: 'alice' });
    repoGet.mockResolvedValue({ entryTabOrder: 'raw,types,form' });
    const { getEntryTabOrder } = await import('./getEntryTabOrder');
    expect(await getEntryTabOrder()).toEqual(['raw', 'types', 'form']);
  });

  it('falls back to the default when the row has no preference', async () => {
    getOptionalUser.mockResolvedValue({ id: 'alice' });
    repoGet.mockResolvedValue({ entryTabOrder: null });
    const { getEntryTabOrder } = await import('./getEntryTabOrder');
    expect(await getEntryTabOrder()).toEqual(['types', 'form', 'raw']);
  });

  it('degrades to the default order on a DB error', async () => {
    getOptionalUser.mockResolvedValue({ id: 'alice' });
    repoGet.mockRejectedValue(new Error('db down'));
    const { getEntryTabOrder } = await import('./getEntryTabOrder');
    expect(await getEntryTabOrder()).toEqual(['types', 'form', 'raw']);
  });
});
