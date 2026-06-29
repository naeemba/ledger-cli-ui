import type { DraftState } from '../draftReducer';

export const isEmptyDraft = (draft: DraftState): boolean =>
  draft.payee.trim() === '' &&
  draft.note.trim() === '' &&
  draft.postings.every(
    (p) => p.account.trim() === '' && p.amount.trim() === ''
  );
