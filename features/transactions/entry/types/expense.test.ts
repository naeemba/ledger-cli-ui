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
  it('builds a +expense / -asset pair with no extras', () => {
    const draft = expenseAdapter.compile(
      {
        ...header,
        amount: '42.50',
        currency: 'USD',
        paidFrom: 'Assets:Checking',
        spentOn: 'Expenses:Groceries',
        extraItems: [],
      },
      ctx
    );
    expect(draft.postings).toEqual([
      { account: 'Expenses:Groceries', amount: '42.50', currency: 'USD' },
      { account: 'Assets:Checking', amount: '-42.50', currency: 'USD' },
    ]);
    expect(draft.payee).toBe('Whole Foods');
  });

  it('appends extra items and folds them into the paying posting', () => {
    const draft = expenseAdapter.compile(
      {
        ...header,
        amount: '100',
        currency: 'USD',
        paidFrom: 'Assets:Checking',
        spentOn: 'Expenses:Dining',
        extraItems: [
          { account: 'Expenses:Tips', amount: '20', currency: 'USD' },
          { account: 'Expenses:Fees', amount: '2', currency: 'EUR' },
        ],
      },
      ctx
    );
    expect(draft.postings).toEqual([
      { account: 'Expenses:Dining', amount: '100', currency: 'USD' },
      { account: 'Expenses:Tips', amount: '20', currency: 'USD' },
      { account: 'Expenses:Fees', amount: '2', currency: 'EUR' },
      // Amount-less: ledger fills the multi-currency residual on save.
      { account: 'Assets:Checking', amount: '', currency: '' },
    ]);
  });
});

describe('expenseAdapter.detect', () => {
  const clean = Transaction.of('2026-06-29', 'Whole Foods', 'none', '', [
    { account: 'Expenses:Groceries', amount: '42.50', currency: 'USD' },
    { account: 'Assets:Checking', amount: '-42.50', currency: 'USD' },
  ]);

  it('recognizes a clean asset->expense pair with empty extras', () => {
    expect(expenseAdapter.detect(clean)).toEqual({
      date: '2026-06-29',
      payee: 'Whole Foods',
      status: 'none',
      note: '',
      uid: undefined,
      amount: '42.50',
      currency: 'USD',
      paidFrom: 'Assets:Checking',
      spentOn: 'Expenses:Groceries',
      extraItems: [],
    });
  });

  it('recovers extra items from a 3-posting split', () => {
    const draft = Transaction.of('2026-06-29', 'Whole Foods', 'none', '', [
      { account: 'Expenses:Groceries', amount: '42.50', currency: 'USD' },
      { account: 'Expenses:Tax', amount: '3', currency: 'USD' },
      { account: 'Assets:Checking', amount: '-45.50', currency: 'USD' },
    ]);
    expect(expenseAdapter.detect(draft)).toMatchObject({
      amount: '42.50',
      paidFrom: 'Assets:Checking',
      spentOn: 'Expenses:Groceries',
      extraItems: [{ account: 'Expenses:Tax', amount: '3', currency: 'USD' }],
    });
  });

  it('round-trips compile -> detect with extras', () => {
    const fields: ExpenseFields = {
      ...header,
      uid: undefined,
      amount: '100',
      currency: 'USD',
      paidFrom: 'Assets:Cash',
      spentOn: 'Expenses:Coffee',
      extraItems: [{ account: 'Expenses:Tips', amount: '5', currency: 'USD' }],
    };
    expect(expenseAdapter.detect(expenseAdapter.compile(fields, ctx))).toEqual(
      fields
    );
  });

  it('rejects two distinct paying accounts', () => {
    expect(
      expenseAdapter.detect(
        Transaction.of('2026-06-29', 'x', 'none', '', [
          { account: 'Expenses:Groceries', amount: '42.50', currency: 'USD' },
          { account: 'Assets:Checking', amount: '-20', currency: 'USD' },
          { account: 'Assets:Cash', amount: '-22.50', currency: 'USD' },
        ])
      )
    ).toBeNull();
  });

  it('rejects an unbalanced draft', () => {
    expect(
      expenseAdapter.detect(
        Transaction.of('2026-06-29', 'x', 'none', '', [
          { account: 'Expenses:Groceries', amount: '42.50', currency: 'USD' },
          { account: 'Assets:Checking', amount: '-40', currency: 'USD' },
        ])
      )
    ).toBeNull();
  });

  it('rejects a cost-bearing posting', () => {
    expect(
      expenseAdapter.detect(
        Transaction.of('2026-06-29', 'x', 'none', '', [
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

  it('rejects an asset->asset transfer (no expense posting)', () => {
    expect(
      expenseAdapter.detect(
        Transaction.of('2026-06-29', 'x', 'none', '', [
          { account: 'Assets:Savings', amount: '500', currency: 'USD' },
          { account: 'Assets:Checking', amount: '-500', currency: 'USD' },
        ])
      )
    ).toBeNull();
  });
});
