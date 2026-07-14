import { describe, expect, it, vi, beforeEach } from 'vitest';
import { deleteTransactionAction } from './deleteTransaction';
import { deleteTransactionByUid } from './deleteTransactionByUid';
import { requireUser } from '@/lib/auth/require-user';
import { journalService } from '@/lib/journal';

vi.mock('@/lib/auth/require-user', () => {
  const mockRequireUser = vi.fn(async () => ({ id: 'user-1' }));
  return { requireUser: mockRequireUser };
});

vi.mock('@/lib/journal', () => {
  const mockFindTransaction = vi.fn();
  return {
    journalService: { findTransaction: mockFindTransaction },
  };
});

vi.mock('./deleteTransaction', () => {
  const mockDeleteTransactionAction = vi.fn();
  return { deleteTransactionAction: mockDeleteTransactionAction };
});

const requireUserMock = vi.mocked(requireUser);
const findTransactionMock = vi.mocked(journalService.findTransaction);
const deleteTransactionActionMock = vi.mocked(deleteTransactionAction);

beforeEach(() => {
  requireUserMock.mockClear();
  findTransactionMock.mockReset();
  deleteTransactionActionMock.mockReset();
});

describe('deleteTransactionByUid', () => {
  it('resolves the per-transaction fingerprint and delegates', async () => {
    findTransactionMock.mockResolvedValue({
      uid: 'u1',
      fingerprint: 'fp-1',
      date: '2026-01-01',
      payee: 'test',
      status: 'none',
      note: '',
      postings: [],
      file: 'test.ledger',
      startLine: 1,
      endLine: 2,
      rawBlock: '2026-01-01 test\n  Assets  100 USD',
    } as any);
    deleteTransactionActionMock.mockResolvedValue({ ok: true });

    const result = await deleteTransactionByUid('u1');

    expect(findTransactionMock).toHaveBeenCalledWith('user-1', 'u1');
    expect(deleteTransactionActionMock).toHaveBeenCalledWith('u1', 'fp-1');
    expect(result).toEqual({ ok: true });
  });

  it('returns not-found when the transaction is gone', async () => {
    findTransactionMock.mockResolvedValue(null);
    const result = await deleteTransactionByUid('missing');
    expect(deleteTransactionActionMock).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: false, message: 'Transaction not found.' });
  });
});
