import type { PayeeRow } from './parse';
import { formatRow } from '@/lib/csv';

const COLUMNS = ['payee', 'amount', 'currency'] as const;

const formatNumber = (n: number) => n.toFixed(2);

export const payeeRowsToCsv = (rows: PayeeRow[], currency: string): string => {
  const lines = [COLUMNS.join(',')];
  for (const r of rows) {
    lines.push(formatRow([r.payee, formatNumber(r.total), currency]));
  }
  return lines.join('\n') + '\n';
};
