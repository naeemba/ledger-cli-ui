import { describe, expect, it } from 'vitest';
import { saveTemplateErrorMessage } from './saveTemplateError';

describe('saveTemplateErrorMessage', () => {
  it('returns the bare message when there are no field errors', () => {
    expect(
      saveTemplateErrorMessage({
        ok: false,
        reason: 'invalid',
        message: 'Nope',
      })
    ).toBe('Nope');
  });

  it('falls back to a default when no message is present', () => {
    expect(saveTemplateErrorMessage({ ok: false, reason: 'invalid' })).toBe(
      'Could not save'
    );
  });

  it('appends deduplicated field-error messages so the cause is visible', () => {
    expect(
      saveTemplateErrorMessage({
        ok: false,
        reason: 'invalid',
        message: 'Validation failed.',
        fieldErrors: {
          'draft.postings.2.account': 'Account is required',
          'draft.postings.3.account': 'Account is required',
        },
      })
    ).toBe('Validation failed. Account is required');
  });
});
