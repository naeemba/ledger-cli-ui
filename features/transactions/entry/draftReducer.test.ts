import { describe, it, expect } from 'vitest';
import {
  draftReducer,
  emptyPostings,
  initDraft,
  serializeDraftJson,
  type DraftState,
} from './draftReducer';
import { Txn } from '@/lib/transactions/model';

const base: DraftState = initDraft({ date: '2026-06-29' }, 'USD');

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
    const next: DraftState = base.withField('payee', 'X');
    expect(draftReducer(base, { type: 'replaceAll', state: next })).toBe(next);
  });
});

describe('serializeDraftJson — cost and assertion', () => {
  it('serializes a cost-bearing posting', () => {
    const json = JSON.parse(
      serializeDraftJson(
        new Txn('2026-06-29', '', 'none', '', [
          {
            account: 'Assets:EUR',
            amount: '92',
            currency: 'EUR',
            cost: { amount: '100', currency: 'USD' },
          },
          { account: 'Assets:Checking', amount: '-100', currency: 'USD' },
        ]),
        'create'
      )
    );
    expect(json.postings[0].cost).toEqual({ amount: '100', currency: 'USD' });
    expect(json.postings[1].cost).toBeUndefined();
  });
  it('serializes an assertion-bearing posting', () => {
    const json = JSON.parse(
      serializeDraftJson(
        new Txn('2026-06-29', '', 'none', '', [
          {
            account: 'Assets:Checking',
            amount: '',
            currency: '',
            assertion: { amount: '1234.56', currency: 'USD' },
          },
          { account: 'Equity:Adjustments', amount: '', currency: '' },
        ]),
        'create'
      )
    );
    expect(json.postings[0].assertion).toEqual({
      amount: '1234.56',
      currency: 'USD',
    });
    expect(json.postings[1].assertion).toBeUndefined();
  });
});

describe('serializeDraftJson', () => {
  it('trims fields and omits empty note/uid in create mode', () => {
    const json = JSON.parse(
      serializeDraftJson(
        new Txn('2026-06-29', '  Acme  ', 'none', '   ', [
          { account: ' Assets:Cash ', amount: ' 5 ', currency: ' USD ' },
        ]),
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
      serializeDraftJson(
        new Txn('2026-06-29', '', 'none', '', base.postings, 'ULID123'),
        'edit'
      )
    );
    expect(json.uid).toBe('ULID123');
  });
  it('omits uid in create mode even when present on state', () => {
    const json = JSON.parse(
      serializeDraftJson(
        new Txn('2026-06-29', '', 'none', '', base.postings, 'ULID123'),
        'create'
      )
    );
    expect(json.uid).toBeUndefined();
  });
});
