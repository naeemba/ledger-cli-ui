import { describe, expect, it } from 'vitest';
import {
  fingerprintRecurring,
  formatRecurring,
  parseRecurringFile,
  recurringDraftSchema,
} from './recurring';

const draft = {
  period: 'Monthly from 2026/01/05',
  note: 'Netflix subscription',
  uid: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
  postings: [
    {
      account: 'Expenses:Subscriptions:Netflix',
      amount: '15.00',
      currency: 'USD',
    },
    { account: 'Assets:Checking', amount: '', currency: '' },
  ],
};

describe('formatRecurring / parseRecurringFile round-trip', () => {
  it('formats a periodic block ledger understands and parses it back', () => {
    const block = formatRecurring(draft);
    expect(block.startsWith('~ Monthly from 2026/01/05')).toBe(true);
    expect(block).toContain('; :uid: 01ARZ3NDEKTSV4RRFFQ69G5FAV');

    const text = `; header comment\n\n${block}\n\n2026-07-10 Grocer\n    Expenses:Food    USD 12.00\n    Assets:Checking\n`;
    const parsed = parseRecurringFile('/tmp/main.ledger', text);
    expect(parsed).toHaveLength(1);
    const [r] = parsed;
    expect(r.period).toBe(draft.period);
    expect(r.uid).toBe(draft.uid);
    expect(r.note).toBe(draft.note);
    expect(r.postings).toEqual([
      {
        account: 'Expenses:Subscriptions:Netflix',
        amount: '15.00',
        currency: 'USD',
      },
      { account: 'Assets:Checking', amount: '', currency: '' },
    ]);
    expect(r.fingerprint).toBe(fingerprintRecurring(r));
  });

  it('ignores dated transactions and reports 1-indexed line ranges', () => {
    const text = `2026-07-01 Payee\n    Expenses:X    USD 1.00\n    Assets:Y\n\n~ Weekly\n    Expenses:Coffee    USD 5.00\n    Assets:Cash\n`;
    const parsed = parseRecurringFile('/tmp/main.ledger', text);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].startLine).toBe(5);
    expect(parsed[0].endLine).toBe(7);
    expect(parsed[0].uid).toBeUndefined();
  });

  it('fingerprint changes when the period changes', () => {
    expect(fingerprintRecurring(draft)).not.toBe(
      fingerprintRecurring({ ...draft, period: 'Weekly' })
    );
  });
});

describe('recurringDraftSchema', () => {
  it('rejects an empty period and semicolon injection', () => {
    expect(
      recurringDraftSchema.safeParse({ ...draft, period: ' ' }).success
    ).toBe(false);
    expect(
      recurringDraftSchema.safeParse({ ...draft, period: 'Monthly ; include' })
        .success
    ).toBe(false);
  });

  it('requires at least two postings', () => {
    expect(
      recurringDraftSchema.safeParse({
        ...draft,
        postings: draft.postings.slice(0, 1),
      }).success
    ).toBe(false);
  });
});

describe(':handled: state line', () => {
  it('round-trips through format and parse without polluting note', () => {
    const testDraft = {
      period: 'every 1 months from 2026/01/05',
      note: 'Netflix',
      uid: '01HZX5G5KJDS9HQRYK8E5T0DJC',
      handled: '2026-07-05',
      postings: [
        { account: 'Expenses:Netflix', amount: '15', currency: 'USD' },
        { account: 'Assets:Checking', amount: '', currency: '' },
      ],
    };
    const block = formatRecurring(testDraft);
    expect(block).toContain('; :handled: 2026-07-05');
    const parsed = parseRecurringFile('main.ledger', block + '\n');
    expect(parsed).toHaveLength(1);
    expect(parsed[0].handled).toBe('2026-07-05');
    expect(parsed[0].note).toBe('Netflix');
  });

  it('changes the fingerprint when handled advances', () => {
    const base = {
      period: 'every 1 months from 2026/01/05',
      postings: [
        { account: 'Expenses:Netflix', amount: '15', currency: 'USD' },
        { account: 'Assets:Checking', amount: '', currency: '' },
      ],
    };
    expect(fingerprintRecurring({ ...base, handled: '2026-06-05' })).not.toBe(
      fingerprintRecurring({ ...base, handled: '2026-07-05' })
    );
  });
});

describe(':budget: tag', () => {
  const draft = {
    period: 'every 1 months from 2026/07/01',
    note: 'Groceries budget',
    uid: '01HZX5G5KJDS9HQRYK8E5T0DJC',
    budget: true,
    postings: [
      { account: 'Expenses:Food', amount: '400', currency: 'USD' },
      { account: 'Assets:Checking', amount: '', currency: '' },
    ],
  };

  it('round-trips through format and parse without polluting note', () => {
    const block = formatRecurring(draft);
    expect(block).toContain('; :budget:');
    const parsed = parseRecurringFile('main.ledger', block + '\n');
    expect(parsed).toHaveLength(1);
    expect(parsed[0].budget).toBe(true);
    expect(parsed[0].note).toBe('Groceries budget');
  });

  it('is absent by default and changes the fingerprint when set', () => {
    const { budget: _budget, ...plain } = draft;
    const block = formatRecurring(plain);
    expect(block).not.toContain(':budget:');
    expect(
      parseRecurringFile('main.ledger', block + '\n')[0].budget
    ).toBeUndefined();
    expect(fingerprintRecurring(plain)).not.toBe(fingerprintRecurring(draft));
  });
});
