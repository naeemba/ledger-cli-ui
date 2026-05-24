import { describe, it, expect } from 'vitest';
import { periodicBalanceRowsToCsv } from './csvPeriodic';

describe('periodicBalanceRowsToCsv', () => {
  it('emits only the header row for empty input', () => {
    expect(periodicBalanceRowsToCsv([], 'USD')).toBe(
      'account,spend,currency\n'
    );
  });

  it('emits one row per account', () => {
    expect(
      periodicBalanceRowsToCsv(
        [
          { account: 'Expenses:Food', amount: 'USD 120.50' },
          { account: 'Expenses:Rent', amount: 'USD 1500.00' },
        ],
        'USD'
      )
    ).toBe(
      'account,spend,currency\nExpenses:Food,USD 120.50,USD\nExpenses:Rent,USD 1500.00,USD\n'
    );
  });
});
