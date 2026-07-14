import type { DraftState } from './entry/draftReducer';
import type { HeaderFields } from './entry/types/adapter';
import { detectType } from './entry/types/registry';
import { QUICK_ENTRY_SPECS, type QuickEntrySpec } from './quickEntrySpecs';

export type EditSurface =
  | { kind: 'type'; spec: QuickEntrySpec<HeaderFields>; fields: HeaderFields }
  | { kind: 'raw'; seed?: DraftState };

// A detected shape carrying splits (`extraItems`) is routed to Raw. Not because
// the simple forms can't show splits — the expense/income forms both render
// `ExtraItemsField` — but because the split `compile` path emits an amount-less
// auto-balance line (extraItems.ts `balancingPostings`) where a parsed journal
// transaction carries an explicit paying amount. So `detect → compile` is *not*
// a pure inverse for splits (compile drops the paying amount and leaves it to
// ledger), the same reason fixBalance is excluded from roundTrip.test.ts. Until
// that path is verified against a real saved+parsed split, Raw is the safe
// default. Costs/assertions need no separate guard: every adapter's `detect`
// already rejects them, except the exchange adapter, which represents its cost
// faithfully — a blanket cost guard would wrongly force every exchange to Raw.
const hasSplits = (fields: unknown): boolean => {
  const extraItems = (fields as { extraItems?: unknown[] }).extraItems;
  return Array.isArray(extraItems) && extraItems.length > 0;
};

export function pickEditSurface(draft: DraftState): EditSurface {
  const detected = detectType(draft);
  if (!detected || hasSplits(detected.fields)) return { kind: 'raw' };
  const spec = QUICK_ENTRY_SPECS.find((entry) => entry.kind === detected.id);
  if (!spec) return { kind: 'raw' };
  return { kind: 'type', spec, fields: detected.fields as HeaderFields };
}
