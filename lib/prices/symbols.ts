/**
 * Normalize a raw commodity name from `ledger commodities` into a
 * provider-compatible symbol. Returns null for anything the provider
 * won't recognize (whitespace, slashes, hyphens, empty strings).
 */
export const normalizeCommoditySymbol = (raw: string): string | null => {
  let s = raw.trim();
  if (
    s.length >= 2 &&
    ((s.startsWith("'") && s.endsWith("'")) ||
      (s.startsWith('"') && s.endsWith('"')))
  ) {
    s = s.slice(1, -1).trim();
  }
  if (!s) return null;
  if (s === '$') return 'USD';
  if (!/^[A-Za-z0-9]+$/.test(s)) return null;
  return s.toUpperCase();
};
