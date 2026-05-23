import { describe, it, expect } from 'vitest';
import {
  extractTotal,
  mergePortfolio,
  parseNativeRows,
} from './parsePortfolio';

describe('parseNativeRows', () => {
  it('returns one row per account|amount line', () => {
    const stdout =
      'Assets:Investments:AAPL|10 AAPL\nAssets:Investments:BTC|0.5 BTC\n';
    expect(parseNativeRows(stdout)).toEqual([
      { account: 'Assets:Investments:AAPL', raw: '10 AAPL' },
      { account: 'Assets:Investments:BTC', raw: '0.5 BTC' },
    ]);
  });

  it('returns empty when stdout is blank', () => {
    expect(parseNativeRows('')).toEqual([]);
    expect(parseNativeRows('\n\n')).toEqual([]);
  });

  it('skips malformed lines', () => {
    expect(parseNativeRows('|\nAssets:Foo|1 USD\nnopipe\n')).toEqual([
      { account: 'Assets:Foo', raw: '1 USD' },
    ]);
  });

  it('trims surrounding whitespace from columns', () => {
    expect(parseNativeRows('  Assets:Foo  |  1 USD  ')).toEqual([
      { account: 'Assets:Foo', raw: '1 USD' },
    ]);
  });
});

describe('mergePortfolio', () => {
  it('joins native and converted by account', () => {
    const native =
      'Assets:Investments:AAPL|10 AAPL\nAssets:Investments:BTC|0.5 BTC\n';
    const converted =
      'Assets:Investments:AAPL|USD 2000\nAssets:Investments:BTC|USD 30000\n';
    expect(mergePortfolio(native, converted)).toEqual([
      {
        account: 'Assets:Investments:AAPL',
        native: '10 AAPL',
        converted: 'USD 2000',
      },
      {
        account: 'Assets:Investments:BTC',
        native: '0.5 BTC',
        converted: 'USD 30000',
      },
    ]);
  });

  it('leaves converted empty when a commodity has no price', () => {
    const native = 'Assets:Investments:OBSCURE|5 OBSCURE\n';
    const converted = ''; // no price for OBSCURE → no converted row
    expect(mergePortfolio(native, converted)).toEqual([
      {
        account: 'Assets:Investments:OBSCURE',
        native: '5 OBSCURE',
        converted: '',
      },
    ]);
  });

  it('preserves native order, not converted', () => {
    const native = 'B|1 X\nA|1 Y\n';
    const converted = 'A|USD 10\nB|USD 20\n';
    const rows = mergePortfolio(native, converted);
    expect(rows.map((r) => r.account)).toEqual(['B', 'A']);
  });
});

describe('extractTotal', () => {
  it('returns the last column of the trailing rollup row', () => {
    // ledger emits the final total with empty account column in --flat mode.
    const stdout =
      'Assets:Investments:AAPL|USD 2000\nAssets:Investments:BTC|USD 30000\n|USD 32000\n';
    expect(extractTotal(stdout)).toBe('USD 32000');
  });

  it('returns empty for empty stdout', () => {
    expect(extractTotal('')).toBe('');
  });

  it('returns the only row when there is just one', () => {
    expect(extractTotal('Assets:Investments:AAPL|USD 2000\n')).toBe('USD 2000');
  });
});
