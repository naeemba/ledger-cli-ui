import { isFiatCode } from './fiat';

export type CommodityKind = 'crypto' | 'fiat' | 'manual';
export type Classification = { kind: CommodityKind; providerId: string | null };

/**
 * Auto-classify a normalized commodity symbol against reference data. Order is
 * deliberate: fiat is checked before the coin list because some ISO codes also
 * exist as low-cap tokens. A symbol that is neither a supported fiat nor a
 * ranked coin is `manual` — the user must supply its price.
 *
 * This is a best-effort default. Ticker namespaces overlap (a real coin can
 * share a symbol with a user's local commodity, e.g. NIM/Nimiq), so a user-set
 * mapping always overrides this result upstream.
 */
export const classifyCommodity = (
  symbol: string,
  coinMap: Map<string, string>
): Classification => {
  const upper = symbol.trim().toUpperCase();
  if (isFiatCode(upper)) return { kind: 'fiat', providerId: upper };
  const id = coinMap.get(upper);
  if (id) return { kind: 'crypto', providerId: id };
  return { kind: 'manual', providerId: null };
};
