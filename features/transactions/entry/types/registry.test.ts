// features/transactions/entry/types/registry.test.ts
import { describe, it, expect } from 'vitest';
import { TYPE_ADAPTERS, detectType } from './registry';

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
  it('returns null for a 3-posting split (falls back to Form)', () => {
    expect(
      detectType(
        draft([
          { account: 'Expenses:A', amount: '10', currency: 'USD' },
          { account: 'Expenses:B', amount: '10', currency: 'USD' },
          { account: 'Assets:Checking', amount: '-20', currency: 'USD' },
        ])
      )
    ).toBeNull();
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
