import { describe, expect, it } from 'vitest';
import { Transaction, type TransactionData } from './model';
import type { ParsedBlock } from '@/lib/journal/parser';
import type { TemplateDraft } from '@/lib/templates/schema';

const transactionFixture = (
  over: Partial<TransactionData> = {}
): TransactionData => ({
  uid: 'u1',
  file: 'main.ledger',
  startLine: 1,
  endLine: 4,
  date: '2024-01-15',
  payee: 'Coffee Shop',
  status: 'cleared',
  note: '',
  postings: [
    { account: 'Expenses:Food', amount: '10.00', currency: 'USD' },
    { account: 'Assets:Cash', amount: '-10.00', currency: 'USD' },
  ],
  rawBlock: '',
  fingerprint: 'fp',
  ...over,
});

describe('Transaction.from / toData', () => {
  it('round-trips a plain projection back into an instance', () => {
    const data = transactionFixture();
    const t = Transaction.from(data);
    expect(t.payee).toBe('Coffee Shop');
    expect(t.uid).toBe('u1');
    expect(t.file).toBe('main.ledger');
    expect(t.fingerprint).toBe('fp');
    expect(t.toData()).toEqual(data);
  });
});

describe('Transaction.toRow', () => {
  it('projects the list fields and drops rawBlock/endLine', () => {
    const row = Transaction.from(transactionFixture()).toRow();
    expect(row).toEqual({
      uid: 'u1',
      file: 'main.ledger',
      startLine: 1,
      date: '2024-01-15',
      payee: 'Coffee Shop',
      status: 'cleared',
      note: '',
      fingerprint: 'fp',
      postings: [
        { account: 'Expenses:Food', amount: '10.00', currency: 'USD' },
        { account: 'Assets:Cash', amount: '-10.00', currency: 'USD' },
      ],
    });
  });
});

describe('Transaction.empty', () => {
  it('builds a blank two-posting draft in the given currency', () => {
    const t = Transaction.empty('EUR');
    expect(t.date).toBe('');
    expect(t.payee).toBe('');
    expect(t.postings).toEqual([
      { account: '', amount: '', currency: 'EUR' },
      { account: '', amount: '', currency: 'EUR' },
    ]);
  });
});

describe('Transaction.withDefaultCurrency', () => {
  it('fills blank posting currencies with the default', () => {
    const t = Transaction.from(
      transactionFixture({
        postings: [{ account: 'A', amount: '1', currency: '' }],
      })
    ).withDefaultCurrency('GBP');
    expect(t.postings[0].currency).toBe('GBP');
  });

  it('leaves non-blank currencies and annotations intact', () => {
    const t = Transaction.from(
      transactionFixture({
        postings: [
          {
            account: 'Assets:USD',
            amount: '100',
            currency: 'USD',
            cost: { amount: '90', currency: 'EUR' },
          },
          {
            account: 'Assets:EUR',
            amount: '-90',
            currency: 'EUR',
            assertion: { amount: '500', currency: 'EUR' },
          },
        ],
      })
    ).withDefaultCurrency('GBP');
    expect(t.postings[0].currency).toBe('USD');
    expect(t.postings[0].cost).toEqual({ amount: '90', currency: 'EUR' });
    expect(t.postings[1].assertion).toEqual({ amount: '500', currency: 'EUR' });
  });
});

describe('Transaction.fromParsedBlock', () => {
  const block: Omit<ParsedBlock, 'unparsedLines'> = {
    uid: null,
    date: '2024-02-01',
    status: 'pending',
    payee: 'Rent',
    note: 'monthly',
    postings: [
      { account: 'Expenses:Rent', amount: '1200', currency: 'USD' },
      { account: 'Assets:Bank', amount: '-1200', currency: 'USD' },
    ],
  };

  it('maps the block and keeps note as a string', () => {
    const t = Transaction.fromParsedBlock(block);
    expect(t.date).toBe('2024-02-01');
    expect(t.status).toBe('pending');
    expect(t.note).toBe('monthly');
    expect(t.postings).toHaveLength(2);
  });

  it('falls back to prev uid when the block omits it', () => {
    const prev = Transaction.from({
      date: '2024-02-01',
      payee: 'Rent',
      status: 'pending',
      note: '',
      postings: [],
      uid: 'keep-me',
    });
    expect(Transaction.fromParsedBlock(block, prev).uid).toBe('keep-me');
    expect(
      Transaction.fromParsedBlock({ ...block, uid: 'own' }, prev).uid
    ).toBe('own');
  });
});

describe('Transaction.fromTemplate', () => {
  const tmpl: TemplateDraft = {
    payee: 'Groceries',
    status: 'none',
    postings: [
      {
        account: 'Assets:USD',
        amount: '100',
        currency: 'USD',
        cost: { amount: '90', currency: 'EUR' },
      },
      { account: 'Assets:EUR', amount: '-90', currency: 'EUR' },
    ],
  };

  it('hydrates a date-less template and carries cost', () => {
    const t = Transaction.fromTemplate(tmpl, 'USD');
    expect(t.date).toBe('');
    expect(t.payee).toBe('Groceries');
    expect(t.postings[0].cost).toEqual({ amount: '90', currency: 'EUR' });
  });

  it('defaults a blank template posting currency', () => {
    const t = Transaction.fromTemplate(
      { ...tmpl, postings: [{ account: 'A', amount: '1', currency: '' }] },
      'JPY'
    );
    expect(t.postings[0].currency).toBe('JPY');
  });

  // The quick-entry "Repeat a template" path: hydrate, stamp today's date,
  // and serialize for the create action.
  it('stamps a date onto a repeated template for a create draft', () => {
    const wire = Transaction.fromTemplate(tmpl, 'USD')
      .withField('date', '2026-07-13')
      .toWire('create');
    expect(wire.date).toBe('2026-07-13');
    expect(wire.payee).toBe('Groceries');
    expect(wire.postings).toHaveLength(2);
  });
});

describe('Transaction immutable updates', () => {
  const base = () =>
    Transaction.from({
      date: '2024-01-01',
      payee: 'P',
      status: 'none',
      note: '',
      postings: [
        { account: 'A', amount: '1', currency: 'USD' },
        { account: 'B', amount: '-1', currency: 'USD' },
      ],
    });

  it('withField returns a new instance and does not mutate', () => {
    const a = base();
    const b = a.withField('payee', 'Changed');
    expect(b.payee).toBe('Changed');
    expect(a.payee).toBe('P');
    expect(b).not.toBe(a);
  });

  it('withField preserves identity metadata', () => {
    const a = Transaction.from(transactionFixture());
    const b = a.withField('payee', 'Changed');
    expect(b.uid).toBe('u1');
    expect(b.fingerprint).toBe('fp');
    expect(b.file).toBe('main.ledger');
  });

  it('withPosting patches one posting only', () => {
    const b = base().withPosting(1, { amount: '-2' });
    expect(b.postings[1].amount).toBe('-2');
    expect(b.postings[0].amount).toBe('1');
  });

  it('addPosting appends a blank posting in the given currency', () => {
    const b = base().addPosting('EUR');
    expect(b.postings).toHaveLength(3);
    expect(b.postings[2]).toEqual({ account: '', amount: '', currency: 'EUR' });
  });

  it('removePosting deletes by index above the two-row floor', () => {
    const b = base().addPosting('USD').removePosting(0);
    expect(b.postings).toHaveLength(2);
    expect(b.postings[0].account).toBe('B');
  });

  it('removePosting is a no-op at two postings', () => {
    const a = base();
    expect(a.removePosting(0)).toBe(a);
  });
});

describe('Transaction.accountsSummary', () => {
  const summary = (postings: TransactionData['postings']) =>
    Transaction.from(transactionFixture({ postings })).accountsSummary();

  it('splits source → destination by sign using leaf names', () => {
    expect(
      summary([
        {
          account: 'Expenses:Cigarette_Alcohol',
          amount: '300.00',
          currency: 'KIRT',
        },
        { account: 'Expenses:Wage', amount: '0.90', currency: 'KIRT' },
        { account: 'Assets:Bank:Blubank', amount: '-300.90', currency: 'KIRT' },
      ])
    ).toBe('Blubank → Cigarette_Alcohol, Wage');
  });

  it('reads a transfer as from → to', () => {
    expect(
      summary([
        { account: 'Assets:Bank:Blubank', amount: '100', currency: 'KIRT' },
        { account: 'Assets:Crypto:Tabdeal', amount: '-100', currency: 'KIRT' },
      ])
    ).toBe('Tabdeal → Blubank');
  });

  it('caps each side at two names with +N overflow', () => {
    expect(
      summary([
        { account: 'Expenses:A', amount: '1', currency: 'USD' },
        { account: 'Expenses:B', amount: '1', currency: 'USD' },
        { account: 'Expenses:C', amount: '1', currency: 'USD' },
        { account: 'Assets:Cash', amount: '-3', currency: 'USD' },
      ])
    ).toBe('Cash → A, B +1');
  });

  it('falls back to a plain list when there is no clear two sides', () => {
    expect(
      summary([{ account: 'Equity:Opening', amount: '0', currency: 'USD' }])
    ).toBe('Opening');
  });
});

describe('Transaction outputs', () => {
  const t = () =>
    Transaction.from({
      date: '2024-01-15',
      payee: '  Coffee  ',
      status: 'cleared',
      note: '  hi  ',
      postings: [
        {
          account: '  Assets:USD  ',
          amount: ' 100 ',
          currency: ' USD ',
          cost: { amount: ' 90 ', currency: ' EUR ' },
        },
        {
          account: 'Assets:EUR',
          amount: '-90',
          currency: 'EUR',
          assertion: { amount: ' 500 ', currency: ' EUR ' },
        },
      ],
      uid: 'u9',
    });

  it('toWire trims, drops blank note, and keeps uid only in edit mode', () => {
    expect(t().toWire('edit').uid).toBe('u9');
    expect(t().toWire('create').uid).toBeUndefined();
    const w = t().toWire('edit');
    expect(w.payee).toBe('Coffee');
    expect(w.note).toBe('hi');
    expect(w.postings[0]).toEqual({
      account: 'Assets:USD',
      amount: '100',
      currency: 'USD',
      cost: { amount: '90', currency: 'EUR' },
    });
    expect(w.postings[1].assertion).toEqual({ amount: '500', currency: 'EUR' });
    expect(
      Transaction.from({
        date: '2024-01-15',
        payee: 'P',
        status: 'none',
        note: '   ',
        postings: [],
      }).toWire('create').note
    ).toBeUndefined();
  });

  it('toTemplate omits date/uid, trims, and defaults blank payee to dash', () => {
    const tpl = t().toTemplate();
    expect('date' in tpl).toBe(false);
    expect('uid' in tpl).toBe(false);
    expect(tpl.payee).toBe('Coffee');
    expect(tpl.postings[0].cost).toEqual({ amount: '90', currency: 'EUR' });
    expect(
      Transaction.from({
        date: '',
        payee: '   ',
        status: 'none',
        note: '',
        postings: [
          { account: 'A', amount: '1', currency: 'USD' },
          { account: 'B', amount: '-1', currency: 'USD' },
        ],
      }).toTemplate().payee
    ).toBe('—');
  });

  it('toTemplate drops blank filler posting rows', () => {
    const tpl = Transaction.from({
      date: '',
      payee: 'Coffee',
      status: 'none',
      note: '',
      postings: [
        { account: 'Expenses:Food', amount: '10', currency: 'USD' },
        { account: 'Assets:Cash', amount: '-10', currency: 'USD' },
        { account: '  ', amount: '', currency: 'USD' },
      ],
    }).toTemplate();
    expect(tpl.postings).toHaveLength(2);
    expect(tpl.postings.map((p) => p.account)).toEqual([
      'Expenses:Food',
      'Assets:Cash',
    ]);
  });
});
