import type { BalanceRow } from './parse';
import { formatRow } from '@/lib/csv';

const COLUMNS = ['account', 'amount', 'currency'] as const;

export const balanceRowsToCsv = (
  rows: BalanceRow[],
  currency: string
): string => {
  const lines = [COLUMNS.join(',')];
  for (const r of rows) {
    lines.push(formatRow([r.account, r.amount, currency]));
  }
  return lines.join('\n') + '\n';
};
