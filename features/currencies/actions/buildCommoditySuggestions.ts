import type { CommoditySuggestion } from './types';
import { classifyCommodity } from '@/lib/prices/classify';
import type { CoinSearchHit } from '@/lib/prices/coingecko/coinCache';

export type JournalMapping = { kind: string; providerId: string | null };

export type BuildSuggestionsParams = {
  /** Raw query as typed. Trimmed internally. */
  query: string;
  /** Commodity symbols already present in the user's journal. */
  journal: string[];
  /** Existing user mappings keyed by symbol — preserves a hand-set kind. */
  mappings: Map<string, JournalMapping>;
  /** Uppercased ticker → CoinGecko id, for classifying unmapped journal symbols. */
  coinMap: Map<string, string>;
  /** Supported fiat ISO codes. */
  fiatCodes: Iterable<string>;
  /** CoinGecko search hits for the query (empty when the query is blank). */
  coinHits: CoinSearchHit[];
};

/**
 * Merges the user's own journal commodities with online provider results into a
 * single suggestion list. Journal commodities rank first and are the only thing
 * shown for an empty query, so opening the picker surfaces the currencies the
 * user actually uses; typing then layers fiat and CoinGecko matches on top.
 *
 * Symbols are de-duplicated across sources (first source wins), so a journal
 * `USD` is not also offered as a fiat row or a "use as manual" row.
 */
export const buildCommoditySuggestions = ({
  query,
  journal,
  mappings,
  coinMap,
  fiatCodes,
  coinHits,
}: BuildSuggestionsParams): CommoditySuggestion[] => {
  const trimmed = query.trim();
  const upper = trimmed.toUpperCase();
  const seen = new Set<string>();
  const suggestions: CommoditySuggestion[] = [];

  // Journal commodities first. An existing user mapping wins over auto-classify
  // so selecting one never clobbers a hand-set kind.
  for (const symbol of journal) {
    const key = symbol.toUpperCase();
    if (trimmed && !key.includes(upper)) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    const mapping = mappings.get(symbol);
    const classified = mapping
      ? {
          kind: mapping.kind as CommoditySuggestion['kind'],
          providerId: mapping.providerId,
        }
      : classifyCommodity(symbol, coinMap);
    suggestions.push({
      symbol,
      kind: classified.kind,
      providerId: classified.providerId,
      label: symbol,
      detail: 'in your journal',
    });
  }

  // An empty query surfaces only the user's own commodities.
  if (!trimmed) return suggestions;

  for (const code of fiatCodes) {
    if (!code.startsWith(upper)) continue;
    if (seen.has(code)) continue;
    seen.add(code);
    suggestions.push({
      symbol: code,
      kind: 'fiat',
      providerId: code,
      label: `${code} (fiat)`,
      detail: null,
    });
  }

  for (const hit of coinHits.slice(0, 15)) {
    const key = hit.symbol.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    suggestions.push({
      symbol: key,
      kind: 'crypto',
      providerId: hit.id,
      label: hit.name,
      detail: `${key}${hit.marketCapRank ? ` · rank ${hit.marketCapRank}` : ''}`,
    });
  }

  // Always let the user commit the raw ticker, unless it already appeared above.
  if (!seen.has(upper)) {
    suggestions.push({
      symbol: upper,
      kind: 'manual',
      providerId: null,
      label: `Use "${upper}" as a manual commodity`,
      detail: 'price entered by hand',
    });
  }

  return suggestions;
};
