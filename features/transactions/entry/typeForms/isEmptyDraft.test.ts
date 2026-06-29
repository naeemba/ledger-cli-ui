import { describe, it, expect } from 'vitest';
import { initDraft } from '../draftReducer';
import { isEmptyDraft } from './isEmptyDraft';

describe('isEmptyDraft', () => {
  it('is true for a fresh create draft (today + default currency only)', () => {
    expect(isEmptyDraft(initDraft({ date: '2026-06-29' }, 'USD'))).toBe(true);
  });

  it('is false when any posting has an account', () => {
    const d = initDraft({ date: '2026-06-29' }, 'USD');
    d.postings[0].account = 'Expenses:Food';
    expect(isEmptyDraft(d)).toBe(false);
  });

  it('is false when any posting has an amount', () => {
    const d = initDraft({ date: '2026-06-29' }, 'USD');
    d.postings[0].amount = '10';
    expect(isEmptyDraft(d)).toBe(false);
  });

  it('is false when a payee is set', () => {
    const d = initDraft({ date: '2026-06-29', payee: 'Cafe' }, 'USD');
    expect(isEmptyDraft(d)).toBe(false);
  });
});
