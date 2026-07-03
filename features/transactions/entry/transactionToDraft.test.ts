import { describe, it, expect } from 'vitest';
import { transactionToDraft } from './transactionToDraft';
import { fingerprintDraft } from '@/lib/journal/fingerprint';
import { parseJournalFile } from '@/lib/journal/parser';

describe('transactionToDraft', () => {
  it('produces a draft whose fingerprint matches the parsed transaction (plain postings)', () => {
    const text = [
      '2026-06-29 Whole Foods',
      '    ; :uid: 01J0000000000000000000000A',
      '    Expenses:Groceries    USD 42.50',
      '    Assets:Checking       USD -42.50',
    ].join('\n');
    const [tx] = parseJournalFile('main.ledger', text);
    expect(tx).toBeDefined();

    const draft = transactionToDraft(tx, 'USD');
    expect(fingerprintDraft(draft)).toBe(tx.fingerprint);
  });

  it('carries @@ cost and = assertion so the fingerprint still matches (regression: A1)', () => {
    // A transaction the app itself can create (exchange type form emits @@ cost).
    // Before the fix, initialDraft dropped cost/assertion, so its fingerprint
    // never matched tx.fingerprint and every edit failed as falsely "stale".
    const text = [
      '2026-06-29 Currency exchange',
      '    ; :uid: 01J0000000000000000000000B',
      '    Assets:EUR         EUR 92 @@ USD 100',
      '    Assets:Checking    = USD 5',
    ].join('\n');
    const [tx] = parseJournalFile('main.ledger', text);
    expect(tx).toBeDefined();
    // Guard the fixture: the parser must actually see the annotations.
    expect(tx.postings[0].cost).toEqual({ amount: '100', currency: 'USD' });
    expect(tx.postings[1].assertion).toEqual({ amount: '5', currency: 'USD' });

    const draft = transactionToDraft(tx, 'USD');
    expect(draft.postings[0].cost).toEqual({ amount: '100', currency: 'USD' });
    expect(draft.postings[1].assertion).toEqual({
      amount: '5',
      currency: 'USD',
    });
    expect(fingerprintDraft(draft)).toBe(tx.fingerprint);
  });

  it('substitutes the default currency for a posting with no explicit currency', () => {
    const tx = {
      uid: '01J0000000000000000000000C',
      file: 'main.ledger',
      startLine: 1,
      endLine: 2,
      date: '2026-06-29',
      payee: 'Acme',
      status: 'none' as const,
      note: null,
      postings: [{ account: 'Assets:Cash', amount: '5', currency: '' }],
      rawBlock: '',
      fingerprint: '',
    };
    const draft = transactionToDraft(tx, 'USD');
    expect(draft.postings[0].currency).toBe('USD');
  });
});
