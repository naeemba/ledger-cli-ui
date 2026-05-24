import getDefaultDateLocale from './getDefaultDateLocale';

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

const formatDate = (date: string, format: Format) => {
  return new Date(date).toLocaleDateString(
    getDefaultDateLocale(),
    formatOptions[format]
  );
};

export default formatDate;

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Format a Date as ledger's `P` directive timestamp: `YYYY/MM/DD HH:MM:SS`
 * in UTC. Stable across server timezones so price-db files diff cleanly.
 */
export const formatLedgerDateTime = (d: Date): string => {
  return (
    `${d.getUTCFullYear()}/${pad(d.getUTCMonth() + 1)}/${pad(d.getUTCDate())} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`
  );
};
