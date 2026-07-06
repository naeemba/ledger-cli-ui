'use server';

import { buildCommoditySuggestions } from './buildCommoditySuggestions';
import type { CommoditySuggestion } from './types';
import { requireUser } from '@/lib/auth/require-user';
import { commodityMappingRepository } from '@/lib/prices';
import {
  getCoinSymbolMap,
  searchCoins,
  type CoinSearchHit,
} from '@/lib/prices/coingecko/coinCache';
import { SUPPORTED_FIAT } from '@/lib/prices/fiat';
import { rateLimit, READ } from '@/lib/rate-limit';
import { getAvailableCurrencies } from '@/lib/settings/getAvailableCurrencies';

export async function searchCommoditiesAction(
  query: string
): Promise<CommoditySuggestion[]> {
  const user = await requireUser();
  if (!rateLimit(READ, user.id).allowed) return [];

  const trimmed = query.trim();

  // Journal commodities + the user's own mappings ground the list in what they
  // actually use; CoinGecko/fiat only add discovery once they start typing.
  const [{ currencies }, mappings] = await Promise.all([
    getAvailableCurrencies(),
    commodityMappingRepository.mapForUser(user.id),
  ]);

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
    journal: currencies,
    mappings,
    coinMap,
    fiatCodes: SUPPORTED_FIAT,
    coinHits,
  });
}
