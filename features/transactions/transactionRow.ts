import type { Annotation, Transaction } from '@/lib/journal/parser';
import { carryAnnotations } from '@/lib/transactions/carryAnnotations.util';

export type TransactionRow = Omit<
  Transaction,
  'rawBlock' | 'endLine' | 'postings'
> & {
  postings: Array<{
    account: string;
    amount: string;
    currency: string;
    cost?: Annotation;
    assertion?: Annotation;
  }>;
};

export const toTransactionRow = (t: Transaction): TransactionRow => ({
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
