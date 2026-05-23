import { describe, it, expect } from 'vitest';
import { parseCommodityList } from './parseCommodityList';

describe('parseCommodityList', () => {
  it('returns an empty array for empty input', () => {
    expect(parseCommodityList('', 'USD')).toEqual(['USD']);
  });

  it('parses one commodity per line', () => {
    expect(parseCommodityList('USD\nEUR\nJPY\n', 'USD')).toEqual([
      'USD',
      'EUR',
      'JPY',
    ]);
  });

  it('strips matched surrounding double quotes', () => {
    expect(parseCommodityList('USD\n"My Coin"\nEUR\n', 'USD')).toEqual([
      'USD',
      'EUR',
      'My Coin',
    ]);
  });

  it('skips blank lines and trims whitespace', () => {
    expect(parseCommodityList('  USD  \n\n  EUR\n', 'USD')).toEqual([
      'USD',
      'EUR',
    ]);
  });

  it('deduplicates case-sensitively', () => {
    expect(parseCommodityList('USD\nEUR\nUSD\n', 'USD')).toEqual([
      'USD',
      'EUR',
    ]);
  });

  it('sorts the rest case-insensitively with the base pinned first', () => {
    expect(parseCommodityList('jpy\nEUR\nAUD\n', 'USD')).toEqual([
      'USD',
      'AUD',
      'EUR',
      'jpy',
    ]);
  });

  it('appends the base even when absent from the input', () => {
    expect(parseCommodityList('EUR\n', 'USD')).toEqual(['USD', 'EUR']);
  });
});
