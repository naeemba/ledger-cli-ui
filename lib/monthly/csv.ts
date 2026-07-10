import { formatRow } from '@/lib/csv';
import type { CashFlowRow } from '@/lib/monthly/parse';

const COLUMNS = ['month', 'income', 'expenses', 'net', 'currency'] as const;

const monthKey = (d: Date): string =>
  `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;

const fmt = (n: number) => n.toFixed(2);

export const cashFlowRowsToCsv = (
  rows: CashFlowRow[],
  currency: string
): string => {
  const lines = [COLUMNS.join(',')];
  for (const r of rows) {
    lines.push(
      formatRow([
        monthKey(r.date),
        fmt(r.income),
        fmt(r.expenses),
        fmt(r.net),
        currency,
      ])
    );
  }
  return lines.join('\n') + '\n';
};
