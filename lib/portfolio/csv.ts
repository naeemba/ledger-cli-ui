import { formatRow } from '@/lib/csv';

const COLUMNS = [
  'account',
  'commodity',
  'quantity',
  'value',
  'currency',
] as const;

/**
 * One portfolio holding, already decomposed by ledger. `quantity` and
 * `commodity` come from `%(quantity(...))` / `%(commodity(...))` so we never
 * re-parse a rendered amount string (the old regex mis-split commodity-prefix
 * renderings like `BTC 0.09` into commodity `B`, quantity `TC 0.09`).
 */
export type PortfolioCsvRow = {
  account: string;
  commodity: string;
  quantity: string;
  /** Converted value in the base currency, as ledger rendered it. */
  value: string;
};

export const portfolioRowsToCsv = (
  rows: PortfolioCsvRow[],
  currency: string
): string => {
  const lines = [COLUMNS.join(',')];
  for (const r of rows) {
    lines.push(
      formatRow([r.account, r.commodity, r.quantity, r.value.trim(), currency])
    );
  }
  return lines.join('\n') + '\n';
};
