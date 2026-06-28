import { describe, it, expect } from 'vitest';
import {
  draftReducer,
  emptyPostings,
  initDraft,
  serializeDraftJson,
  type DraftState,
} from './draftReducer';

const base: DraftState = {
  date: '2026-06-29',
  payee: '',
  status: 'none',
  note: '',
  postings: [
    { account: '', amount: '', currency: 'USD' },
    { account: '', amount: '', currency: 'USD' },
  ],
};

describe('emptyPostings', () => {
  it('returns two blank postings in the given currency', () => {
    expect(emptyPostings('EUR')).toEqual([
      { account: '', amount: '', currency: 'EUR' },
      { account: '', amount: '', currency: 'EUR' },
    ]);
  });
});

describe('initDraft', () => {
  it('fills two blank postings when none provided', () => {
    const d = initDraft({ date: '2026-06-29' }, 'USD');
    expect(d.postings).toHaveLength(2);
    expect(d.status).toBe('none');
    expect(d.note).toBe('');
  });
  it('keeps provided postings and fields', () => {
    const d = initDraft(
      {
        date: '2026-06-29',
        payee: 'Acme',
        status: 'cleared',
        postings: [{ account: 'Assets:Cash', amount: '5', currency: 'USD' }],
      },
      'USD'
    );
    expect(d.payee).toBe('Acme');
    expect(d.status).toBe('cleared');
    expect(d.postings).toEqual([
      { account: 'Assets:Cash', amount: '5', currency: 'USD' },
    ]);
  });
});

describe('draftReducer', () => {
  it('setField updates a scalar field', () => {
    const s = draftReducer(base, {
      type: 'setField',
      field: 'payee',
      value: 'Whole Foods',
    });
    expect(s.payee).toBe('Whole Foods');
    expect(s).not.toBe(base); // immutable
  });
  it('setPosting updates one posting by index', () => {
    const s = draftReducer(base, {
      type: 'setPosting',
      index: 0,
      patch: { account: 'Expenses:Food' },
    });
    expect(s.postings[0].account).toBe('Expenses:Food');
    expect(s.postings[1]).toEqual(base.postings[1]);
  });
  it('addPosting appends a blank posting in the given currency', () => {
    const s = draftReducer(base, { type: 'addPosting', currency: 'USD' });
    expect(s.postings).toHaveLength(3);
    expect(s.postings[2]).toEqual({ account: '', amount: '', currency: 'USD' });
  });
  it('removePosting drops the posting at index but never below two', () => {
    const three = draftReducer(base, { type: 'addPosting', currency: 'USD' });
    const s = draftReducer(three, { type: 'removePosting', index: 2 });
    expect(s.postings).toHaveLength(2);
    const stillTwo = draftReducer(base, { type: 'removePosting', index: 0 });
    expect(stillTwo.postings).toHaveLength(2);
  });
  it('replaceAll swaps the entire draft', () => {
    const next: DraftState = { ...base, payee: 'X' };
    expect(draftReducer(base, { type: 'replaceAll', state: next })).toBe(next);
  });
});

describe('serializeDraftJson', () => {
  it('trims fields and omits empty note/uid in create mode', () => {
    const json = JSON.parse(
      serializeDraftJson(
        {
          ...base,
          payee: '  Acme  ',
          note: '   ',
          postings: [
            { account: ' Assets:Cash ', amount: ' 5 ', currency: ' USD ' },
          ],
        },
        'create'
      )
    );
    expect(json).toEqual({
      date: '2026-06-29',
      payee: 'Acme',
      status: 'none',
      note: undefined,
      uid: undefined,
      postings: [{ account: 'Assets:Cash', amount: '5', currency: 'USD' }],
    });
  });
  it('includes uid in edit mode', () => {
    const json = JSON.parse(
      serializeDraftJson({ ...base, uid: 'ULID123' }, 'edit')
    );
    expect(json.uid).toBe('ULID123');
  });
});
