import { describe, it, expect } from 'vitest';
import { initDraft, type DraftState } from './draftReducer';
import { parsedBlockToDraft } from './parsedBlockToDraft';
import { parseBlock } from '@/lib/journal/parser';
import { formatTransaction } from '@/lib/transactions/schema';

describe('parsedBlockToDraft', () => {
  it('maps every field of a parsed block onto a draft', () => {
    const block = {
      uid: null,
      date: '2026-06-29',
      status: 'cleared' as const,
      payee: 'Whole Foods',
      note: 'weekly shop',
      postings: [
        { account: 'Expenses:Groceries', amount: '42.50', currency: 'USD' },
        { account: 'Assets:Checking', amount: '-42.50', currency: 'USD' },
      ],
    };
    expect(parsedBlockToDraft(block)).toEqual({
      date: '2026-06-29',
      payee: 'Whole Foods',
      status: 'cleared',
      note: 'weekly shop',
      uid: undefined,
      postings: [
        { account: 'Expenses:Groceries', amount: '42.50', currency: 'USD' },
        { account: 'Assets:Checking', amount: '-42.50', currency: 'USD' },
      ],
    });
  });

  it('turns a null note into an empty string', () => {
    const block = {
      uid: null,
      date: '2026-06-29',
      status: 'none' as const,
      payee: 'Acme',
      note: null,
      postings: [{ account: 'Assets:Cash', amount: '5', currency: 'USD' }],
    };
    expect(parsedBlockToDraft(block).note).toBe('');
  });

  it('keeps the prior uid when the raw text omits the uid line', () => {
    const prev: DraftState = {
      date: '2026-06-29',
      payee: 'Acme',
      status: 'none',
      note: '',
      uid: '01HZX9K3QF8V5C7R2D4M6N8P0T',
      postings: [{ account: 'Assets:Cash', amount: '5', currency: 'USD' }],
    };
    const block = {
      uid: null,
      date: '2026-06-29',
      status: 'none' as const,
      payee: 'Acme',
      note: null,
      postings: [{ account: 'Assets:Cash', amount: '5', currency: 'USD' }],
    };
    expect(parsedBlockToDraft(block, prev).uid).toBe(
      '01HZX9K3QF8V5C7R2D4M6N8P0T'
    );
  });

  it('prefers the uid present in the raw text over the prior uid', () => {
    const prev: DraftState = {
      date: '2026-06-29',
      payee: 'Acme',
      status: 'none',
      note: '',
      uid: '01HZX9K3QF8V5C7R2D4M6N8P0T',
      postings: [],
    };
    const block = {
      uid: '01J0000000000000000000000A',
      date: '2026-06-29',
      status: 'none' as const,
      payee: 'Acme',
      note: null,
      postings: [],
    };
    expect(parsedBlockToDraft(block, prev).uid).toBe(
      '01J0000000000000000000000A'
    );
  });

  it('round-trips a draft through formatTransaction → parseBlock → parsedBlockToDraft', () => {
    const draft = initDraft(
      {
        date: '2026-06-29',
        payee: 'Whole Foods',
        status: 'cleared',
        note: 'weekly shop',
        postings: [
          { account: 'Expenses:Groceries', amount: '42.50', currency: 'USD' },
          { account: 'Assets:Checking', amount: '-42.50', currency: 'USD' },
        ],
      },
      'USD'
    );
    const block = parseBlock(formatTransaction(draft));
    expect(block).not.toBeNull();
    expect(parsedBlockToDraft(block!)).toEqual(draft);
  });

  it('round-trips the uid line for an edited transaction', () => {
    const draft = initDraft(
      {
        date: '2026-06-29',
        payee: 'Acme',
        status: 'none',
        uid: '01HZX9K3QF8V5C7R2D4M6N8P0T',
        postings: [
          { account: 'Income:Salary', amount: '-100', currency: 'USD' },
          { account: 'Assets:Checking', amount: '100', currency: 'USD' },
        ],
      },
      'USD'
    );
    const block = parseBlock(formatTransaction(draft));
    expect(parsedBlockToDraft(block!).uid).toBe('01HZX9K3QF8V5C7R2D4M6N8P0T');
  });
});
