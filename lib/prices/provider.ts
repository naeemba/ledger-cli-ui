export type QuotePair = { symbol: string; quote: string };
export type PriceQuote = QuotePair & { price: number; fetchedAt: Date };

export type ProviderResult = {
  quotes: PriceQuote[];
  failed: QuotePair[];
};

const ENDPOINT = 'https://min-api.cryptocompare.com/data/pricemulti';
const MAX_URL_LENGTH = 2000;
const TIMEOUT_MS = 10_000;

type CryptoCompareResponse = Record<string, Record<string, number>>;

const sleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

/**
 * Batch-fetch prices from cryptocompare's pricemulti endpoint. Groups input
 * pairs by quote currency, then issues one request per group (splitting
 * further if the URL would exceed 2KB). One retry on 429 / 5xx.
 *
 * No DB, no fs — pure HTTP + parsing. The same `fetchedAt` Date is attached
 * to every quote in a single call so the caller can use it as the
 * upsert-dedupe key.
 */
export const fetchPrices = async (
  pairs: QuotePair[],
  opts?: { signal?: AbortSignal }
): Promise<ProviderResult> => {
  if (pairs.length === 0) return { quotes: [], failed: [] };

  const fetchedAt = new Date();
  const byQuote = new Map<string, Set<string>>();
  for (const p of pairs) {
    if (!byQuote.has(p.quote)) byQuote.set(p.quote, new Set());
    byQuote.get(p.quote)!.add(p.symbol);
  }

  const quotes: PriceQuote[] = [];
  const found = new Set<string>(); // `${symbol}|${quote}` of resolved pairs

  for (const [quote, symbolSet] of byQuote) {
    for (const fsymsChunk of chunkSymbols(Array.from(symbolSet), quote)) {
      const url = `${ENDPOINT}?fsyms=${encodeURIComponent(fsymsChunk.join(','))}&tsyms=${encodeURIComponent(quote)}`;
      const body = await fetchWithRetry(url, opts?.signal);
      for (const symbol of fsymsChunk) {
        const price = body?.[symbol]?.[quote];
        if (typeof price === 'number' && Number.isFinite(price)) {
          quotes.push({ symbol, quote, price, fetchedAt });
          found.add(`${symbol}|${quote}`);
        }
      }
    }
  }

  const failed = pairs.filter((p) => !found.has(`${p.symbol}|${p.quote}`));
  return { quotes, failed };
};

const chunkSymbols = (symbols: string[], quote: string): string[][] => {
  const overhead =
    ENDPOINT.length +
    '?fsyms=&tsyms='.length +
    encodeURIComponent(quote).length;
  const budget = MAX_URL_LENGTH - overhead;
  const chunks: string[][] = [];
  let current: string[] = [];
  let len = 0;
  for (const s of symbols) {
    const add = (current.length === 0 ? 0 : 1) + encodeURIComponent(s).length;
    if (len + add > budget && current.length > 0) {
      chunks.push(current);
      current = [];
      len = 0;
    }
    current.push(s);
    len += add;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
};

const fetchWithRetry = async (
  url: string,
  signal: AbortSignal | undefined
): Promise<CryptoCompareResponse | null> => {
  for (let attempt = 0; attempt < 2; attempt++) {
    const timeout = AbortSignal.timeout(TIMEOUT_MS);
    const merged = signal ? AbortSignal.any([signal, timeout]) : timeout;
    try {
      const res = await fetch(url, { signal: merged });
      if (res.ok) return (await res.json()) as CryptoCompareResponse;
      if (res.status === 429 || (res.status >= 500 && res.status < 600)) {
        if (attempt === 0) {
          await sleep(1000);
          continue;
        }
      }
      return null;
    } catch (err) {
      if (attempt === 0) {
        await sleep(1000);
        continue;
      }
      throw err;
    }
  }
  return null;
};
