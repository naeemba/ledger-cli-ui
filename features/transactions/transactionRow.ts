import type { ParsedTransaction } from '@/lib/journal/parser';
import { carryAnnotations } from '@/lib/transactions/carryAnnotations.util';
import type { Posting } from '@/lib/transactions/posting';

export type TransactionRow = Omit<
  ParsedTransaction,
  'rawBlock' | 'endLine' | 'postings'
> & {
  postings: Posting[];
};

export const toTransactionRow = (t: ParsedTransaction): TransactionRow => ({
  uid: t.uid,
  file: t.file,
  startLine: t.startLine,
  date: t.date,
  payee: t.payee,
  status: t.status,
  note: t.note,
  fingerprint: t.fingerprint,
  postings: t.postings.map((p) => ({
    account: p.account,
    amount: p.amount,
    currency: p.currency,
    ...carryAnnotations(p),
  })),
});
