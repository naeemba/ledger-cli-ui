// features/transactions/entry/typeLensState.test.ts
import { describe, it, expect } from 'vitest';
import { initDraft } from './draftReducer';
import { initialPickForDraft, resolveTypeLensState } from './typeLensState';
import { expenseAdapter } from './types/expense';

const ctx = { defaultCurrency: 'USD' };

const emptyDraft = () => initDraft({ date: '2026-07-05' }, 'USD');

// A guided expense that the user has only started filling: a payee is typed
// but the accounts and amount are still blank, so no adapter can detect it yet.
const partialExpenseDraft = () =>
  expenseAdapter.compile(
    { ...expenseAdapter.emptyFields(ctx), payee: 'Cafe' },
    ctx
  );

const expenseDraft = () =>
  initDraft(
    {
      date: '2026-07-05',
      payee: 'Cafe',
      postings: [
        { account: 'Expenses:Food', amount: '5', currency: 'USD' },
        { account: 'Assets:Checking', amount: '-5', currency: 'USD' },
      ],
    },
    'USD'
  );

const unrecognizedDraft = () =>
  initDraft(
    {
      date: '2026-07-05',
      payee: 'Split',
      postings: [
        { account: 'Expenses:Food', amount: '5', currency: 'USD' },
        { account: 'Expenses:Fun', amount: '5', currency: 'USD' },
        { account: 'Assets:Checking', amount: '-10', currency: 'USD' },
      ],
    },
    'USD'
  );

describe('resolveTypeLensState', () => {
  it('keeps a picked form open while its draft is still being filled', () => {
    // Regression: typing a payee before the accounts/amount makes the draft
    // non-empty yet undetectable. The picked form must stay open, not collapse
    // into the "doesn't map to a quick type" notice.
    const { selectedId, chipsDisabled } = resolveTypeLensState(
      partialExpenseDraft(),
      'expense'
    );
    expect(selectedId).toBe('expense');
    expect(chipsDisabled).toBe(false);
  });

  it('offers the pick prompt for an empty draft with nothing picked', () => {
    const { selectedId, chipsDisabled } = resolveTypeLensState(
      emptyDraft(),
      null
    );
    expect(selectedId).toBe(null);
    expect(chipsDisabled).toBe(false);
  });

  it('selects the detected type for a recognized draft', () => {
    const { selectedId, chipsDisabled } = resolveTypeLensState(
      expenseDraft(),
      null
    );
    expect(selectedId).toBe('expense');
    expect(chipsDisabled).toBe(false);
  });

  it('disables the chips for an unrecognized incoming draft', () => {
    const { selectedId, chipsDisabled } = resolveTypeLensState(
      unrecognizedDraft(),
      null
    );
    expect(selectedId).toBe(null);
    expect(chipsDisabled).toBe(true);
  });
});

describe('initialPickForDraft', () => {
  it('seeds the detected type so editing it survives a transient mismatch', () => {
    expect(initialPickForDraft(expenseDraft())).toBe('expense');
  });

  it('seeds nothing for an empty draft', () => {
    expect(initialPickForDraft(emptyDraft())).toBe(null);
  });

  it('seeds nothing for an unrecognized draft', () => {
    expect(initialPickForDraft(unrecognizedDraft())).toBe(null);
  });
});
