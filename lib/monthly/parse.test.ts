import { describe, it, expect } from 'vitest';
import { parseMonthlyTotals } from './parse';

describe('parseMonthlyTotals', () => {
  it('returns an empty map for empty input', () => {
    expect(parseMonthlyTotals('')).toEqual(new Map());
  });

  it('sums amounts across accounts within the same month', () => {
    const stdout =
      'NNN2024-01-31|Expenses:Food|USD 100.00\n' +
      'NNN2024-01-31|Expenses:Rent|USD 900.00\n' +
      'NNN2024-02-29|Expenses:Food|USD 120.00\n';
    expect(parseMonthlyTotals(stdout)).toEqual(
      new Map([
        ['2024-01-31', 1000],
        ['2024-02-29', 120],
      ])
    );
  });

  it('skips synthetic `<Adjustment>` / `<Revalued>` rows injected by -X', () => {
    const stdout =
      'NNN2024-01-31|Expenses:Food|USD 100.00\n' +
      'NNN2024-01-31|<Adjustment>|USD 50.00\n' +
      'NNN2024-01-31|<Revalued>|USD 25.00\n';
    expect(parseMonthlyTotals(stdout)).toEqual(new Map([['2024-01-31', 100]]));
  });

  it('skips rows with a missing date or amount', () => {
    const stdout =
      'NNN2024-01-31|Expenses:Food|USD 100.00\n' + 'NNN|Expenses:Food|\n';
    expect(parseMonthlyTotals(stdout)).toEqual(new Map([['2024-01-31', 100]]));
  });
});
