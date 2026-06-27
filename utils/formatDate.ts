import { Format, formatDateWithLocale } from './formatDateCore';
import getDefaultDateLocale from './getDefaultDateLocale';

// Re-exported so existing `import formatDate, { Format } from '@/utils/formatDate'`
// call sites keep working; client components should import the client-safe
// primitives from './formatDateCore' directly.
export { Format, formatDateWithLocale } from './formatDateCore';

/** Format a date using the server-configured default locale (`DATE_LOCALE`). */
const formatDate = (date: string, format: Format) =>
  formatDateWithLocale(date, format, getDefaultDateLocale());

export default formatDate;

const pad = (n: number) => String(n).padStart(2, '0');

/** UTC calendar date as `YYYY/MM/DD`, without a time component. */
export const formatLedgerDate = (d: Date): string =>
  `${d.getUTCFullYear()}/${pad(d.getUTCMonth() + 1)}/${pad(d.getUTCDate())}`;

/**
 * Format a Date as ledger's `P` directive timestamp: `YYYY/MM/DD HH:MM:SS`
 * in UTC. Stable across server timezones so price-db files diff cleanly.
 */
export const formatLedgerDateTime = (d: Date): string =>
  `${formatLedgerDate(d)} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;

/**
 * Sentinel UTC time stamped on date-only manual rates (`23:59:59`) so they sort
 * last within their day. Used to detect "no real time was given".
 */
const isEndOfDaySentinel = (d: Date): boolean =>
  d.getUTCHours() === 23 &&
  d.getUTCMinutes() === 59 &&
  d.getUTCSeconds() === 59;

/**
 * Like {@link formatLedgerDateTime}, but renders a plain date when the time is
 * the end-of-day sentinel used purely for ledger ordering of date-only rates.
 */
export const formatLedgerInstant = (d: Date): string =>
  isEndOfDaySentinel(d) ? formatLedgerDate(d) : formatLedgerDateTime(d);
