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
