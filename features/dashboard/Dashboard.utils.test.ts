import { describe, it, expect } from 'vitest';
import { getHighestExpense } from './Dashboard.utils';

describe('getHighestExpense', () => {
  it('picks the largest row by amount', () => {
    const stdout = [
      'Expenses:Food|USD 42.00',
      'Expenses:Rent|USD 1500',
      'Expenses:Coffee|USD 7.50',
      '',
    ].join('\n');
    expect(getHighestExpense(stdout)).toBe('Expenses:Rent|USD 1500');
  });

  it('handles comma thousands separators', () => {
    const stdout = [
      'Expenses:Food|USD 1,500',
      'Expenses:Rent|USD 999',
      '',
    ].join('\n');
    expect(getHighestExpense(stdout)).toBe('Expenses:Food|USD 1,500');
  });

  it('returns empty string when no rows have an amount', () => {
    expect(getHighestExpense('')).toBe('');
    expect(getHighestExpense('\n\n')).toBe('');
  });

  it('skips synthetic <Adjustment>/<Revalued> rows even when they are largest', () => {
    const stdout = [
      '<Adjustment>|USD 9,999',
      '<Revalued>|USD 8,888',
      'Expenses:Rent|USD 1500',
      '',
    ].join('\n');
    expect(getHighestExpense(stdout)).toBe('Expenses:Rent|USD 1500');
  });

  it('skips rows whose amount field is malformed', () => {
    const stdout = ['Expenses:Food|garbage', 'Expenses:Rent|USD 100', ''].join(
      '\n'
    );
    expect(getHighestExpense(stdout)).toBe('Expenses:Rent|USD 100');
  });
});
