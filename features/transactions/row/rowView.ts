import type { TemplateDraft } from '@/lib/templates/schema';
import type {
  TransactionRow,
  TransactionStatus,
} from '@/lib/transactions/model';
import { Transaction } from '@/lib/transactions/model';

export type TransactionRowView = {
  // Core — rendered identically on every surface.
  date: string; // ISO 'YYYY-MM-DD'
  payee: string;
  amount: string; // one or more '\n'-separated tokens, e.g. "USD -5.00"
  status?: TransactionStatus;
  uid?: string;

  // Optional extras — each rendered in a consistent slot when present.
  accountsSummary?: string; // main list: "Checking → Coffee" (source → dest)
  account?: string; // dashboard / reconcile single-account context
  runningTotal?: string; // account register (same '\n' shape as amount)
  age?: number; // reconcile (days)

  // Save-as-template needs full postings; only the main list supplies this.
  templateDraft?: TemplateDraft;
};

// Multi-currency magnitude tokens, one per line, matching the register/amount
// rendering used across surfaces.
const amountLines = (tx: Transaction): string =>
  tx
    .magnitudesByCurrency()
    .map(([currency, magnitude]) => `${currency} ${magnitude.toFixed(2)}`)
    .join('\n');

export const transactionRowToView = (
  row: TransactionRow
): TransactionRowView => {
  const tx = Transaction.from(row);
  return {
    date: row.date,
    payee: row.payee,
    status: row.status,
    uid: row.uid,
    accountsSummary: tx.accountsSummary(),
    amount: amountLines(tx),
    templateDraft: tx.toTemplate(),
  };
};
