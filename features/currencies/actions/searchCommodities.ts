'use server';

import type { CommoditySuggestion } from './types';
import { requireUser } from '@/lib/auth/require-user';
import { searchCoins } from '@/lib/prices/coingecko/coinCache';
import { SUPPORTED_FIAT } from '@/lib/prices/fiat';
import { rateLimit, READ, RATE_LIMIT_MESSAGE } from '@/lib/rate-limit';

export async function searchCommoditiesAction(
  query: string
): Promise<CommoditySuggestion[]> {
  const user = await requireUser();
  if (!rateLimit(READ, user.id).allowed) return [];

  const trimmed = query.trim();
  if (!trimmed) return [];
  const upper = trimmed.toUpperCase();

  const suggestions: CommoditySuggestion[] = [];

  // Fiat matches first (short, exact-ish).
  for (const code of SUPPORTED_FIAT) {
    if (code.startsWith(upper)) {
      suggestions.push({
        symbol: code,
        kind: 'fiat',
        providerId: code,
        label: `${code} (fiat)`,
        detail: null,
      });
    }
  }

  // Crypto from CoinGecko, ranked.
  try {
    const hits = await searchCoins(trimmed);
    for (const hit of hits.slice(0, 15)) {
      suggestions.push({
        symbol: hit.symbol.toUpperCase(),
        kind: 'crypto',
        providerId: hit.id,
        label: hit.name,
        detail: `${hit.symbol.toUpperCase()}${hit.marketCapRank ? ` · rank ${hit.marketCapRank}` : ''}`,
      });
    }
  } catch {
    // CoinGecko is unavailable — continue with fiat + manual below.
  }

  // Always offer an explicit manual mapping for the typed symbol.
  suggestions.push({
    symbol: upper,
    kind: 'manual',
    providerId: null,
    label: `Use "${upper}" as a manual commodity`,
    detail: 'price entered by hand',
  });

  return suggestions;
}
