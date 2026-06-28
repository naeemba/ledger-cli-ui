import { describe, it, expect } from 'vitest';
import { computeBalance } from './balance';

describe('computeBalance', () => {
  it('returns balanced for a two-posting set that nets to zero', () => {
    const postings = [
      { account: 'Expenses:Groceries', amount: '42.50', currency: 'USD' },
      { account: 'Assets:Checking', amount: '-42.50', currency: 'USD' },
    ];
    expect(computeBalance(postings).kind).toBe('balanced');
  });

  it('returns auto-balance when exactly one posting has a blank amount', () => {
    const postings = [
      { account: 'Expenses:Groceries', amount: '42.50', currency: 'USD' },
      { account: 'Assets:Checking', amount: '', currency: 'USD' },
    ];
    expect(computeBalance(postings).kind).toBe('auto-balance');
  });

  it('returns too-many-blanks when more than one posting has a blank amount', () => {
    const postings = [
      { account: 'Expenses:Groceries', amount: '', currency: 'USD' },
      { account: 'Assets:Checking', amount: '', currency: 'USD' },
    ];
    expect(computeBalance(postings).kind).toBe('too-many-blanks');
  });

  it('returns unbalanced for a set that does not net to zero', () => {
    const postings = [
      { account: 'Expenses:Groceries', amount: '42.50', currency: 'USD' },
      { account: 'Assets:Checking', amount: '-10.00', currency: 'USD' },
    ];
    const result = computeBalance(postings);
    expect(result.kind).toBe('unbalanced');
    if (result.kind === 'unbalanced') {
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0][0]).toBe('USD');
    }
  });

  it('returns unbalanced for a multi-currency set with imbalanced currencies', () => {
    const postings = [
      { account: 'Expenses:Groceries', amount: '42.50', currency: 'USD' },
      { account: 'Assets:Euro', amount: '-30.00', currency: 'EUR' },
    ];
    const result = computeBalance(postings);
    expect(result.kind).toBe('unbalanced');
    if (result.kind === 'unbalanced') {
      expect(result.issues).toHaveLength(2);
    }
  });

  it('returns balanced for a multi-currency set where each currency nets to zero', () => {
    const postings = [
      { account: 'Expenses:Food', amount: '10.00', currency: 'USD' },
      { account: 'Assets:Checking', amount: '-10.00', currency: 'USD' },
      { account: 'Expenses:Euro', amount: '5.00', currency: 'EUR' },
      { account: 'Assets:Euro', amount: '-5.00', currency: 'EUR' },
    ];
    expect(computeBalance(postings).kind).toBe('balanced');
  });

  it('returns invalid when a posting amount is not a finite number', () => {
    const postings = [
      { account: 'Expenses:Groceries', amount: 'abc', currency: 'USD' },
      { account: 'Assets:Checking', amount: '-42.50', currency: 'USD' },
    ];
    expect(computeBalance(postings).kind).toBe('invalid');
  });
});
