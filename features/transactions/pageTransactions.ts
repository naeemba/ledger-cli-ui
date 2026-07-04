import {
  applyTransactionFilters,
  type TransactionFilters,
} from './applyTransactionFilters';
import { toTransactionRow, type TransactionRow } from './transactionRow';
import type { ParsedTransaction } from '@/lib/journal/parser';

export const PAGE_SIZE = 50;

export type TransactionPage = {
  rows: TransactionRow[];
  nextOffset: number | null;
  total: number;
};

export const pageTransactions = (
  all: ParsedTransaction[],
  filters: TransactionFilters,
  offset: number,
  limit: number
): TransactionPage => {
  const filtered = applyTransactionFilters(all, filters).sort((a, b) =>
    b.date.localeCompare(a.date)
  );
  const total = filtered.length;
  const rows = filtered.slice(offset, offset + limit).map(toTransactionRow);
  const consumed = offset + rows.length;
  const nextOffset = consumed < total ? consumed : null;
  return { rows, nextOffset, total };
};

export const appendPage = (
  prev: { rows: TransactionRow[]; nextOffset: number | null },
  page: TransactionPage
): { rows: TransactionRow[]; nextOffset: number | null } => ({
  rows: prev.rows.concat(page.rows),
  nextOffset: page.nextOffset,
});
