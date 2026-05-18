import { describe, it, expect } from 'vitest';
import { parseHeader } from './parser';

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
