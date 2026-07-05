export type AmountParts = {
  unit: string;
  magnitude: string;
  negative: boolean;
  signed: number;
};

// Matches the numeric token of a ledger amount: an optional leading minus,
// grouped digits, and an optional decimal fraction. Used to locate the number
// regardless of where the commodity sits relative to it.
const NUMBER_TOKEN = /-?[\d,]+(?:\.\d+)?/;

/**
 * Split a ledger amount string into its unit, its magnitude (ledger's original
 * digits, sign stripped), a negativity flag, and the numeric value.
 *
 * Ledger renders the commodity on EITHER side of the number depending on how
 * the commodity was first seen: a prefix symbol (`$ 3,170.00`, `$33000.00`),
 * a prefix code (`USD 1,000.00`), or a suffix code (`71,214.5302 Kirt`,
 * `0.5 BTC`). We therefore locate the numeric token first and treat whatever
 * remains as the unit, rather than assuming the number is in a fixed position.
 */
export function parseAmountParts(raw: string): AmountParts {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return { unit: '', magnitude: '', negative: false, signed: 0 };

  const match = NUMBER_TOKEN.exec(trimmed);
  if (!match) {
    // No numeric token at all — surface the raw text as the unit so callers can
    // still show something rather than silently dropping it.
    return { unit: trimmed, magnitude: '', negative: false, signed: 0 };
  }

  const numStr = match[0];
  const unit = trimmed.replace(numStr, '').trim();
  const negative = numStr.startsWith('-');
  const magnitude = numStr.replace(/^-/, '');
  const signed = Number(numStr.replaceAll(',', '')) || 0;
  return { unit, magnitude, negative, signed };
}
