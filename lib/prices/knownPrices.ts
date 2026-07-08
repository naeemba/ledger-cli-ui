import { normalizeCommoditySymbol } from './symbols';

/**
 * Machine-parseable prices report format: one `date|quantity|quote` line per
 * price point. `quantity` is the numeric price, `quote` is the commodity the
 * price is denominated in (e.g. `$`). Must be passed verbatim to
 * `ledger prices <symbol> --prices-format <PRICES_FORMAT>`.
 */
export const PRICES_FORMAT =
  "%(format_date(date,'%Y-%m-%d'))|%(quantity(scrub(display_amount)))|%(commodity(scrub(display_amount)))\n";

/**
 * Machine-parseable balance format for base-currency valuation: one
 * `account|quantity|commodity` line per probe holding. `quantity` is the
 * full-precision value, `commodity` is the currency it resolved to (the base
 * when a conversion path existed, otherwise the holding's own commodity).
 */
export const BALANCE_BASE_FORMAT =
  '%(account)|%(quantity(scrub(display_total)))|%(commodity(scrub(display_total)))\n';

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

/**
 * Whole UTC days from `dateIso` to `todayIso` (both `YYYY-MM-DD`). Returns a
 * negative number when `dateIso` is in the future relative to `todayIso`.
 */
export const ageInDays = (dateIso: string, todayIso: string): number => {
  const a = Date.parse(`${dateIso}T00:00:00Z`);
  const b = Date.parse(`${todayIso}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
};

/**
 * The current price and the date it last changed. `ledger prices` forward-
 * carries the prevailing price onto every posting date, so the final row's
 * date can be a transaction date rather than when the price was actually set.
 * Returns the last point's price/quote paired with the date the price value
 * last changed (the start of the final constant-price run), so staleness
 * reflects how long the current price has stood. Returns null for empty input.
 */
export const latestGenuinePrice = (points: PricePoint[]): PricePoint | null => {
  if (points.length === 0) return null;
  const last = points[points.length - 1];
  let changeDate = points[0].date;
  for (let index = 1; index < points.length; index += 1) {
    if (points[index].price !== points[index - 1].price) {
      changeDate = points[index].date;
    }
  }
  return { date: changeDate, price: last.price, quote: last.quote };
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
  if (!date) return 'none';
  if (!symbolNormalized || !quoteNormalized) return 'journal';
  const key = priceKey(symbolNormalized, quoteNormalized, date);
  if (manualKeys.has(key)) return 'manual';
  if (fetchedKeys.has(key)) return 'fetched';
  return 'journal';
};

/** Re-exported so the service normalizes symbols the same way. */
export { normalizeCommoditySymbol };

/**
 * Parse `ledger balance ^Probe:cN --flat -X <base> --empty` output into a
 * map of probe index → valued amount. Probe accounts are named `Probe:c<index>`
 * so the account label carries no commodity-specific characters; the index maps
 * back to the held commodity by position. Offset accounts and malformed lines
 * are ignored. A row whose `commodity` differs from the requested base was not
 * convertible into the base.
 */
export const parseBaseBalance = (
  stdout: string
): Map<number, { price: number; commodity: string }> => {
  const out = new Map<number, { price: number; commodity: string }>();
  for (const line of stdout.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const [account, quantity, commodity] = trimmed.split('|');
    if (!account || !quantity || !commodity) continue;
    const match = /^Probe:c(\d+)$/.exec(account);
    if (!match) continue;
    const price = Number(quantity.replace(/,/g, ''));
    if (!Number.isFinite(price)) continue;
    out.set(Number(match[1]), { price, commodity });
  }
  return out;
};
