// features/transactions/entry/typeLensState.ts
import type { DraftState } from './draftReducer';
import { isEmptyDraft } from './typeForms/isEmptyDraft';
import { detectType, TYPE_ADAPTERS } from './types/registry';

/**
 * The type to preselect when the Types tab first mounts for a draft. A
 * recognized draft seeds its detected type so that editing it in the guided
 * form keeps the form open even if a mid-edit draft briefly stops matching.
 * A fresh (empty) draft preselects the first type so the tab opens with a
 * type already active instead of nothing selected.
 */
export const initialPickForDraft = (draft: DraftState): string | null =>
  detectType(draft)?.id ?? (isEmptyDraft(draft) ? TYPE_ADAPTERS[0].id : null);

/**
 * Decide what the Types tab shows for the current draft and the type the user
 * is working in (`picked`).
 *
 * `chipsDisabled` — and, with it, the "doesn't map to a quick type" notice —
 * fires only for an unrecognized draft the user has *not* engaged: no type is
 * picked, the draft is non-empty, and nothing detects. Once a type is picked,
 * the guided form owns the draft, so a partially filled (thus undetectable)
 * draft must not collapse the form.
 */
export const resolveTypeLensState = (
  draft: DraftState,
  picked: string | null
): { selectedId: string | null; chipsDisabled: boolean } => {
  const detected = detectType(draft);
  const selectedId = picked ?? detected?.id ?? null;
  const chipsDisabled =
    picked === null && !isEmptyDraft(draft) && detected === null;
  return { selectedId, chipsDisabled };
};
