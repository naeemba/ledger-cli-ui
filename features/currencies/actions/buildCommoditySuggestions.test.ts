import { describe, expect, it } from 'vitest';
import {
  buildCommoditySuggestions,
  type JournalMapping,
} from './buildCommoditySuggestions';
import type { CoinSearchHit } from '@/lib/prices/coingecko/coinCache';

const noMappings = new Map<string, JournalMapping>();
const noCoinMap = new Map<string, string>();
const FIAT = ['USD', 'EUR', 'TRY'] as const;

const coinHit = (over: Partial<CoinSearchHit>): CoinSearchHit => ({
  id: 'kirobo',
  symbol: 'kirt',
  name: 'Kirobo',
  marketCapRank: 812,
  thumb: null,
  ...over,
});

describe('buildCommoditySuggestions', () => {
  it('returns only journal commodities for an empty query, in order', () => {
    const result = buildCommoditySuggestions({
      query: '',
      journal: ['KIRT', 'NIM', 'USDT'],
      mappings: noMappings,
      coinMap: noCoinMap,
      fiatCodes: FIAT,
      coinHits: [],
    });

    expect(result.map((s) => s.symbol)).toEqual(['KIRT', 'NIM', 'USDT']);
    expect(result.every((s) => s.detail === 'in your journal')).toBe(true);
  });

  it('filters journal commodities by a case-insensitive substring match', () => {
    const result = buildCommoditySuggestions({
      query: 'ki',
      journal: ['KIRT', 'NIM'],
      mappings: noMappings,
      coinMap: noCoinMap,
      fiatCodes: FIAT,
      coinHits: [],
    });

    expect(result.map((s) => s.symbol)).toContain('KIRT');
    expect(result.map((s) => s.symbol)).not.toContain('NIM');
  });

  it('ranks a matching journal commodity above the online crypto hit', () => {
    const result = buildCommoditySuggestions({
      query: 'kirt',
      journal: ['KIRT'],
      mappings: noMappings,
      coinMap: noCoinMap,
      fiatCodes: FIAT,
      coinHits: [coinHit({ symbol: 'kirt2', id: 'other-kirt' })],
    });

    expect(result[0]?.symbol).toBe('KIRT');
    expect(result[0]?.detail).toBe('in your journal');
  });

  it('preserves an existing user mapping instead of re-classifying', () => {
    const mappings = new Map<string, JournalMapping>([
      ['NIM', { kind: 'manual', providerId: null }],
    ]);
    // coinMap would otherwise classify NIM as the crypto "nimiq".
    const coinMap = new Map([['NIM', 'nimiq']]);

    const [nim] = buildCommoditySuggestions({
      query: '',
      journal: ['NIM'],
      mappings,
      coinMap,
      fiatCodes: FIAT,
      coinHits: [],
    });

    expect(nim?.kind).toBe('manual');
    expect(nim?.providerId).toBeNull();
  });

  it('auto-classifies an unmapped journal fiat symbol', () => {
    const [usd] = buildCommoditySuggestions({
      query: '',
      journal: ['USD'],
      mappings: noMappings,
      coinMap: noCoinMap,
      fiatCodes: FIAT,
      coinHits: [],
    });

    expect(usd?.kind).toBe('fiat');
    expect(usd?.providerId).toBe('USD');
  });

  it('de-duplicates a symbol shared between journal, fiat, and manual', () => {
    const result = buildCommoditySuggestions({
      query: 'usd',
      journal: ['USD'],
      mappings: noMappings,
      coinMap: noCoinMap,
      fiatCodes: FIAT,
      coinHits: [],
    });

    expect(result.filter((s) => s.symbol === 'USD')).toHaveLength(1);
    expect(result[0]?.detail).toBe('in your journal');
    // No "Use USD as a manual commodity" fallback when USD is already offered.
    expect(result.some((s) => s.kind === 'manual')).toBe(false);
  });

  it('offers fiat, crypto, and a manual fallback for a novel query', () => {
    const result = buildCommoditySuggestions({
      query: 'eu',
      journal: [],
      mappings: noMappings,
      coinMap: noCoinMap,
      fiatCodes: FIAT,
      coinHits: [coinHit({ symbol: 'eurx', id: 'euler', name: 'Euler' })],
    });

    expect(result.find((s) => s.symbol === 'EUR')?.kind).toBe('fiat');
    expect(result.find((s) => s.symbol === 'EURX')?.kind).toBe('crypto');
    // "EU" itself matches no fiat/crypto exactly, so a manual fallback closes.
    expect(result.at(-1)?.kind).toBe('manual');
    expect(result.at(-1)?.symbol).toBe('EU');
  });
});
