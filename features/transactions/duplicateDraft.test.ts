import { describe, expect, it, vi } from 'vitest';
import { asDuplicate } from './duplicateDraft';
import { initDraft, serializeDraftJson } from './entry/draftReducer';

const loaded = {
  ok: true as const,
  draft: {
    date: '2026-01-15',
    payee: 'Lunch with Sam',
    status: 'cleared' as const,
    note: 'split bill',
    uid: '01HZX0000000000000000000AA',
    postings: [
      { account: 'Assets:Receivable:Sam', amount: '20', currency: 'USD' },
      { account: 'Assets:Checking', amount: '-20', currency: 'USD' },
    ],
  },
  fingerprint: 'abc',
  accounts: [],
  payees: [],
  defaultCurrency: 'USD',
  currencies: ['USD'],
};

describe('asDuplicate', () => {
  it('keeps every field but dates the copy today and drops the uid', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 3, 12));
    const copy = asDuplicate(loaded);
    vi.useRealTimers();

    expect(copy.draft).toEqual({
      ...loaded.draft,
      date: '2026-10-03',
      uid: undefined,
    });
    const wire = JSON.parse(
      serializeDraftJson(initDraft(copy.draft, copy.defaultCurrency), 'create')
    );
    expect(wire.uid).toBeUndefined();
    expect(loaded.draft.uid).toBe('01HZX0000000000000000000AA');
  });
});
