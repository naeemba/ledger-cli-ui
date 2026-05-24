import { describe, it, expect } from 'vitest';
import { portfolioRowsToCsv } from './csv';

describe('portfolioRowsToCsv', () => {
  it('emits only the header row for empty input', () => {
    expect(portfolioRowsToCsv([], 'USD')).toBe(
      'account,commodity,quantity,value,currency\n'
    );
  });

  it('splits "<qty> <commodity>" native strings into separate columns', () => {
    expect(
      portfolioRowsToCsv(
        [
          {
            account: 'Assets:Brokerage',
            native: '12.345 VTSAX',
            converted: '3500.00',
          },
          {
            account: 'Assets:Crypto',
            native: '0.05 BTC',
            converted: '4000.00',
          },
        ],
        'USD'
      )
    ).toBe(
      'account,commodity,quantity,value,currency\n' +
        'Assets:Brokerage,VTSAX,12.345,3500.00,USD\n' +
        'Assets:Crypto,BTC,0.05,4000.00,USD\n'
    );
  });

  it('handles symbol-prefix amounts like "$1234.50"', () => {
    expect(
      portfolioRowsToCsv(
        [{ account: 'Assets:Cash', native: '$1234.50', converted: '1234.50' }],
        'USD'
      )
    ).toBe(
      'account,commodity,quantity,value,currency\n' +
        'Assets:Cash,$,1234.50,1234.50,USD\n'
    );
  });

  it('leaves value empty when converted is missing', () => {
    expect(
      portfolioRowsToCsv(
        [{ account: 'Assets:Crypto', native: '0.05 BTC', converted: '' }],
        'USD'
      )
    ).toBe(
      'account,commodity,quantity,value,currency\n' +
        'Assets:Crypto,BTC,0.05,,USD\n'
    );
  });
});
