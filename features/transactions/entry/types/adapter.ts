import type { DraftState, DraftStatus, DraftPosting } from '../draftReducer';
import { Transaction } from '@/lib/transactions/model';

export type TypeContext = { defaultCurrency: string };

export type HeaderFields = {
  date: string;
  payee: string;
  status: DraftStatus;
  note: string;
  uid?: string;
};

export type TransactionTypeAdapter<F> = {
  id: string;
  label: string;
  icon: string;
  emptyFields: (ctx: TypeContext) => F;
  compile: (fields: F, ctx: TypeContext) => DraftState;
  detect: (draft: DraftState) => F | null;
};

export const headerOf = (draft: DraftState): HeaderFields => ({
  date: draft.date,
  payee: draft.payee,
  status: draft.status,
  note: draft.note,
  uid: draft.uid,
});

export const draftFromHeader = (
  header: HeaderFields,
  postings: DraftPosting[]
): DraftState =>
  new Transaction(
    header.date,
    header.payee,
    header.status,
    header.note,
    postings,
    header.uid
  );
