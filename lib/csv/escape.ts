const NEEDS_QUOTING = /[",\r\n]/;

/** RFC 4180 quoting. Wraps the field in double quotes when it contains a
 * comma, double-quote, CR, or LF; doubles any embedded double-quotes. */
export const escapeField = (raw: string | null | undefined): string => {
  const s = raw ?? '';
  if (!NEEDS_QUOTING.test(s)) return s;
  return `"${s.replace(/"/g, '""')}"`;
};

export const formatRow = (cells: Array<string | null | undefined>): string =>
  cells.map(escapeField).join(',');
