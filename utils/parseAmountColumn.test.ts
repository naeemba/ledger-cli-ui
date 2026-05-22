import { describe, it, expect } from 'vitest';
import { parseAmountColumn } from './parseAmountColumn';

describe('parseAmountColumn', () => {
  it('extracts a unit-less amount', () => {
    expect(parseAmountColumn('100')).toBe(100);
  });

  it('extracts amount with currency prefix and space', () => {
    expect(parseAmountColumn('USD 100')).toBe(100);
  });

  it('extracts amount with currency suffix and space', () => {
    expect(parseAmountColumn('100 USD')).toBe(100);
  });

  it('extracts amount with currency symbol prefix (no space)', () => {
    expect(parseAmountColumn('$100')).toBe(100);
  });

  it('strips comma thousands separators', () => {
    expect(parseAmountColumn('-1,234.56 USD')).toBe(-1234.56);
  });

  it('handles negative amounts', () => {
    expect(parseAmountColumn('USD -42.50')).toBe(-42.5);
  });

  it('returns 0 for null / undefined / empty', () => {
    expect(parseAmountColumn(null)).toBe(0);
    expect(parseAmountColumn(undefined)).toBe(0);
    expect(parseAmountColumn('')).toBe(0);
  });

  it('returns 0 when no numeric token is present', () => {
    expect(parseAmountColumn('no digits here')).toBe(0);
  });
});
