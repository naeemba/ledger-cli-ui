import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { fetchPrices } from './provider';

const json = (body: unknown, status = 200): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }) as Response;

describe('fetchPrices', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-25T06:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('returns a flat list of quotes from a pricemulti response', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(json({ BTC: { USD: 67000 }, ADA: { USD: 0.41 } }));

    const result = await fetchPrices([
      { symbol: 'BTC', quote: 'USD' },
      { symbol: 'ADA', quote: 'USD' },
    ]);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(result.quotes).toEqual([
      {
        symbol: 'BTC',
        quote: 'USD',
        price: 67000,
        fetchedAt: expect.any(Date),
      },
      { symbol: 'ADA', quote: 'USD', price: 0.41, fetchedAt: expect.any(Date) },
    ]);
    expect(result.failed).toEqual([]);
  });

  it('groups pairs by quote and makes one request per quote group', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (url: any) => {
        const u = String(url);
        if (u.includes('tsyms=USD')) return json({ BTC: { USD: 67000 } });
        if (u.includes('tsyms=EUR')) return json({ ADA: { EUR: 0.38 } });
        throw new Error('unexpected URL ' + u);
      });

    const result = await fetchPrices([
      { symbol: 'BTC', quote: 'USD' },
      { symbol: 'ADA', quote: 'EUR' },
    ]);

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(result.quotes).toHaveLength(2);
  });

  it('puts missing symbols into the failed list', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      json({ BTC: { USD: 67000 } })
    );

    const result = await fetchPrices([
      { symbol: 'BTC', quote: 'USD' },
      { symbol: 'UNKNOWN', quote: 'USD' },
    ]);

    expect(result.quotes).toHaveLength(1);
    expect(result.failed).toEqual([{ symbol: 'UNKNOWN', quote: 'USD' }]);
  });

  it('retries once on 429', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json({}, 429))
      .mockResolvedValueOnce(json({ BTC: { USD: 67000 } }));

    const resultPromise = fetchPrices([{ symbol: 'BTC', quote: 'USD' }]);
    await vi.advanceTimersByTimeAsync(1000);
    const result = await resultPromise;

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(result.quotes).toHaveLength(1);
  });

  it('returns empty result for empty input without calling fetch', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const result = await fetchPrices([]);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.quotes).toEqual([]);
    expect(result.failed).toEqual([]);
  });

  it('retries once on 5xx', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json({}, 500))
      .mockResolvedValueOnce(json({ BTC: { USD: 67000 } }));

    const resultPromise = fetchPrices([{ symbol: 'BTC', quote: 'USD' }]);
    await vi.advanceTimersByTimeAsync(1000);
    const result = await resultPromise;

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(result.quotes).toHaveLength(1);
  });

  it('throws on second network error', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new TypeError('network error'))
      .mockRejectedValueOnce(new TypeError('network error'));

    const resultPromise = fetchPrices([{ symbol: 'BTC', quote: 'USD' }]);
    const assertion = expect(resultPromise).rejects.toThrow('network error');
    await vi.advanceTimersByTimeAsync(1000);
    await assertion;
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
