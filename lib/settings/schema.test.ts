import { describe, it, expect } from 'vitest';
import { baseCurrencySchema } from './schema';

describe('baseCurrencySchema', () => {
  it.each([
    ['USD'],
    ['EUR'],
    ['Kirt'],
    ['My Coin'],
    ['  USD  '], // trims
  ])('accepts %s', (input) => {
    const parsed = baseCurrencySchema.parse(input);
    expect(parsed.length).toBeGreaterThan(0);
  });

  it.each([[''], ['   '], ['x'.repeat(33)], ['bad\x00ccy'], ['bad\nccy']])(
    'rejects %s',
    (input) => {
      expect(() => baseCurrencySchema.parse(input)).toThrow();
    }
  );

  it('trims surrounding whitespace', () => {
    expect(baseCurrencySchema.parse('  USD  ')).toBe('USD');
  });
});
