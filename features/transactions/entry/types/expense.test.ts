import { describe, it, expect } from 'vitest';
import { expenseAdapter, type ExpenseFields } from './expense';
import { Transaction } from '@/lib/transactions/model';

const ctx = { defaultCurrency: 'USD' };
const header = {
  date: '2026-06-29',
  payee: 'Whole Foods',
  status: 'none' as const,
  note: '',
};

describe('expenseAdapter.compile', () => {
  it('builds a +expense / -asset pair', () => {
    const draft = expenseAdapter.compile(
      {
        ...header,
        amount: '42.50',
        currency: 'USD',
        paidFrom: 'Assets:Checking',
        spentOn: 'Expenses:Groceries',
      },
      ctx
    );
    expect(draft.postings).toEqual([
      { account: 'Expenses:Groceries', amount: '42.50', currency: 'USD' },
      { account: 'Assets:Checking', amount: '-42.50', currency: 'USD' },
    ]);
    expect(draft.payee).toBe('Whole Foods');
  });
});

describe('expenseAdapter.detect', () => {
  const draft = new Transaction('2026-06-29', 'Whole Foods', 'none', '', [
    { account: 'Expenses:Groceries', amount: '42.50', currency: 'USD' },
    { account: 'Assets:Checking', amount: '-42.50', currency: 'USD' },
  ]);
  it('recognizes a clean asset->expense pair', () => {
    expect(expenseAdapter.detect(draft)).toEqual({
      date: '2026-06-29',
      payee: 'Whole Foods',
      status: 'none',
      note: '',
      uid: undefined,
      amount: '42.50',
      currency: 'USD',
      paidFrom: 'Assets:Checking',
      spentOn: 'Expenses:Groceries',
    });
  });
  it('round-trips compile -> detect', () => {
    const fields: ExpenseFields = {
      ...header,
      uid: undefined,
      amount: '12.00',
      currency: 'USD',
      paidFrom: 'Assets:Cash',
      spentOn: 'Expenses:Coffee',
    };
    expect(expenseAdapter.detect(expenseAdapter.compile(fields, ctx))).toEqual(
      fields
    );
  });
  it('rejects a 3-posting split', () => {
    expect(
      expenseAdapter.detect(
        new Transaction(draft.date, draft.payee, draft.status, draft.note, [
          ...draft.postings,
          { account: 'Expenses:Tax', amount: '0', currency: 'USD' },
        ])
      )
    ).toBeNull();
  });
  it('rejects an asset->asset transfer', () => {
    expect(
      expenseAdapter.detect(
        new Transaction(draft.date, draft.payee, draft.status, draft.note, [
          { account: 'Assets:Savings', amount: '500', currency: 'USD' },
          { account: 'Assets:Checking', amount: '-500', currency: 'USD' },
        ])
      )
    ).toBeNull();
  });
  it('rejects a cost-bearing posting', () => {
    expect(
      expenseAdapter.detect(
        new Transaction(draft.date, draft.payee, draft.status, draft.note, [
          {
            account: 'Expenses:Groceries',
            amount: '42.50',
            currency: 'USD',
            cost: { amount: '1', currency: 'EUR' },
          },
          { account: 'Assets:Checking', amount: '-42.50', currency: 'USD' },
        ])
      )
    ).toBeNull();
  });
});
