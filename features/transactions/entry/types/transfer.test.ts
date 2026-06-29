import { describe, it, expect } from 'vitest';
import { transferAdapter, type TransferFields } from './transfer';

const ctx = { defaultCurrency: 'USD' };
const header = {
  date: '2026-06-29',
  payee: 'Transfer',
  status: 'none' as const,
  note: '',
};

describe('transferAdapter.compile', () => {
  it('builds a +to / -from asset pair', () => {
    const draft = transferAdapter.compile(
      {
        ...header,
        amount: '500',
        currency: 'USD',
        from: 'Assets:Checking',
        to: 'Assets:Savings',
      },
      ctx
    );
    expect(draft.postings).toEqual([
      { account: 'Assets:Savings', amount: '500', currency: 'USD' },
      { account: 'Assets:Checking', amount: '-500', currency: 'USD' },
    ]);
  });
  it('emptyFields defaults the payee to Transfer', () => {
    expect(transferAdapter.emptyFields(ctx).payee).toBe('Transfer');
  });
});

describe('transferAdapter.detect', () => {
  const draft = {
    date: '2026-06-29',
    payee: 'Transfer',
    status: 'none' as const,
    note: '',
    postings: [
      { account: 'Assets:Savings', amount: '500', currency: 'USD' },
      { account: 'Assets:Checking', amount: '-500', currency: 'USD' },
    ],
  };
  it('recognizes a clean asset->asset move', () => {
    expect(transferAdapter.detect(draft)).toEqual({
      date: '2026-06-29',
      payee: 'Transfer',
      status: 'none',
      note: '',
      uid: undefined,
      amount: '500',
      currency: 'USD',
      from: 'Assets:Checking',
      to: 'Assets:Savings',
    });
  });
  it('round-trips compile -> detect', () => {
    const fields: TransferFields = {
      ...header,
      uid: undefined,
      amount: '20',
      currency: 'USD',
      from: 'Assets:Cash',
      to: 'Assets:Wallet',
    };
    expect(
      transferAdapter.detect(transferAdapter.compile(fields, ctx))
    ).toEqual(fields);
  });
  it('rejects an expense pair (one side is an expense)', () => {
    expect(
      transferAdapter.detect({
        ...draft,
        postings: [
          { account: 'Expenses:Groceries', amount: '42.50', currency: 'USD' },
          { account: 'Assets:Checking', amount: '-42.50', currency: 'USD' },
        ],
      })
    ).toBeNull();
  });
});
