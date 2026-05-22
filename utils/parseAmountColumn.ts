/**
 * Extract a JS number from the numeric portion of a ledger `%t`-formatted
 * amount column. Tolerates the three shapes ledger emits in practice:
 *
 *   "USD 100"   → 100
 *   "100 USD"   → 100
 *   "$100"      → 100
 *   "100"       → 100
 *   "-1,234.56" → -1234.56
 *
 * Returns 0 when no numeric token is present (empty cell, garbage input).
 */
const NUMERIC_REGEX = /-?[\d,]+(?:\.\d+)?/;

export const parseAmountColumn = (raw: string | null | undefined): number => {
  if (!raw) return 0;
  const match = raw.match(NUMERIC_REGEX);
  if (!match) return 0;
  const cleaned = match[0].replaceAll(',', '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
};

export default parseAmountColumn;
