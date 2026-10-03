import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTransactionAction, updateTransactionAction } from './actions';
import { initDraft } from './entry/draftReducer';
import { saveDialogDraft } from './saveDialogDraft';

vi.mock('./actions', () => ({
  createTransactionAction: vi.fn(async () => ({ ok: true, uid: 'new-uid' })),
  updateTransactionAction: vi.fn(async () => ({ ok: true })),
  undoTransactionAction: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const loaded = {
  ok: true as const,
  draft: {
    date: '2026-01-15',
    payee: 'Rent',
    status: 'none' as const,
    note: '',
    postings: [
      { account: 'Expenses:Rent', amount: '1000', currency: 'USD' },
      { account: 'Assets:Checking', amount: '-1000', currency: 'USD' },
    ],
  },
  fingerprint: 'original-fingerprint',
  accounts: [],
  payees: [],
  defaultCurrency: 'USD',
  currencies: ['USD'],
};
const draft = initDraft(loaded.draft, loaded.defaultCurrency);

describe('saveDialogDraft', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates a new entry for a duplicate and never updates the original', async () => {
    const refresh = vi.fn();
    const result = await saveDialogDraft(
      { uid: 'original-uid', mode: 'duplicate' },
      loaded,
      draft,
      refresh
    );

    expect(result.ok).toBe(true);
    expect(updateTransactionAction).not.toHaveBeenCalled();
    expect(createTransactionAction).toHaveBeenCalledOnce();
    const formData = vi.mocked(createTransactionAction).mock
      .calls[0][1] as FormData;
    expect(formData.get('uid')).toBeNull();
    expect(formData.get('expectedFingerprint')).toBeNull();
    expect(JSON.parse(formData.get('draft') as string).uid).toBeUndefined();
    expect(refresh).toHaveBeenCalled();
  });

  it('updates the original in place for an edit and never creates', async () => {
    const refresh = vi.fn();
    await saveDialogDraft(
      { uid: 'original-uid', mode: 'edit' },
      loaded,
      draft,
      refresh
    );

    expect(createTransactionAction).not.toHaveBeenCalled();
    expect(updateTransactionAction).toHaveBeenCalledOnce();
    const formData = vi.mocked(updateTransactionAction).mock
      .calls[0][1] as FormData;
    expect(formData.get('uid')).toBe('original-uid');
    expect(formData.get('expectedFingerprint')).toBe('original-fingerprint');
    expect(refresh).toHaveBeenCalledOnce();
  });
});
