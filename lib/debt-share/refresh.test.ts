import { beforeEach, describe, expect, it, vi } from 'vitest';

const { refresh, pull, hasSessionDek, logError, after } = vi.hoisted(() => ({
  refresh: vi.fn(),
  pull: vi.fn(),
  hasSessionDek: vi.fn(),
  logError: vi.fn(),
  after: vi.fn(),
}));
vi.mock('./index', () => ({ debtShareService: { refresh } }));
vi.mock('@/lib/storage/sync', () => ({ pull }));
vi.mock('@/lib/crypto/sessionKeys', () => ({ hasSessionDek }));
vi.mock('@/lib/log', () => ({
  createLogger: () => ({ error: logError }),
}));
vi.mock('next/server', () => ({ after }));

const { rebuildDebtShares, refreshDebtShares } = await import('./refresh');

describe('refreshDebtShares', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('queues nothing while locked', () => {
    hasSessionDek.mockReturnValue(false);
    refreshDebtShares('alice');
    expect(after).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('queues the rebuild for after the response, without running it now', async () => {
    hasSessionDek.mockReturnValue(true);
    refreshDebtShares('alice');
    expect(after).toHaveBeenCalledOnce();
    expect(refresh).not.toHaveBeenCalled();
    await after.mock.calls[0][0]();
    expect(pull).toHaveBeenCalledWith('alice');
    expect(refresh).toHaveBeenCalledWith('alice');
    expect(pull.mock.invocationCallOrder[0]).toBeLessThan(
      refresh.mock.invocationCallOrder[0]
    );
  });

  it('starts the rebuild at once outside a request', async () => {
    hasSessionDek.mockReturnValue(true);
    after.mockImplementation(() => {
      throw new Error('`after` was called outside a request scope');
    });
    refreshDebtShares('alice');
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledWith('alice'));
  });
});

describe('rebuildDebtShares', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('swallows a failure so the save still succeeds', async () => {
    refresh.mockRejectedValue(new Error('database down'));
    await expect(rebuildDebtShares('alice')).resolves.toBeUndefined();
  });

  it('logs only the error name, never the error or its message', async () => {
    refresh.mockRejectedValue(new Error('owes Bob 50 USD'));
    await rebuildDebtShares('alice');
    const logged = JSON.stringify(logError.mock.calls);
    expect(logged).toContain('Error');
    expect(logged).not.toContain('Bob');
  });
});
