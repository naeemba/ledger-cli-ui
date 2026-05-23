import { describe, it, expect } from 'vitest';
import { buildTree } from './Accounts.utils';

describe('buildTree', () => {
  it('returns an empty object for no accounts', () => {
    expect(buildTree([])).toEqual({});
  });

  it('builds a flat tree for top-level accounts', () => {
    expect(buildTree(['Cash', 'Bank'])).toEqual({
      Cash: {},
      Bank: {},
    });
  });

  it('builds a nested tree from colon-separated segments', () => {
    expect(buildTree(['Expenses:Food', 'Expenses:Rent'])).toEqual({
      Expenses: { Food: {}, Rent: {} },
    });
  });

  it('merges multi-level paths under shared ancestors', () => {
    const result = buildTree([
      'Assets:Bank:Checking',
      'Assets:Bank:Savings',
      'Assets:Cash',
    ]);
    expect(result).toEqual({
      Assets: {
        Bank: { Checking: {}, Savings: {} },
        Cash: {},
      },
    });
  });

  it('is idempotent across duplicate inputs', () => {
    const a = buildTree(['Expenses:Food', 'Expenses:Food']);
    const b = buildTree(['Expenses:Food']);
    expect(a).toEqual(b);
  });
});
