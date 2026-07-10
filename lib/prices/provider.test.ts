import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { fetchPricesUsd, PIVOT_SYMBOL } from './provider';

const ok = (body: unknown, status = 200): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }) as Response;

describe('fetchPricesUsd', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-05T06:00:00.000Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('resolves crypto ids to USD prices in one request', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        ok({ bitcoin: { usd: 62655 }, cardano: { usd: 0.19 } })
      );
    const result = await fetchPricesUsd({
      crypto: [
        { symbol: 'BTC', id: 'bitcoin' },
        { symbol: 'ADA', id: 'cardano' },
      ],
      fiat: [],
    });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(result.quotes).toEqual([
      {
        symbol: 'BTC',
        quote: 'USD',
        price: 62655,
        fetchedAt: expect.any(Date),
      },
      { symbol: 'ADA', quote: 'USD', price: 0.19, fetchedAt: expect.any(Date) },
    ]);
    expect(result.failed).toEqual([]);
  });

  it('emits raw Tether pivot legs for a fiat (no JS division)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      ok({ tether: { usd: 0.999108, eur: 0.873613 } })
    );
    const result = await fetchPricesUsd({
      crypto: [],
      fiat: [{ symbol: 'EUR', code: 'EUR' }],
    });
    // Store the two raw legs verbatim; ledger derives EUR→USD.
    expect(result.quotes).toEqual([
      {
        symbol: PIVOT_SYMBOL,
        quote: 'USD',
        price: 0.999108,
        fetchedAt: expect.any(Date),
      },
      {
        symbol: PIVOT_SYMBOL,
        quote: 'EUR',
        price: 0.873613,
        fetchedAt: expect.any(Date),
      },
    ]);
    expect(result.failed).toEqual([]);
  });

  it('emits the USDT→USD anchor once for multiple fiats', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      ok({ tether: { usd: 1.0, eur: 0.9, gbp: 0.8 } })
    );
    const result = await fetchPricesUsd({
      crypto: [],
      fiat: [
        { symbol: 'EUR', code: 'EUR' },
        { symbol: 'GBP', code: 'GBP' },
      ],
    });
    expect(result.quotes).toEqual([
      { symbol: 'USDT', quote: 'USD', price: 1.0, fetchedAt: expect.any(Date) },
      { symbol: 'USDT', quote: 'EUR', price: 0.9, fetchedAt: expect.any(Date) },
      { symbol: 'USDT', quote: 'GBP', price: 0.8, fetchedAt: expect.any(Date) },
    ]);
    expect(result.failed).toEqual([]);
  });

  it('marks unresolved crypto as failed', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      ok({ bitcoin: { usd: 62655 } })
    );
    const result = await fetchPricesUsd({
      crypto: [
        { symbol: 'BTC', id: 'bitcoin' },
        { symbol: 'GHOST', id: 'ghostcoin' },
      ],
      fiat: [],
    });
    expect(result.quotes).toHaveLength(1);
    expect(result.failed).toEqual([{ symbol: 'GHOST' }]);
  });

  it('marks fiat as failed when tether pivot is missing', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(ok({ tether: { usd: 1 } }));
    const result = await fetchPricesUsd({
      crypto: [],
      fiat: [{ symbol: 'GEL', code: 'GEL' }],
    });
    expect(result.failed).toEqual([{ symbol: 'GEL' }]);
  });

  it('returns empty without fetching for an empty plan', async () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    const result = await fetchPricesUsd({ crypto: [], fiat: [] });
    expect(spy).not.toHaveBeenCalled();
    expect(result).toEqual({ quotes: [], failed: [] });
  });

  it('retries once on 429', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(ok({}, 429))
      .mockResolvedValueOnce(ok({ bitcoin: { usd: 62655 } }));
    const p = fetchPricesUsd({
      crypto: [{ symbol: 'BTC', id: 'bitcoin' }],
      fiat: [],
    });
    await vi.advanceTimersByTimeAsync(1000);
    const result = await p;
    expect(spy).toHaveBeenCalledTimes(2);
    expect(result.quotes).toHaveLength(1);
  });
});
