import { describe, it, expect } from 'vitest';
import {
  parsePeriodicBalanceRows,
  extractPeriodicTotal,
} from './parsePeriodic';

describe('parsePeriodicBalanceRows', () => {
  it('returns an empty array for empty input', () => {
    expect(parsePeriodicBalanceRows('')).toEqual([]);
  });

  it('parses per-account rows and skips the total chunk (line=0)', () => {
    const stdout =
      'NNNExpenses:Food|USD 120.50|USD 120.50\n' +
      'NNNExpenses:Rent|USD 1500.00|USD 1620.50\n' +
      'NNN|0|USD 1620.50\n';
    expect(parsePeriodicBalanceRows(stdout)).toEqual([
      { account: 'Expenses:Food', amount: 'USD 120.50' },
      { account: 'Expenses:Rent', amount: 'USD 1500.00' },
    ]);
  });
});

describe('extractPeriodicTotal', () => {
  it('returns empty for empty input', () => {
    expect(extractPeriodicTotal('')).toBe('');
  });

  it('returns the running-total field of the chunk where line is "0"', () => {
    const stdout =
      'NNNExpenses:Food|USD 120.50|USD 120.50\n' + 'NNN|0|USD 120.50\n';
    expect(extractPeriodicTotal(stdout)).toBe('USD 120.50');
  });
});
