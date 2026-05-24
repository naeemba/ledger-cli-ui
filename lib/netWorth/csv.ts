import type { NetWorthRow } from './parse';
import { formatRow } from '@/lib/csv';

const COLUMNS = ['month', 'net_worth', 'currency'] as const;

const fmt = (n: number) => n.toFixed(2);
const monthKey = (date: string) => date.slice(0, 7);

export const netWorthRowsToCsv = (
  rows: NetWorthRow[],
  currency: string
): string => {
  const lines = [COLUMNS.join(',')];
  for (const r of rows) {
    lines.push(formatRow([monthKey(r.date), fmt(r.value), currency]));
  }
  return lines.join('\n') + '\n';
};
