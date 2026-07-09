// features/transactions/entry/types/registry.test.ts
import { describe, it, expect } from 'vitest';
import { TYPE_ADAPTERS, detectType } from './registry';
import { Transaction } from '@/lib/transactions/model';

const draft = (postings: object[]) =>
  ({
    date: '2026-06-29',
    payee: 'X',
    status: 'none' as const,
    note: '',
    postings,
  }) as never;

describe('TYPE_ADAPTERS', () => {
  it('lists the five adapters in spec order', () => {
    expect(TYPE_ADAPTERS.map((a) => a.id)).toEqual([
      'expense',
      'income',
      'transfer',
      'exchange',
      'fix-balance',
    ]);
  });
});

describe('detectType', () => {
  it('routes a clean expense to the expense adapter', () => {
    expect(
      detectType(
        draft([
          { account: 'Expenses:Groceries', amount: '42.50', currency: 'USD' },
          { account: 'Assets:Checking', amount: '-42.50', currency: 'USD' },
        ])
      )?.id
    ).toBe('expense');
  });
  it('routes an exchange to the exchange adapter', () => {
    expect(
      detectType(
        draft([
          {
            account: 'Assets:EUR',
            amount: '92',
            currency: 'EUR',
            cost: { amount: '100', currency: 'USD' },
          },
          { account: 'Assets:Checking', amount: '-100', currency: 'USD' },
        ])
      )?.id
    ).toBe('exchange');
  });
  it('routes a fix-balance to the fix-balance adapter', () => {
    expect(
      detectType(
        draft([
          {
            account: 'Assets:Checking',
            amount: '',
            currency: '',
            assertion: { amount: '1234.56', currency: 'USD' },
          },
          { account: 'Equity:Adjustments', amount: '', currency: '' },
        ])
      )?.id
    ).toBe('fix-balance');
  });
  it('classifies a multi-expense-line draft with a single payer as expense', () => {
    expect(
      detectType(
        draft([
          { account: 'Expenses:A', amount: '10', currency: 'USD' },
          { account: 'Expenses:B', amount: '10', currency: 'USD' },
          { account: 'Assets:Checking', amount: '-20', currency: 'USD' },
        ])
      )?.id
    ).toBe('expense');
  });
  it('returns null for a non-standard-root journal', () => {
    expect(
      detectType(
        draft([
          { account: 'Funny:Money', amount: '10', currency: 'USD' },
          { account: 'Other:Thing', amount: '-10', currency: 'USD' },
        ])
      )
    ).toBeNull();
  });
});

describe('detectType with extra items', () => {
  it('classifies an expense with a tip as expense', () => {
    const transaction = Transaction.of('2026-06-29', 'Diner', 'none', '', [
      { account: 'Expenses:Dining', amount: '100', currency: 'USD' },
      { account: 'Expenses:Tips', amount: '20', currency: 'USD' },
      { account: 'Assets:Checking', amount: '-120', currency: 'USD' },
    ]);
    expect(detectType(transaction)?.id).toBe('expense');
  });

  it('classifies a transfer with a wire fee as transfer, not expense', () => {
    const transaction = Transaction.of('2026-06-29', 'Transfer', 'none', '', [
      { account: 'Assets:Savings', amount: '500', currency: 'USD' },
      { account: 'Expenses:WireFee', amount: '15', currency: 'USD' },
      { account: 'Assets:Checking', amount: '-515', currency: 'USD' },
    ]);
    expect(detectType(transaction)?.id).toBe('transfer');
  });

  it('classifies income with a processor fee as income, not expense', () => {
    const transaction = Transaction.of('2026-06-29', 'Employer', 'none', '', [
      { account: 'Assets:Checking', amount: '970', currency: 'USD' },
      { account: 'Income:Salary', amount: '-1000', currency: 'USD' },
      { account: 'Expenses:Fees', amount: '30', currency: 'USD' },
    ]);
    expect(detectType(transaction)?.id).toBe('income');
  });

  it('classifies an exchange with a broker fee as exchange', () => {
    const transaction = Transaction.of(
      '2026-06-29',
      'Currency exchange',
      'none',
      '',
      [
        {
          account: 'Assets:BTC',
          amount: '1',
          currency: 'BTC',
          cost: { amount: '100', currency: 'USD' },
        },
        { account: 'Expenses:BrokerFee', amount: '2', currency: 'USD' },
        { account: 'Assets:Bank', amount: '-102', currency: 'USD' },
      ]
    );
    expect(detectType(transaction)?.id).toBe('exchange');
  });
});
