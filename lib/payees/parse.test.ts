import { describe, it, expect } from 'vitest';
import { parsePayeeRows } from './parse';

describe('parsePayeeRows', () => {
  it('returns an empty array for empty input', () => {
    expect(parsePayeeRows('')).toEqual([]);
  });

  it('aggregates amounts per payee and sorts descending', () => {
    const stdout =
      'NNNAmazon|USD 12.50\nNNNAmazon|USD 7.50\nNNNWhole Foods|USD 100.00\n';
    expect(parsePayeeRows(stdout)).toEqual([
      { payee: 'Whole Foods', total: 100 },
      { payee: 'Amazon', total: 20 },
    ]);
  });

  it('skips zero and negative totals', () => {
    const stdout = 'NNNRefund|USD -5.00\nNNNWhole Foods|USD 100.00\n';
    expect(parsePayeeRows(stdout)).toEqual([
      { payee: 'Whole Foods', total: 100 },
    ]);
  });

  it('handles amounts with comma thousand separators and bare numbers', () => {
    const stdout = 'NNNX|1,234.50\nNNNY|USD 7\n';
    expect(parsePayeeRows(stdout)).toEqual([
      { payee: 'X', total: 1234.5 },
      { payee: 'Y', total: 7 },
    ]);
  });
});
