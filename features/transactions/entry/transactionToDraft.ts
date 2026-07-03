import type { Transaction } from '@/lib/journal/parser';
import type { TransactionDraft } from '@/lib/transactions/schema';

/**
 * Map a persisted {@link Transaction} onto the entry draft used to seed the
 * edit form.
 *
 * Cost (`@@`) and balance-assertion (`=`) annotations are carried through: the
 * edit-mode concurrency guard fingerprints this draft and compares it against
 * the transaction's own fingerprint, which the parser computes from the fully
 * annotated postings. Dropping either annotation makes the two fingerprints
 * diverge, so every edit of such a transaction would fail as falsely "stale".
 */
export const transactionToDraft = (
  tx: Transaction,
  defaultCurrency: string
): TransactionDraft => ({
  date: tx.date,
  payee: tx.payee,
  status: tx.status,
  note: tx.note ?? undefined,
  uid: tx.uid ?? undefined,
  postings: tx.postings.map((p) => ({
    account: p.account,
    amount: p.amount,
    currency: p.currency || defaultCurrency,
    ...(p.cost ? { cost: p.cost } : {}),
    ...(p.assertion ? { assertion: p.assertion } : {}),
  })),
});
