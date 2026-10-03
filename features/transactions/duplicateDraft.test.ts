import { describe, expect, it, vi } from 'vitest';
import { asDuplicate } from './duplicateDraft';
import { initDraft, serializeDraftJson } from './entry/draftReducer';

const loaded = {
  ok: true as const,
  draft: {
    date: '2026-01-15',
    payee: 'Lunch with Sam',
    status: 'cleared' as const,
    note: 'split bill',
    uid: '01HZX0000000000000000000AA',
    postings: [
      { account: 'Assets:Receivable:Sam', amount: '20', currency: 'USD' },
      { account: 'Assets:Checking', amount: '-20', currency: 'USD' },
    ],
  },
  fingerprint: 'abc',
  accounts: [],
  payees: [],
  defaultCurrency: 'USD',
  currencies: ['USD'],
};

describe('asDuplicate', () => {
  it('keeps the entry but dates it today, unmarks it and drops the uid', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 3, 12));
    const copy = asDuplicate(loaded);
    vi.useRealTimers();

    expect(copy.draft).toEqual({
      ...loaded.draft,
      date: '2026-10-03',
      status: 'none',
      uid: undefined,
    });
    const wire = JSON.parse(
      serializeDraftJson(initDraft(copy.draft, copy.defaultCurrency), 'create')
    );
    expect(wire.uid).toBeUndefined();
    expect(loaded.draft.uid).toBe('01HZX0000000000000000000AA');
  });

  it('drops an assertion on a posting with an amount', () => {
    const copy = asDuplicate({
      ...loaded,
      draft: {
        ...loaded.draft,
        postings: [
          { account: 'Expenses:Food', amount: '20', currency: 'USD' },
          {
            account: 'Assets:Checking',
            amount: '-20',
            currency: 'USD',
            assertion: { amount: '480', currency: 'USD' },
          },
        ],
      },
    });
    expect(copy.draft.postings[1]).toEqual({
      account: 'Assets:Checking',
      amount: '-20',
      currency: 'USD',
    });
  });

  it('keeps the assertion on an amount-less posting, where it sets the amount', () => {
    const fixBalance = {
      account: 'Assets:Checking',
      amount: '',
      currency: 'USD',
      assertion: { amount: '480', currency: 'USD' },
    };
    const copy = asDuplicate({
      ...loaded,
      draft: {
        ...loaded.draft,
        postings: [
          fixBalance,
          { account: 'Equity:Adjustments', amount: '', currency: 'USD' },
        ],
      },
    });
    expect(copy.draft.postings[0]).toEqual(fixBalance);
  });

  it('drops the assertion on an amount-less posting when another posting has an amount', () => {
    const copy = asDuplicate({
      ...loaded,
      draft: {
        ...loaded.draft,
        postings: [
          { account: 'Expenses:Food', amount: '20', currency: 'USD' },
          {
            account: 'Assets:Checking',
            amount: '',
            currency: 'USD',
            assertion: { amount: '480', currency: 'USD' },
          },
        ],
      },
    });
    expect(copy.draft.postings[1]).toEqual({
      account: 'Assets:Checking',
      amount: '',
      currency: 'USD',
    });
  });
});
