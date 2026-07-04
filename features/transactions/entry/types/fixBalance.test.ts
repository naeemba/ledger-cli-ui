// features/transactions/entry/types/fixBalance.test.ts
import { describe, it, expect } from 'vitest';
import { fixBalanceAdapter, type FixBalanceFields } from './fixBalance';
import { Transaction } from '@/lib/transactions/model';

const ctx = { defaultCurrency: 'USD' };
const header = {
  date: '2026-06-29',
  payee: 'Balance adjustment',
  status: 'none' as const,
  note: '',
};

describe('fixBalanceAdapter.compile', () => {
  it('builds an assertion posting plus a blank Equity:Adjustments posting', () => {
    const draft = fixBalanceAdapter.compile(
      {
        ...header,
        account: 'Assets:Checking',
        targetAmount: '1234.56',
        targetCurrency: 'USD',
      },
      ctx
    );
    expect(draft.postings).toEqual([
      {
        account: 'Assets:Checking',
        amount: '',
        currency: '',
        assertion: { amount: '1234.56', currency: 'USD' },
      },
      { account: 'Equity:Adjustments', amount: '', currency: '' },
    ]);
  });
});

describe('fixBalanceAdapter.detect', () => {
  const draft = Transaction.of('2026-06-29', 'Balance adjustment', 'none', '', [
    {
      account: 'Assets:Checking',
      amount: '',
      currency: '',
      assertion: { amount: '1234.56', currency: 'USD' },
    },
    { account: 'Equity:Adjustments', amount: '', currency: '' },
  ]);
  it('recognizes an assertion + adjustments pair', () => {
    expect(fixBalanceAdapter.detect(draft)).toEqual({
      date: '2026-06-29',
      payee: 'Balance adjustment',
      status: 'none',
      note: '',
      uid: undefined,
      account: 'Assets:Checking',
      targetAmount: '1234.56',
      targetCurrency: 'USD',
    });
  });
  it('round-trips compile -> detect', () => {
    const fields: FixBalanceFields = {
      ...header,
      uid: undefined,
      account: 'Assets:Savings',
      targetAmount: '500',
      targetCurrency: 'USD',
    };
    expect(
      fixBalanceAdapter.detect(fixBalanceAdapter.compile(fields, ctx))
    ).toEqual(fields);
  });
  it('rejects a plain expense pair', () => {
    expect(
      fixBalanceAdapter.detect(
        Transaction.of(draft.date, draft.payee, draft.status, draft.note, [
          { account: 'Expenses:Groceries', amount: '42.50', currency: 'USD' },
          { account: 'Assets:Checking', amount: '-42.50', currency: 'USD' },
        ])
      )
    ).toBeNull();
  });
});
