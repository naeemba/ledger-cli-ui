/**
 * Client-safe date-formatting primitives. Deliberately free of any server-only
 * import (unlike {@link ../utils/formatDate}, whose configured-locale default
 * pulls in `@/lib/env`), so `'use client'` components can format dates without
 * dragging the server env into the browser bundle.
 */

export enum Format {
  DATE,
  MONTH_YEAR,
  SHORT_MONTH_YEAR,
}

const formatOptions: Record<Format, Intl.DateTimeFormatOptions> = {
  [Format.DATE]: {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  },
  [Format.MONTH_YEAR]: {
    year: 'numeric',
    month: 'long',
  },
  [Format.SHORT_MONTH_YEAR]: {
    year: 'numeric',
    month: 'short',
  },
};

/**
 * Format a date string with an explicit locale (defaults to the runtime/browser
 * locale when omitted). Server code should prefer the configured-locale
 * {@link ../utils/formatDate} default instead of passing a locale by hand.
 */
export const formatDateWithLocale = (
  date: string,
  format: Format,
  locale?: string
) => new Date(date).toLocaleDateString(locale, formatOptions[format]);

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
