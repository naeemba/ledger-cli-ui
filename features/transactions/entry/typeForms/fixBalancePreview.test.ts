import { describe, it, expect } from 'vitest';
import { extractAccountBalance } from './fixBalancePreview';

describe('extractAccountBalance', () => {
  it('extracts the numeric balance for the matching account', () => {
    const stdout = 'Assets:Cash|1,240.00 USD\n';
    expect(extractAccountBalance(stdout, 'Assets:Cash')).toBe('1240.00');
  });

  it('handles negative balances and a leading symbol', () => {
    const stdout = 'Liabilities:Card|$-50.00\n';
    expect(extractAccountBalance(stdout, 'Liabilities:Card')).toBe('-50.00');
  });

  it('returns "0" when the account is absent', () => {
    expect(extractAccountBalance('', 'Assets:Cash')).toBe('0');
  });
});
