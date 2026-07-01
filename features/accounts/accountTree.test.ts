import { describe, it, expect } from 'vitest';
import { buildAccountTree, bucketRoots, countLeaves } from './accountTree';

const rows = [
  { account: 'Assets', amount: '$ 3,150.00' },
  { account: 'Assets:Bank', amount: '$ 3,170.00' },
  { account: 'Assets:Bank:Checking', amount: '$ 3,150.00' },
  { account: 'Assets:Cash', amount: '$ -20.00' },
  { account: 'Liabilities:CreditCard', amount: '$ -30.00' },
  { account: 'Income:Salary', amount: '$ -2,000.00' },
  { account: 'Expenses:Food:Dining', amount: '$ 30.00' },
  { account: 'Equity:Opening', amount: '$ -1,000.00' },
];

describe('buildAccountTree', () => {
  it('nests by colon segments and attaches each node its own amount', () => {
    const roots = buildAccountTree(rows);
    const assets = roots.find((r) => r.path === 'Assets')!;
    expect(assets.amount).toBe('$ 3,150.00');
    expect(assets.role).toBe('asset');
    const bank = assets.children.find((c) => c.name === 'Bank')!;
    expect(bank.path).toBe('Assets:Bank');
    expect(bank.amount).toBe('$ 3,170.00');
    expect(bank.children.map((c) => c.name)).toEqual(['Checking']);
  });

  it('synthesises missing parent nodes with empty amount', () => {
    const roots = buildAccountTree([
      { account: 'Expenses:Food:Dining', amount: '$ 30.00' },
    ]);
    const expenses = roots.find((r) => r.path === 'Expenses')!;
    expect(expenses.amount).toBe('');
    expect(expenses.children[0].name).toBe('Food');
  });
});

describe('bucketRoots', () => {
  it('groups roots into accounts / categories / advanced in fixed order', () => {
    const buckets = bucketRoots(buildAccountTree(rows));
    expect(buckets.map((b) => b.key)).toEqual([
      'accounts',
      'categories',
      'advanced',
    ]);
    const byKey = Object.fromEntries(
      buckets.map((b) => [b.key, b.roots.map((r) => r.name)])
    );
    expect(byKey.accounts).toEqual(['Assets', 'Liabilities']);
    expect(byKey.categories).toEqual(['Expenses', 'Income']);
    expect(byKey.advanced).toEqual(['Equity']);
  });
});

describe('countLeaves', () => {
  it('counts only nodes without children', () => {
    // leaves: Assets:Bank:Checking, Assets:Cash, Liabilities:CreditCard,
    //         Income:Salary, Expenses:Food:Dining, Equity:Opening = 6
    expect(countLeaves(buildAccountTree(rows))).toBe(6);
  });
});
