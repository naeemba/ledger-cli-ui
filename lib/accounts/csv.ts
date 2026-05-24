import type { BalanceRow } from '@/lib/balance/parse';
import { formatRow } from '@/lib/csv';

const COLUMNS = ['account', 'balance', 'currency'] as const;

export const accountsRowsToCsv = (
  rows: BalanceRow[],
  currency: string
): string => {
  const lines = [COLUMNS.join(',')];
  for (const r of rows) {
    lines.push(formatRow([r.account, r.amount, currency]));
  }
  return lines.join('\n') + '\n';
};
