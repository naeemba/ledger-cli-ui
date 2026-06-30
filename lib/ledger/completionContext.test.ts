import { describe, it, expect } from 'vitest';
import { completionAt, type CompletionLists } from './completionContext';

const lists: CompletionLists = {
  accounts: [
    'Expenses:Groceries',
    'Expenses:Gas',
    'Assets:Checking',
    'Assets:Cash',
  ],
  payees: ['Whole Foods', 'Walmart'],
  commodities: ['USD', 'EUR'],
};

const at = (doc: string, lists2: CompletionLists = lists) =>
  completionAt(doc, doc.length, lists2);

describe('completionAt', () => {
  it('suggests payees on the header line after the date', () => {
    const res = at('2026-06-30 Who');
    expect(res).not.toBeNull();
    expect(res!.from).toBe('2026-06-30 '.length);
    expect(res!.options).toEqual(['Whole Foods']);
  });

  it('suggests payees after a status marker', () => {
    const res = at('2026-06-30 * Wal');
    expect(res!.options).toEqual(['Walmart']);
    expect(res!.from).toBe('2026-06-30 * '.length);
  });

  it('returns null inside the date itself', () => {
    expect(at('2026-06-3')).toBeNull();
  });

  it('suggests accounts in the account region of a posting', () => {
    const doc = '2026-06-30 Groceries\n    Expenses:G';
    const res = completionAt(doc, doc.length, lists);
    expect(res!.options).toEqual(['Expenses:Groceries', 'Expenses:Gas']);
    expect(res!.from).toBe(doc.length - 'Expenses:G'.length);
  });

  it('suggests commodities after the amount gap', () => {
    const doc = '2026-06-30 Groceries\n    Assets:Cash    US';
    const res = completionAt(doc, doc.length, lists);
    expect(res!.options).toEqual(['USD']);
    expect(res!.from).toBe(doc.length - 'US'.length);
  });

  it('filters case-insensitively', () => {
    const doc = '2026-06-30 Groceries\n    assets:ch';
    const res = completionAt(doc, doc.length, lists);
    expect(res!.options).toEqual(['Assets:Checking']);
  });
});
