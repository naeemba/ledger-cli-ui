import { describe, it, expect } from 'vitest';
import {
  residualByCurrency,
  balancingPostings,
  extraItemPostings,
  toExtraItems,
  singleAccount,
} from './extraItems';

describe('residualByCurrency', () => {
  it('sums plain postings per currency in first-seen order', () => {
    const net = residualByCurrency([
      { account: 'Expenses:Dining', amount: '100', currency: 'USD' },
      { account: 'Expenses:Tips', amount: '20', currency: 'USD' },
      { account: 'Expenses:Fees', amount: '2', currency: 'EUR' },
    ]);
    expect([...net]).toEqual([
      ['USD', 120],
      ['EUR', 2],
    ]);
  });

  it('honors @@ cost annotations', () => {
    const net = residualByCurrency([
      {
        account: 'Assets:BTC',
        amount: '1',
        currency: 'BTC',
        cost: { amount: '100', currency: 'USD' },
      },
    ]);
    expect(net.get('USD')).toBe(100);
    expect(net.has('BTC')).toBe(false);
  });
});

describe('balancingPostings', () => {
  it('emits a single amount-less posting when there is a residual', () => {
    // Ledger fills the exact amount(s) — even multi-currency — from the blank.
    const out = balancingPostings('Assets:Checking', [
      { account: 'Expenses:Dining', amount: '100', currency: 'USD' },
      { account: 'Expenses:Tips', amount: '20', currency: 'USD' },
      { account: 'Expenses:Fees', amount: '2', currency: 'EUR' },
    ]);
    expect(out).toEqual([
      { account: 'Assets:Checking', amount: '', currency: '' },
    ]);
  });

  it('drops currencies that already net to zero', () => {
    const out = balancingPostings('Assets:Checking', [
      { account: 'A', amount: '5', currency: 'USD' },
      { account: 'B', amount: '-5', currency: 'USD' },
    ]);
    expect(out).toEqual([]);
  });
});

describe('extraItemPostings', () => {
  it('maps rows to postings and drops rows missing an account or amount', () => {
    expect(
      extraItemPostings([
        { account: 'Expenses:Tips', amount: '20', currency: 'USD' },
        { account: '', amount: '', currency: 'USD' },
        { account: 'Expenses:Fees', amount: '', currency: 'USD' },
        { account: '', amount: '5', currency: 'USD' },
      ])
    ).toEqual([{ account: 'Expenses:Tips', amount: '20', currency: 'USD' }]);
  });
});

describe('toExtraItems', () => {
  it('projects postings to plain item rows', () => {
    expect(
      toExtraItems([
        { account: 'Expenses:Tips', amount: '20', currency: 'USD' },
      ])
    ).toEqual([{ account: 'Expenses:Tips', amount: '20', currency: 'USD' }]);
  });
});

describe('singleAccount', () => {
  it('returns the account when all postings share one', () => {
    expect(
      singleAccount([
        { account: 'Assets:Checking', amount: '-120', currency: 'USD' },
        { account: 'Assets:Checking', amount: '-2', currency: 'EUR' },
      ])
    ).toBe('Assets:Checking');
  });
  it('returns null for zero or multiple distinct accounts', () => {
    expect(singleAccount([])).toBeNull();
    expect(
      singleAccount([
        { account: 'Assets:A', amount: '1', currency: 'USD' },
        { account: 'Assets:B', amount: '-1', currency: 'USD' },
      ])
    ).toBeNull();
  });
});
