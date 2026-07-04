import { carryAnnotations } from '../carryAnnotations.util';
import type { DraftState } from './draftReducer';
import type { TemplateDraft } from '@/lib/templates/schema';

/**
 * Build the `TemplateDraft` saved by "Save as template" from the live entry
 * draft. Trims text fields and carries each posting's `@@` cost and `=`
 * balance-assertion annotations through {@link carryAnnotations} — dropping
 * them would rehydrate a cost-balanced multi-currency template into an
 * unbalanced, unsubmittable draft.
 */
export const draftToTemplateDraft = (draft: DraftState): TemplateDraft => ({
  payee: draft.payee.trim() || '—',
  status: draft.status,
  note: draft.note.trim() || undefined,
  postings: draft.postings.map((p) => ({
    account: p.account.trim(),
    amount: p.amount.trim(),
    currency: p.currency.trim(),
    ...carryAnnotations(p),
  })),
});
