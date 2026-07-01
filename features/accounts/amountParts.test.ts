import { describe, it, expect } from 'vitest';
import { parseAmountParts } from './amountParts';

describe('parseAmountParts', () => {
  it('parses a positive amount with a unit', () => {
    expect(parseAmountParts('$ 3,170.00')).toEqual({
      unit: '$',
      magnitude: '3,170.00',
      negative: false,
      signed: 3170,
    });
  });
  it('parses a negative amount (minus after the unit)', () => {
    expect(parseAmountParts('$ -200.00')).toEqual({
      unit: '$',
      magnitude: '200.00',
      negative: true,
      signed: -200,
    });
  });
  it('parses a code-style unit', () => {
    expect(parseAmountParts('USD 1,000.00')).toEqual({
      unit: 'USD',
      magnitude: '1,000.00',
      negative: false,
      signed: 1000,
    });
  });
  it('parses a unit-less amount', () => {
    expect(parseAmountParts('42.50')).toEqual({
      unit: '',
      magnitude: '42.50',
      negative: false,
      signed: 42.5,
    });
  });
  it('returns empty parts for blank input', () => {
    expect(parseAmountParts('')).toEqual({
      unit: '',
      magnitude: '',
      negative: false,
      signed: 0,
    });
  });
});
