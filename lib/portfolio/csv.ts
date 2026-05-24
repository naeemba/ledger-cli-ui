import type { PortfolioRow } from '@/features/portfolio/parsePortfolio';
import { formatRow } from '@/lib/csv';

const COLUMNS = [
  'account',
  'commodity',
  'quantity',
  'value',
  'currency',
] as const;

/**
 * Split a native amount string into (quantity, commodity). Handles both
 * "<qty> <commodity>" (`10 AAPL`) and "<symbol><qty>" (`$1234.50`).
 */
const splitNative = (
  native: string
): { quantity: string; commodity: string } => {
  const trimmed = native.trim();
  // Symbol-prefix: leading non-digit non-minus non-space char.
  const symbolMatch = /^([^\d\s.\-])(.+)$/.exec(trimmed);
  if (symbolMatch) {
    return { commodity: symbolMatch[1], quantity: symbolMatch[2].trim() };
  }
  // Space-separated: <qty> <commodity-or-rest>.
  const idx = trimmed.search(/\s/);
  if (idx === -1) return { quantity: trimmed, commodity: '' };
  return {
    quantity: trimmed.slice(0, idx).trim(),
    commodity: trimmed.slice(idx).trim(),
  };
};

const valueOf = (converted: string): string => converted.trim();

export const portfolioRowsToCsv = (
  rows: PortfolioRow[],
  currency: string
): string => {
  const lines = [COLUMNS.join(',')];
  for (const r of rows) {
    const { quantity, commodity } = splitNative(r.native);
    lines.push(
      formatRow([
        r.account,
        commodity,
        quantity,
        valueOf(r.converted),
        currency,
      ])
    );
  }
  return lines.join('\n') + '\n';
};
