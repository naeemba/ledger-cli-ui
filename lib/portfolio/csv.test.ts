import { describe, it, expect } from 'vitest';
import { portfolioRowsToCsv } from './csv';

describe('portfolioRowsToCsv', () => {
  it('emits only the header row for empty input', () => {
    expect(portfolioRowsToCsv([], 'USD')).toBe(
      'account,commodity,quantity,value,currency\n'
    );
  });

  it('emits ledger-split quantity and commodity columns verbatim', () => {
    expect(
      portfolioRowsToCsv(
        [
          {
            account: 'Assets:Brokerage',
            commodity: 'VTSAX',
            quantity: '12.345',
            value: '3500.00',
          },
          // Commodity-prefix rendering that the old regex mangled into
          // commodity `B`, quantity `TC 0.09`.
          {
            account: 'Assets:Crypto',
            commodity: 'BTC',
            quantity: '0.09',
            value: '4000.00',
          },
        ],
        'USD'
      )
    ).toBe(
      'account,commodity,quantity,value,currency\n' +
        'Assets:Brokerage,VTSAX,12.345,3500.00,USD\n' +
        'Assets:Crypto,BTC,0.09,4000.00,USD\n'
    );
  });

  it('leaves value empty when converted is missing', () => {
    expect(
      portfolioRowsToCsv(
        [
          {
            account: 'Assets:Crypto',
            commodity: 'BTC',
            quantity: '0.05',
            value: '',
          },
        ],
        'USD'
      )
    ).toBe(
      'account,commodity,quantity,value,currency\n' +
        'Assets:Crypto,BTC,0.05,,USD\n'
    );
  });
});
