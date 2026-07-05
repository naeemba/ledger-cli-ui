import { env } from '@/lib/env';

export type CoinSearchHit = {
  id: string;
  symbol: string;
  name: string;
  marketCapRank: number | null;
  thumb: string | null;
};

type MarketCoin = {
  id: string;
  symbol: string;
  market_cap_rank: number | null;
};
type SearchResponse = {
  coins?: Array<{
    id: string;
    name: string;
    symbol: string;
    market_cap_rank: number | null;
    thumb: string | null;
  }>;
};

const TTL_MS = 24 * 60 * 60 * 1000;
const MARKET_PAGES = 4; // 4 * 250 = top 1000 coins by market cap
const TIMEOUT_MS = 15_000;

let cached: { at: number; map: Map<string, string> } | null = null;
let inFlight: Promise<Map<string, string>> | null = null;

export const resetCoinCache = (): void => {
  cached = null;
  inFlight = null;
};

const nowMs = (): number => Date.now();

const fetchJson = async (
  url: string,
  signal?: AbortSignal
): Promise<unknown> => {
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  const merged = signal ? AbortSignal.any([signal, timeout]) : timeout;
  const res = await fetch(url, { signal: merged });
  if (!res.ok) throw new Error(`CoinGecko ${res.status} for ${url}`);
  return res.json();
};

const buildMap = async (signal?: AbortSignal): Promise<Map<string, string>> => {
  const map = new Map<string, string>();
  // Walk top pages by descending market cap; first-writer-wins per symbol means
  // the highest-cap coin claims an ambiguous ticker (e.g. ADA → cardano).
  for (let page = 1; page <= MARKET_PAGES; page++) {
    const url = `${env.COINGECKO_API_BASE}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=${page}`;
    const rows = (await fetchJson(url, signal)) as MarketCoin[];
    if (!Array.isArray(rows) || rows.length === 0) break;
    for (const row of rows) {
      const key = row.symbol?.toUpperCase();
      if (key && !map.has(key)) map.set(key, row.id);
    }
    if (rows.length < 250) break; // Last page; fewer coins than page size
  }
  return map;
};

export const getCoinSymbolMap = async (opts?: {
  signal?: AbortSignal;
}): Promise<Map<string, string>> => {
  if (cached && nowMs() - cached.at < TTL_MS) return cached.map;
  if (inFlight) return inFlight;
  inFlight = buildMap(opts?.signal)
    .then((map) => {
      cached = { at: nowMs(), map };
      return map;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
};

export const searchCoins = async (
  query: string,
  opts?: { signal?: AbortSignal }
): Promise<CoinSearchHit[]> => {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const url = `${env.COINGECKO_API_BASE}/search?query=${encodeURIComponent(trimmed)}`;
  const body = (await fetchJson(url, opts?.signal)) as SearchResponse;
  return (body.coins ?? []).map((c) => ({
    id: c.id,
    symbol: c.symbol,
    name: c.name,
    marketCapRank: c.market_cap_rank ?? null,
    thumb: c.thumb ?? null,
  }));
};
