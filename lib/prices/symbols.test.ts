import { describe, it, expect } from 'vitest';
import { normalizeCommoditySymbol } from './symbols';

describe('normalizeCommoditySymbol', () => {
  it('returns the uppercase symbol unchanged', () => {
    expect(normalizeCommoditySymbol('BTC')).toBe('BTC');
    expect(normalizeCommoditySymbol('btc')).toBe('BTC');
  });

  it('strips one pair of surrounding single quotes', () => {
    expect(normalizeCommoditySymbol("'1INCH'")).toBe('1INCH');
  });

  it('strips one pair of surrounding double quotes', () => {
    expect(normalizeCommoditySymbol('"1INCH"')).toBe('1INCH');
  });

  it('maps $ to USD', () => {
    expect(normalizeCommoditySymbol('$')).toBe('USD');
  });

  it('returns null for whitespace-containing names', () => {
    expect(normalizeCommoditySymbol('My Stock')).toBeNull();
    expect(normalizeCommoditySymbol('"My Stock"')).toBeNull();
  });

  it('returns null for empty / whitespace-only input', () => {
    expect(normalizeCommoditySymbol('')).toBeNull();
    expect(normalizeCommoditySymbol('   ')).toBeNull();
    expect(normalizeCommoditySymbol('""')).toBeNull();
  });

  it('returns null for non-alphanumeric characters', () => {
    expect(normalizeCommoditySymbol('BTC/USD')).toBeNull();
    expect(normalizeCommoditySymbol('B-T-C')).toBeNull();
  });
});
