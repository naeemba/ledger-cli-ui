import { describe, it, expect } from 'vitest';
import { parseUnconverted } from './parseUnconverted';

describe('parseUnconverted', () => {
  it('returns empty when everything converted to base', () => {
    const stdout = `
            $1,234.50  Assets:Checking
            $-200.00  Liabilities:Card
    `;
    expect(parseUnconverted(stdout, 'USD')).toEqual([]);
  });

  it('collects a single un-convertible commodity', () => {
    const stdout = `
            $1,234.50  Assets:Checking
              €100.00  Assets:Brokerage
    `;
    expect(parseUnconverted(stdout, 'USD')).toEqual(['EUR']);
  });

  it('handles stacked multi-commodity rows', () => {
    const stdout = `
            $1,234.50
              €100.00
              ¥5,000   Assets:Mixed
    `;
    expect(parseUnconverted(stdout, 'USD')).toEqual(['EUR', 'JPY']);
  });

  it('handles ledger-style symbols and named commodities', () => {
    const stdout = `
            $50.00 Assets:Checking
            10 Kirt Assets:Local
            "My Coin" 5  Assets:Crypto
    `;
    expect(parseUnconverted(stdout, 'USD')).toEqual(['Kirt', 'My Coin']);
  });

  it('returns empty for empty stdout', () => {
    expect(parseUnconverted('', 'USD')).toEqual([]);
  });

  it('deduplicates and sorts case-insensitively', () => {
    const stdout = `
              €100 Assets:A
              €200 Assets:B
              ¥5,000 Assets:C
    `;
    expect(parseUnconverted(stdout, 'USD')).toEqual(['EUR', 'JPY']);
  });

  it('treats a case-variant of the base as the base, not unconverted', () => {
    const stdout = ['20 Kirt  Assets:A', '5 EUR  Assets:B'].join('\n');
    // Base is `KIRT`; the `Kirt` row is the same currency, so only EUR needs
    // a rate.
    expect(parseUnconverted(stdout, 'KIRT')).toEqual(['EUR']);
  });
});
