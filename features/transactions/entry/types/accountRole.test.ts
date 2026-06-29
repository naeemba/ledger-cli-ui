import { describe, it, expect } from 'vitest';
import { classifyAccount, accountsForRole } from './accountRole';

describe('classifyAccount', () => {
  it('maps the five standard roots', () => {
    expect(classifyAccount('Assets:Checking')).toBe('asset');
    expect(classifyAccount('Liabilities:Visa')).toBe('liability');
    expect(classifyAccount('Income:Salary')).toBe('income');
    expect(classifyAccount('Expenses:Groceries')).toBe('expense');
    expect(classifyAccount('Equity:Adjustments')).toBe('equity');
  });
  it('classifies a bare root with no subaccount', () => {
    expect(classifyAccount('Assets')).toBe('asset');
  });
  it('returns unknown for non-standard roots', () => {
    expect(classifyAccount('Funny:Money')).toBe('unknown');
    expect(classifyAccount('')).toBe('unknown');
  });
});

describe('accountsForRole', () => {
  it('filters accounts by role', () => {
    const accounts = [
      'Assets:Checking',
      'Assets:Savings',
      'Expenses:Food',
      'Income:Salary',
    ];
    expect(accountsForRole(accounts, 'asset')).toEqual([
      'Assets:Checking',
      'Assets:Savings',
    ]);
    expect(accountsForRole(accounts, 'expense')).toEqual(['Expenses:Food']);
    expect(accountsForRole(accounts, 'equity')).toEqual([]);
  });
});
