import {
  applyTransactionFilters,
  type TransactionFilters,
} from './applyTransactionFilters';
import { toTransactionRow, type TransactionRow } from './transactionRow';
import type { TransactionData } from '@/lib/transactions/model';

export const PAGE_SIZE = 50;

export type TransactionPage = {
  rows: TransactionRow[];
  nextOffset: number | null;
  total: number;
};

export const pageTransactions = (
  all: readonly TransactionData[],
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
