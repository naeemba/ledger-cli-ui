import { describe, it, expect } from 'vitest';
import { isFiatCode, SUPPORTED_FIAT } from './fiat';

describe('isFiatCode', () => {
  it('recognizes CoinGecko-quotable fiats (case-insensitive)', () => {
    for (const code of ['USD', 'EUR', 'TRY', 'AUD', 'CAD', 'GEL', 'gel']) {
      expect(isFiatCode(code)).toBe(true);
    }
  });
  it('rejects crypto and local symbols', () => {
    for (const code of ['BTC', 'ADA', 'KIRT', 'SEKKE', 'NIM']) {
      expect(isFiatCode(code)).toBe(false);
    }
  });
  it('exposes USD in the set', () => {
    expect(SUPPORTED_FIAT.has('USD')).toBe(true);
  });
});
