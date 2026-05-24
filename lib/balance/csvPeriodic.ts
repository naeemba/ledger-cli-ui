import type { PeriodicBalanceRow } from './parsePeriodic';
import { formatRow } from '@/lib/csv';

const COLUMNS = ['account', 'spend', 'currency'] as const;

export const periodicBalanceRowsToCsv = (
  rows: PeriodicBalanceRow[],
  currency: string
): string => {
  const lines = [COLUMNS.join(',')];
  for (const r of rows) {
    lines.push(formatRow([r.account, r.amount, currency]));
  }
  return lines.join('\n') + '\n';
};
