import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { getCoinSymbolMap, searchCoins, resetCoinCache } from './coinCache';

const ok = (body: unknown): Response =>
  ({ ok: true, status: 200, json: async () => body }) as Response;

describe('coinCache', () => {
  beforeEach(() => resetCoinCache());
  afterEach(() => vi.restoreAllMocks());

  it('maps a symbol to its highest-market-cap id', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      ok([
        { id: 'cardano', symbol: 'ada', market_cap_rank: 16 },
        { id: 'cardano-wormhole', symbol: 'ada', market_cap_rank: 3000 },
        { id: 'bitcoin', symbol: 'btc', market_cap_rank: 1 },
      ])
    );
    const map = await getCoinSymbolMap();
    expect(map.get('ADA')).toBe('cardano');
    expect(map.get('BTC')).toBe('bitcoin');
  });

  it('caches within TTL (one fetch for two calls)', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        ok([{ id: 'bitcoin', symbol: 'btc', market_cap_rank: 1 }])
      );
    await getCoinSymbolMap();
    await getCoinSymbolMap();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('normalizes /search hits', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      ok({
        coins: [
          {
            id: 'cardano',
            name: 'Cardano',
            symbol: 'ADA',
            market_cap_rank: 16,
            thumb: 't.png',
          },
        ],
      })
    );
    const hits = await searchCoins('cardano');
    expect(hits[0]).toEqual({
      id: 'cardano',
      symbol: 'ADA',
      name: 'Cardano',
      marketCapRank: 16,
      thumb: 't.png',
    });
  });
});
