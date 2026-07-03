import { carryAnnotations } from './carryAnnotations.util';
import type { Annotation, Transaction } from '@/lib/journal/parser';
import type { TemplateDraft } from '@/lib/templates/schema';

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

/**
 * Build the template draft seeded when saving a transaction row as a template.
 *
 * Cost (`@@`) and balance-assertion (`=`) annotations are carried through:
 * `templateDraftSchema` legally stores them (it reuses `postingSchema`), and a
 * multi-currency transaction balanced via `@@` cost only sums to zero — so the
 * hydrated template only submits — when the cost travels with it. Dropping the
 * annotation would leave the Save buttons permanently disabled.
 */
export const toTemplateDraft = (t: TransactionRow): TemplateDraft => ({
  payee: t.payee,
  status: t.status,
  note: t.note ?? undefined,
  postings: t.postings.map((p) => ({
    account: p.account,
    amount: p.amount,
    currency: p.currency,
    ...carryAnnotations(p),
  })),
});
