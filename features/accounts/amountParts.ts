export type AmountParts = {
  unit: string;
  magnitude: string;
  negative: boolean;
  signed: number;
};

/**
 * Split a ledger amount string (e.g. "$ 3,170.00", "$ -200.00", "USD 1,000.00")
 * into its unit, its magnitude (ledger's original digits, sign stripped), a
 * negativity flag, and the numeric value. Unit-first, matching utils/formatAmount.
 */
export function parseAmountParts(raw: string): AmountParts {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return { unit: '', magnitude: '', negative: false, signed: 0 };

  const parts = trimmed.split(/\s+/);
  let unit = '';
  let numStr = trimmed;
  if (parts.length >= 2) {
    unit = parts[0];
    numStr = parts[1];
  }
  const negative = numStr.startsWith('-');
  const magnitude = numStr.replace(/^-/, '');
  const signed = Number(numStr.replaceAll(',', '')) || 0;
  return { unit, magnitude, negative, signed };
}
