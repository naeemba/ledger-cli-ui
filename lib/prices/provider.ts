import { env } from '@/lib/env';

export type CryptoTarget = { symbol: string; id: string };
export type FiatTarget = { symbol: string; code: string };
export type FetchPlan = { crypto: CryptoTarget[]; fiat: FiatTarget[] };

export type PriceQuote = {
  symbol: string;
  /** The commodity `price` is denominated in. USD for crypto; for fiat we
   *  store raw Tether pivot rows, so this is `USD` or the fiat's own symbol. */
  quote: string;
  price: number;
  fetchedAt: Date;
};

/**
 * Synthetic pivot commodity. Fiat has no direct CoinGecko USD quote, so we
 * store the two raw legs CoinGecko *does* give — `USDT` in USD and `USDT` in
 * the fiat — and let ledger's price graph bridge `<fiat> → USDT → USD` at
 * valuation time. No fiat→USD arithmetic happens in JS.
 */
export const PIVOT_SYMBOL = 'USDT';
export type ProviderResult = {
  quotes: PriceQuote[];
  failed: { symbol: string }[];
};

type SimplePriceResponse = Record<string, Record<string, number>>;

const MAX_URL_LENGTH = 2000;
const TIMEOUT_MS = 10_000;
const TETHER_ID = 'tether';

const sleep = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

/**
 * Fetch every commodity price from CoinGecko's `/simple/price`. Crypto ids
 * resolve directly to a USD quote. Fiat has no direct USD quote, so we emit the
 * two raw Tether legs CoinGecko returns — one shared `USDT → USD` anchor plus a
 * `USDT → <fiat>` leg per fiat — and let ledger bridge `<fiat> → USDT → USD`
 * downstream (no fiat→USD division in JS). One request per URL-length chunk;
 * one retry on 429/5xx. `fetchedAt` is a single instant per call so the caller
 * can dedupe upserts by it.
 */
export const fetchPricesUsd = async (
  plan: FetchPlan,
  opts?: { signal?: AbortSignal }
): Promise<ProviderResult> => {
  if (plan.crypto.length === 0 && plan.fiat.length === 0) {
    return { quotes: [], failed: [] };
  }
  const fetchedAt = new Date();

  const vsSet = new Set<string>(['usd']);
  for (const fiat of plan.fiat) vsSet.add(fiat.code.toLowerCase());
  const vsCurrencies = Array.from(vsSet);

  const ids = new Set<string>(plan.crypto.map((crypto) => crypto.id));
  if (plan.fiat.length > 0) ids.add(TETHER_ID);

  // Merge all id → quote responses across URL-length chunks.
  const merged: SimplePriceResponse = {};
  for (const idChunk of chunkIds(Array.from(ids), vsCurrencies)) {
    const url =
      `${env.COINGECKO_API_BASE}/simple/price` +
      `?ids=${encodeURIComponent(idChunk.join(','))}` +
      `&vs_currencies=${encodeURIComponent(vsCurrencies.join(','))}`;
    const body = await fetchWithRetry(url, opts?.signal);
    if (body) Object.assign(merged, body);
  }

  const quotes: PriceQuote[] = [];
  const failed: { symbol: string }[] = [];

  for (const crypto of plan.crypto) {
    const price = merged[crypto.id]?.usd;
    if (typeof price === 'number' && Number.isFinite(price)) {
      quotes.push({ symbol: crypto.symbol, quote: 'USD', price, fetchedAt });
    } else {
      failed.push({ symbol: crypto.symbol });
    }
  }

  const tetherUsd = merged[TETHER_ID]?.usd;
  const tetherUsdValid =
    typeof tetherUsd === 'number' && Number.isFinite(tetherUsd);
  // Emit the shared `USDT → USD` anchor exactly once, the first time any fiat
  // resolves. Each fiat then contributes its own `USDT → <fiat>` leg; ledger
  // bridges `<fiat> → USDT → USD` from the two. No division here.
  let anchorEmitted = false;
  for (const fiat of plan.fiat) {
    const perFiat = merged[TETHER_ID]?.[fiat.code.toLowerCase()];
    if (
      tetherUsdValid &&
      typeof perFiat === 'number' &&
      Number.isFinite(perFiat) &&
      perFiat > 0
    ) {
      if (!anchorEmitted) {
        quotes.push({
          symbol: PIVOT_SYMBOL,
          quote: 'USD',
          price: tetherUsd,
          fetchedAt,
        });
        anchorEmitted = true;
      }
      quotes.push({
        symbol: PIVOT_SYMBOL,
        quote: fiat.symbol,
        price: perFiat,
        fetchedAt,
      });
    } else {
      failed.push({ symbol: fiat.symbol });
    }
  }

  return { quotes, failed };
};

const chunkIds = (ids: string[], vsCurrencies: string[]): string[][] => {
  const overhead =
    `${env.COINGECKO_API_BASE}/simple/price?ids=&vs_currencies=`.length +
    encodeURIComponent(vsCurrencies.join(',')).length;
  const budget = MAX_URL_LENGTH - overhead;
  const chunks: string[][] = [];
  let current: string[] = [];
  let currentLength = 0;
  for (const id of ids) {
    const add = (current.length === 0 ? 0 : 1) + encodeURIComponent(id).length;
    if (currentLength + add > budget && current.length > 0) {
      chunks.push(current);
      current = [];
      currentLength = 0;
    }
    current.push(id);
    currentLength += add;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
};

const fetchWithRetry = async (
  url: string,
  signal: AbortSignal | undefined
): Promise<SimplePriceResponse | null> => {
  for (let attempt = 0; attempt < 2; attempt++) {
    const timeout = AbortSignal.timeout(TIMEOUT_MS);
    const mergedSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
    try {
      const response = await fetch(url, { signal: mergedSignal });
      if (response.ok) return (await response.json()) as SimplePriceResponse;
      if (
        response.status === 429 ||
        (response.status >= 500 && response.status < 600)
      ) {
        if (attempt === 0) {
          await sleep(1000);
          continue;
        }
      }
      return null;
    } catch (error) {
      if (attempt === 0) {
        await sleep(1000);
        continue;
      }
      throw error;
    }
  }
  return null;
};
