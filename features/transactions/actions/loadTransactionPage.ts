'use server';

import { type TransactionFilters } from '../applyTransactionFilters';
import { loadJournalTransactions } from '../loadJournalTransactions';
import { pageTransactions, type TransactionPage } from '../pageTransactions';
import { requireUser } from '@/lib/auth/require-user';

export async function loadTransactionPageAction(input: {
  filters: TransactionFilters;
  offset: number;
  limit: number;
}): Promise<TransactionPage> {
  const user = await requireUser();
  const all = await loadJournalTransactions(user.id);
  return pageTransactions(all, input.filters, input.offset, input.limit);
}
