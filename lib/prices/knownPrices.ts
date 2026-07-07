import { normalizeCommoditySymbol } from './symbols';

/**
 * Machine-parseable prices report format: one `date|quantity|quote` line per
 * price point. `quantity` is the numeric price, `quote` is the commodity the
 * price is denominated in (e.g. `$`). Must be passed verbatim to
 * `ledger prices <symbol> --prices-format <PRICES_FORMAT>`.
 */
export const PRICES_FORMAT =
  "%(format_date(date,'%Y-%m-%d'))|%(quantity(scrub(display_amount)))|%(commodity(scrub(display_amount)))\n";

export const STALE_THRESHOLD_DAYS = 7;

export type PricePoint = { date: string; price: number; quote: string };

export type PriceSource = 'fetched' | 'manual' | 'journal' | 'base' | 'none';

export type KnownPrice = {
  symbol: string;
  price: number | null;
  quote: string | null;
  date: string | null;
  ageDays: number | null;
  stale: boolean;
  source: PriceSource;
};

export const priceKey = (symbol: string, quote: string, date: string): string =>
  `${symbol}|${quote}|${date}`;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Parse `ledger prices --prices-format PRICES_FORMAT` output into points. */
export const parsePriceHistory = (stdout: string): PricePoint[] => {
  const seen = new Set<string>();
  const points: PricePoint[] = [];
  for (const line of stdout.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const [date, quantity, quote] = trimmed.split('|');
    if (!date || !quantity || !quote) continue;
    if (!DATE_PATTERN.test(date)) continue;
    const price = Number(quantity.replace(/,/g, ''));
    if (!Number.isFinite(price)) continue;
    const key = `${date}|${price}`;
    if (seen.has(key)) continue;
    seen.add(key);
    points.push({ date, price, quote });
  }
  return points;
};

/** Whole UTC days from `dateIso` to `todayIso` (both `YYYY-MM-DD`). */
export const ageInDays = (dateIso: string, todayIso: string): number => {
  const a = Date.parse(`${dateIso}T00:00:00Z`);
  const b = Date.parse(`${todayIso}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
};

/**
 * Determine where the latest price came from. `ledger` carries no provenance,
 * so we correlate the (symbol, quote, date) key against the manual- and
 * fetched-price sets built from the database. Manual wins when both match.
 */
export const deriveSource = (args: {
  symbolNormalized: string | null;
  quoteNormalized: string | null;
  date: string | null;
  base: string;
  manualKeys: Set<string>;
  fetchedKeys: Set<string>;
}): PriceSource => {
  const {
    symbolNormalized,
    quoteNormalized,
    date,
    base,
    manualKeys,
    fetchedKeys,
  } = args;
  if (symbolNormalized && symbolNormalized === base) return 'base';
  if (!date || !symbolNormalized || !quoteNormalized) return 'none';
  const key = priceKey(symbolNormalized, quoteNormalized, date);
  if (manualKeys.has(key)) return 'manual';
  if (fetchedKeys.has(key)) return 'fetched';
  return 'journal';
};

/** Re-exported so the service normalizes symbols the same way. */
export { normalizeCommoditySymbol };
