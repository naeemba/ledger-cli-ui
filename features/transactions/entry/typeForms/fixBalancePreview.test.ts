import { describe, it, expect } from 'vitest';
import { extractAccountBalance, isSafeLedgerArg } from './fixBalancePreview';

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

describe('isSafeLedgerArg', () => {
  it('accepts ordinary account paths and currencies', () => {
    expect(isSafeLedgerArg('Assets:Cash')).toBe(true);
    expect(isSafeLedgerArg('Liabilities:Credit Card')).toBe(true);
    expect(isSafeLedgerArg('USD')).toBe(true);
  });

  it('rejects empty / whitespace-only values', () => {
    expect(isSafeLedgerArg('')).toBe(false);
    expect(isSafeLedgerArg('   ')).toBe(false);
  });

  it('rejects values that begin with a dash (argv flag smuggling)', () => {
    expect(isSafeLedgerArg('-X')).toBe(false);
    expect(isSafeLedgerArg('--init-file=/etc/passwd')).toBe(false);
    expect(isSafeLedgerArg('  --collapse')).toBe(false);
  });
});
