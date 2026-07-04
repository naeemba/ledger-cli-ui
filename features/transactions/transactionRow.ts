import { Transaction, type TransactionData } from '@/lib/transactions/model';

export type { TransactionRow } from '@/lib/transactions/model';

/**
 * Project a transaction (as its plain, cache-safe data) into the read-only row
 * the list renders. Rehydrating through {@link Transaction} keeps row shaping in
 * one place — the model — rather than duplicating the field/annotation mapping.
 */
export const toTransactionRow = (data: TransactionData) =>
  Transaction.from(data).toRow();
