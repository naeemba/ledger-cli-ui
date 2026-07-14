import type { DraftState } from './entry/draftReducer';
import type { HeaderFields } from './entry/types/adapter';
import { detectType } from './entry/types/registry';
import { QUICK_ENTRY_SPECS, type QuickEntrySpec } from './quickEntrySpecs';

export type EditSurface =
  | { kind: 'type'; spec: QuickEntrySpec<HeaderFields>; fields: HeaderFields }
  | { kind: 'raw'; seed?: DraftState };

// A simplified spec form renders a single amount/account pair. `detect` returns
// splits as `extraItems`, which those forms never show — so a detected shape
// with any split must fall through to Raw instead of round-tripping invisibly.
// Costs/assertions need no separate guard: every adapter's `detect` already
// rejects them, except the exchange adapter, which represents its cost
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
