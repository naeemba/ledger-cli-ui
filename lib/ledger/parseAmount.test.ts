import { describe, it, expect } from 'vitest';
import { parseAmount } from './parseAmount';

describe('parseAmount', () => {
  it('returns 0 for empty input', () => {
    expect(parseAmount('')).toBe(0);
  });

  it('parses a commodity-prefixed amount, stripping thousands separators', () => {
    expect(parseAmount('USD 12,000.00')).toBe(12000);
  });

  it('parses a bare numeric amount (no commodity prefix)', () => {
    expect(parseAmount('12,000.00')).toBe(12000);
  });

  it('parses negatives', () => {
    expect(parseAmount('USD -1,500.50')).toBe(-1500.5);
  });

  it('falls back to 0 on an unparsable amount', () => {
    expect(parseAmount('USD abc')).toBe(0);
  });
});
