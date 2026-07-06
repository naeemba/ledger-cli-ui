'use server';

import { buildCommoditySuggestions } from './buildCommoditySuggestions';
import type { CommodityContext } from './loadCommodityContext';
import type { CommoditySuggestion } from './types';
import { requireUser } from '@/lib/auth/require-user';
import {
  getCoinSymbolMap,
  searchCoins,
  type CoinSearchHit,
} from '@/lib/prices/coingecko/coinCache';
import { SUPPORTED_FIAT } from '@/lib/prices/fiat';
import { rateLimit, READ } from '@/lib/rate-limit';

export async function searchCommoditiesAction(
  query: string,
  context: CommodityContext
): Promise<CommoditySuggestion[]> {
  const user = await requireUser();
  if (!rateLimit(READ, user.id).allowed) return [];

  const trimmed = query.trim();

  // Journal + mappings arrive pre-loaded from the open handler; only CoinGecko
  // discovery is query-dependent, so that is all this per-keystroke call fetches.
  // getCoinSymbolMap is module-cached (24h TTL), so it only classifies here.
  let coinMap = new Map<string, string>();
  try {
    coinMap = await getCoinSymbolMap();
  } catch {
    // CoinGecko is unavailable — journal symbols fall back to manual/fiat.
  }

  let coinHits: CoinSearchHit[] = [];
  if (trimmed) {
    try {
      coinHits = await searchCoins(trimmed);
    } catch {
      // CoinGecko is unavailable — continue with journal + fiat + manual.
    }
  }

  return buildCommoditySuggestions({
    query,
    journal: context.journal,
    mappings: context.mappings,
    coinMap,
    fiatCodes: SUPPORTED_FIAT,
    coinHits,
  });
}
