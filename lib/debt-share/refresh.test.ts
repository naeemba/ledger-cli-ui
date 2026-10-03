import { beforeEach, describe, expect, it, vi } from 'vitest';

const refresh = vi.fn();
vi.mock('./index', () => ({ debtShareService: { refresh } }));
const hasSessionDek = vi.fn();
vi.mock('@/lib/crypto/sessionKeys', () => ({ hasSessionDek }));
const logError = vi.fn();
vi.mock('@/lib/log', () => ({
  createLogger: () => ({ error: logError }),
}));

const { refreshDebtShares } = await import('./refresh');

describe('refreshDebtShares', () => {
  beforeEach(() => {
    refresh.mockReset();
    hasSessionDek.mockReset();
    logError.mockReset();
  });

  it('skips everything while locked', async () => {
    hasSessionDek.mockReturnValue(false);
    await refreshDebtShares('alice');
    expect(refresh).not.toHaveBeenCalled();
  });

  it('rebuilds while unlocked', async () => {
    hasSessionDek.mockReturnValue(true);
    await refreshDebtShares('alice');
    expect(refresh).toHaveBeenCalledWith('alice');
  });

  it('swallows a failure so the save still succeeds', async () => {
    hasSessionDek.mockReturnValue(true);
    refresh.mockRejectedValue(new Error('database down'));
    await expect(refreshDebtShares('alice')).resolves.toBeUndefined();
  });

  it('logs only the error name, never the error or its message', async () => {
    hasSessionDek.mockReturnValue(true);
    refresh.mockRejectedValue(new Error('owes Bob 50 USD'));
    await refreshDebtShares('alice');
    const logged = JSON.stringify(logError.mock.calls);
    expect(logged).toContain('Error');
    expect(logged).not.toContain('Bob');
  });
});
