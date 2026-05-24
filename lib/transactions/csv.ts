import { formatRow } from '@/lib/csv';
import type { Transaction } from '@/lib/journal/parser';

// One row per posting (long format) is the most useful shape for downstream
// analysis tools — spreadsheet pivots, pandas DataFrames, etc. Transaction-
// level metadata (date, payee, status, note) is repeated on each row.
const COLUMNS = [
  'date',
  'payee',
  'status',
  'note',
  'uid',
  'account',
  'amount',
  'currency',
] as const;

/**
 * Serialize transactions to CSV (RFC 4180). One row per posting; header row
 * first. Rows are emitted in input order — callers sort beforehand if a
 * particular order is desired.
 */
export const transactionsToCsv = (txs: Transaction[]): string => {
  const lines = [COLUMNS.join(',')];
  for (const t of txs) {
    for (const p of t.postings) {
      lines.push(
        formatRow([
          t.date,
          t.payee,
          t.status,
          t.note,
          t.uid,
          p.account,
          p.amount,
          p.currency,
        ])
      );
    }
  }
  return lines.join('\n') + '\n';
};
