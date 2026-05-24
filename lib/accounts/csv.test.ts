import { describe, it, expect } from 'vitest';
import { accountsRowsToCsv } from './csv';

describe('accountsRowsToCsv', () => {
  it('emits only the header row for empty input', () => {
    expect(accountsRowsToCsv([], 'USD')).toBe('account,balance,currency\n');
  });

  it('emits one row per account', () => {
    expect(
      accountsRowsToCsv(
        [
          { account: 'Assets:Checking', amount: '1234.50' },
          { account: 'Expenses:Food', amount: '420.00' },
        ],
        'USD'
      )
    ).toBe(
      'account,balance,currency\nAssets:Checking,1234.50,USD\nExpenses:Food,420.00,USD\n'
    );
  });
});
