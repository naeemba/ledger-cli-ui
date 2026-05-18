import { describe, it, expect } from 'vitest';
import { parseHeader, parsePostingLine } from './parser';

describe('parseHeader', () => {
  it('parses YYYY-MM-DD with no status', () => {
    expect(parseHeader('2024-09-01 lunch')).toEqual({
      date: '2024-09-01',
      status: 'none',
      payee: 'lunch',
    });
  });

  it('parses YYYY/MM/DD and normalizes to YYYY-MM-DD', () => {
    expect(parseHeader('2024/09/01 lunch')).toEqual({
      date: '2024-09-01',
      status: 'none',
      payee: 'lunch',
    });
  });

  it('parses cleared marker', () => {
    expect(parseHeader("2024-09-01 * Trader Joe's")).toEqual({
      date: '2024-09-01',
      status: 'cleared',
      payee: "Trader Joe's",
    });
  });

  it('parses pending marker', () => {
    expect(parseHeader('2024-09-01 ! rent')).toEqual({
      date: '2024-09-01',
      status: 'pending',
      payee: 'rent',
    });
  });

  it('trims payee whitespace', () => {
    expect(parseHeader('2024-09-01    lunch with darya   ')).toEqual({
      date: '2024-09-01',
      status: 'none',
      payee: 'lunch with darya',
    });
  });

  it('returns null for non-header lines', () => {
    expect(parseHeader('    Expenses:Food  10')).toBeNull();
    expect(parseHeader('; a comment')).toBeNull();
    expect(parseHeader('')).toBeNull();
  });

  it('returns null for missing payee', () => {
    expect(parseHeader('2024-09-01')).toBeNull();
    expect(parseHeader('2024-09-01 *')).toBeNull();
  });
});

describe('parsePostingLine', () => {
  it('parses currency-before amount with space indent', () => {
    expect(parsePostingLine('    Expenses:Food  USD 10')).toEqual({
      account: 'Expenses:Food',
      amount: '10',
      currency: 'USD',
    });
  });

  it('parses currency-after amount with tab indent', () => {
    expect(parsePostingLine('\tExpenses:Family\t322 Kirt')).toEqual({
      account: 'Expenses:Family',
      amount: '322',
      currency: 'Kirt',
    });
  });

  it('strips comma thousands separators', () => {
    expect(parsePostingLine('\tAssets:Bank\t-1,000 Kirt')).toEqual({
      account: 'Assets:Bank',
      amount: '-1000',
      currency: 'Kirt',
    });
  });

  it('parses negative amount', () => {
    expect(parsePostingLine('    Assets:Cash  USD -42.50')).toEqual({
      account: 'Assets:Cash',
      amount: '-42.50',
      currency: 'USD',
    });
  });

  it('returns blank amount for bare-account auto-balance', () => {
    expect(parsePostingLine('    Assets:Bank:Blubank')).toEqual({
      account: 'Assets:Bank:Blubank',
      amount: '',
      currency: '',
    });
  });

  it('handles decimal amounts', () => {
    expect(parsePostingLine('\tAssets:Bank\t65.14 Kirt')).toEqual({
      account: 'Assets:Bank',
      amount: '65.14',
      currency: 'Kirt',
    });
  });

  it('returns null for non-posting lines', () => {
    expect(parsePostingLine('2024-09-01 lunch')).toBeNull();
    expect(parsePostingLine('    ; note')).toBeNull();
    expect(parsePostingLine('')).toBeNull();
  });
});
