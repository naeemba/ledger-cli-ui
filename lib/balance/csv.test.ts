import { describe, it, expect } from 'vitest';
import { balanceRowsToCsv } from './csv';

describe('balanceRowsToCsv', () => {
  it('emits only the header row for empty input', () => {
    expect(balanceRowsToCsv([], 'USD')).toBe('account,amount,currency\n');
  });

  it('emits one row per balance row', () => {
    expect(
      balanceRowsToCsv(
        [
          { account: 'Assets:Checking', amount: '1234.50' },
          { account: 'Total', amount: '6034.50' },
        ],
        'USD'
      )
    ).toBe(
      'account,amount,currency\nAssets:Checking,1234.50,USD\nTotal,6034.50,USD\n'
    );
  });

  it('quotes commas in the amount field', () => {
    expect(
      balanceRowsToCsv([{ account: 'Assets:X', amount: '1,234.50' }], 'USD')
    ).toBe('account,amount,currency\nAssets:X,"1,234.50",USD\n');
  });
});
