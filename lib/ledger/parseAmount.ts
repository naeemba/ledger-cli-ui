/**
 * Parse a ledger amount cell (the `%t` / `%T` / `%A` register columns). The
 * cell is either a bare number (`12,000.00`) or `<commodity> <number>`
 * (`USD 12,000.00`); we take the numeric part, strip thousands separators, and
 * fall back to 0 on anything unparsable so a malformed row can never poison a
 * running total.
 */
export const parseAmount = (raw: string): number => {
  if (!raw) return 0;
  const parts = raw.trim().split(/\s+/);
  const numericPart = parts.length > 1 ? parts[1] : parts[0];
  return Number(numericPart.replaceAll(',', '')) || 0;
};
