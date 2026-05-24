import { describe, it, expect } from 'vitest';
import { parseBalanceRows } from './parse';

describe('parseBalanceRows', () => {
  it('returns an empty array for empty input', () => {
    expect(parseBalanceRows('')).toEqual([]);
  });

  it('parses one row per non-empty line', () => {
    const stdout = `Assets:Checking|1,234.50
Assets:Brokerage|5,000.00
Liabilities:Card|-200.00
`;
    expect(parseBalanceRows(stdout)).toEqual([
      { account: 'Assets:Checking', amount: '1,234.50' },
      { account: 'Assets:Brokerage', amount: '5,000.00' },
      { account: 'Liabilities:Card', amount: '-200.00' },
    ]);
  });

  it('treats a leading blank account as the Total row', () => {
    const stdout = `Assets:Checking|1,234.50
|6,034.50
`;
    expect(parseBalanceRows(stdout)).toEqual([
      { account: 'Assets:Checking', amount: '1,234.50' },
      { account: 'Total', amount: '6,034.50' },
    ]);
  });

  it('ignores lines without a pipe', () => {
    const stdout = `Assets:Checking|1,234.50
junk-no-pipe
Assets:Brokerage|5,000.00
`;
    expect(parseBalanceRows(stdout)).toEqual([
      { account: 'Assets:Checking', amount: '1,234.50' },
      { account: 'Assets:Brokerage', amount: '5,000.00' },
    ]);
  });
});
