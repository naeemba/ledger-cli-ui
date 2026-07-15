import type { DraftState } from './entry/draftReducer';
import type { HeaderFields, TypeContext } from './entry/types/adapter';
import { fixBalanceAdapter } from './entry/types/fixBalance';
import { detectType } from './entry/types/registry';
import { QUICK_ENTRY_SPECS, type QuickEntrySpec } from './quickEntrySpecs';
import type { Posting } from '@/lib/transactions/posting';

export type EditSurface =
  | { kind: 'type'; spec: QuickEntrySpec<HeaderFields>; fields: HeaderFields }
  | { kind: 'raw'; seed?: DraftState };

const annotationsMatch = (a: Posting['cost'], b: Posting['cost']): boolean =>
  (a?.amount ?? '') === (b?.amount ?? '') &&
  (a?.currency ?? '') === (b?.currency ?? '');

const postingsMatch = (a: readonly Posting[], b: readonly Posting[]): boolean =>
  a.length === b.length &&
  a.every((p, i) => {
    const q = b[i];
    return (
      p.account === q.account &&
      p.amount === q.amount &&
      p.currency === q.currency &&
      annotationsMatch(p.cost, q.cost) &&
      annotationsMatch(p.assertion, q.assertion)
    );
  });

// True when compiling the detected fields reproduces the draft's postings
// exactly — the guarantee that opening the simple form and re-saving unchanged
// leaves the journal identical. This is what makes splits safe to route to a
// form: a split whose paying line is already amount-less (as the entry form
// writes it) round-trips, so its `extraItems` survive; a split whose paying
// line carries an *explicit* amount does NOT (split compile leaves that line
// amount-less for ledger to fill), so it correctly falls back to Raw rather
// than silently rewriting that posting. Ordering is significant on purpose:
// compile emits a canonical posting order, so a differently-ordered hand-edited
// transaction also falls to Raw instead of being reshuffled on save.
const roundTrips = (
  spec: QuickEntrySpec<HeaderFields>,
  fields: HeaderFields,
  draft: DraftState
): boolean => {
  try {
    const ctx: TypeContext = {
      defaultCurrency: draft.postings.find((p) => p.currency)?.currency ?? '',
    };
    return postingsMatch(spec.compile(fields, ctx).postings, draft.postings);
  } catch {
    return false;
  }
};

export function pickEditSurface(draft: DraftState): EditSurface {
  const detected = detectType(draft);
  if (!detected) return { kind: 'raw' };
  const spec = QUICK_ENTRY_SPECS.find((entry) => entry.kind === detected.id);
  if (!spec) return { kind: 'raw' };
  const fields = detected.fields as HeaderFields;
  // fix-balance's form re-derives the balance from a target rather than
  // reproducing the postings, so compile is intentionally not its inverse
  // (see fixBalance.ts / roundTrip.test.ts) — exempt it. Every other type must
  // round-trip losslessly, or editing through the simple form could silently
  // rewrite a posting the form can't represent.
  if (detected.id !== fixBalanceAdapter.id && !roundTrips(spec, fields, draft))
    return { kind: 'raw' };
  return { kind: 'type', spec, fields };
}
