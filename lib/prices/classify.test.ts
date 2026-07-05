import { describe, it, expect } from 'vitest';
import { classifyCommodity } from './classify';

const coinMap = new Map<string, string>([
  ['BTC', 'bitcoin'],
  ['ADA', 'cardano'],
  ['NIM', 'nimiq'], // collides with the Iranian half gold-coin
]);

describe('classifyCommodity', () => {
  it('classifies known fiat first, before any coin match', () => {
    expect(classifyCommodity('EUR', coinMap)).toEqual({
      kind: 'fiat',
      providerId: 'EUR',
    });
    expect(classifyCommodity('gel', coinMap)).toEqual({
      kind: 'fiat',
      providerId: 'GEL',
    });
  });
  it('classifies a market-cap-ranked coin as crypto', () => {
    expect(classifyCommodity('btc', coinMap)).toEqual({
      kind: 'crypto',
      providerId: 'bitcoin',
    });
    expect(classifyCommodity('ADA', coinMap)).toEqual({
      kind: 'crypto',
      providerId: 'cardano',
    });
  });
  it('falls through to manual for unknown symbols', () => {
    expect(classifyCommodity('KIRT', coinMap)).toEqual({
      kind: 'manual',
      providerId: null,
    });
    expect(classifyCommodity('SEKKE', coinMap)).toEqual({
      kind: 'manual',
      providerId: null,
    });
  });
});
