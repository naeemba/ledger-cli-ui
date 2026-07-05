import type { SaveTemplateResult } from './actions/saveTemplate';

type SaveTemplateFailure = Extract<SaveTemplateResult, { ok: false }>;

/**
 * Human-readable error for a failed template save. The action reports the
 * offending fields in `fieldErrors` (e.g. a blank posting account), but the
 * dialog only had room for `message` — leaving the user with a bare
 * "Validation failed." and no hint. Append the distinct field messages so the
 * cause is at least named.
 */
export const saveTemplateErrorMessage = (
  result: SaveTemplateFailure
): string => {
  const base = result.message ?? 'Could not save';
  const fieldMessages = result.fieldErrors
    ? [...new Set(Object.values(result.fieldErrors))]
    : [];
  if (fieldMessages.length === 0) return base;
  return `${base} ${fieldMessages.join(' ')}`;
};
