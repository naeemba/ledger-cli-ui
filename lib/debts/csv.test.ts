import { describe, it, expect } from 'vitest';
import { debtsRowsToCsv } from './csv';

describe('debtsRowsToCsv', () => {
  it('emits only the header row for empty input', () => {
    expect(debtsRowsToCsv([], 'USD')).toBe('account,balance,currency\n');
  });

  it('emits one row per debt', () => {
    expect(
      debtsRowsToCsv(
        [
          { account: 'Liabilities:CreditCard', amount: '500.00' },
          { account: 'Liabilities:Mortgage', amount: '250000.00' },
        ],
        'USD'
      )
    ).toBe(
      'account,balance,currency\nLiabilities:CreditCard,500.00,USD\nLiabilities:Mortgage,250000.00,USD\n'
    );
  });
});
