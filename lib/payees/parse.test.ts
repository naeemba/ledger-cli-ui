import { describe, it, expect } from 'vitest';
import { parsePayeeRows } from './parse';

describe('parsePayeeRows', () => {
  it('returns an empty array for empty input', () => {
    expect(parsePayeeRows('')).toEqual([]);
  });

  it('maps one row per payee, preserving ledger order', () => {
    // ledger already collapsed + sorted descending via --by-payee --collapse
    // --sort '-display_amount'; the parser must not re-order.
    const stdout =
      'NNNWhole Foods|$ 100.00\nNNNAmazon|$ 20.00\nNNNCafe|$ 12.50\n';
    expect(parsePayeeRows(stdout)).toEqual([
      { payee: 'Whole Foods', total: 100 },
      { payee: 'Amazon', total: 20 },
      { payee: 'Cafe', total: 12.5 },
    ]);
  });

  it('drops the Commodities revalued pseudo-payee', () => {
    const stdout = 'NNNWhole Foods|$ 100.00\nNNNCommodities revalued|$ 12.00\n';
    expect(parsePayeeRows(stdout)).toEqual([
      { payee: 'Whole Foods', total: 100 },
    ]);
  });

  it('skips zero and negative totals', () => {
    const stdout = 'NNNWhole Foods|$ 100.00\nNNNRefund|$ -5.00\n';
    expect(parsePayeeRows(stdout)).toEqual([
      { payee: 'Whole Foods', total: 100 },
    ]);
  });

  it('parses amounts with a leading commodity, commas, or bare numbers', () => {
    const stdout = 'NNNX|$ 1,234.50\nNNNY|USD 7\nNNNZ|42.00\n';
    expect(parsePayeeRows(stdout)).toEqual([
      { payee: 'X', total: 1234.5 },
      { payee: 'Y', total: 7 },
      { payee: 'Z', total: 42 },
    ]);
  });
});
