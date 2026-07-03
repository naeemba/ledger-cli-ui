import { describe, expect, it } from 'vitest';
import { Txn } from './model';
import type { ParsedBlock, Transaction } from '@/lib/journal/parser';
import type { TemplateDraft } from '@/lib/templates/schema';

const txnFixture = (over: Partial<Transaction> = {}): Transaction => ({
  uid: 'u1',
  file: 'main.ledger',
  startLine: 1,
  endLine: 4,
  date: '2024-01-15',
  payee: 'Coffee Shop',
  status: 'cleared',
  note: null,
  postings: [
    { account: 'Expenses:Food', amount: '10.00', currency: 'USD' },
    { account: 'Assets:Cash', amount: '-10.00', currency: 'USD' },
  ],
  rawBlock: '',
  fingerprint: 'fp',
  ...over,
});

describe('Txn.empty', () => {
  it('seeds two blank postings in the default currency', () => {
    const t = Txn.empty('EUR');
    expect(t.date).toBe('');
    expect(t.payee).toBe('');
    expect(t.status).toBe('none');
    expect(t.note).toBe('');
    expect(t.uid).toBeUndefined();
    expect(t.postings).toEqual([
      { account: '', amount: '', currency: 'EUR' },
      { account: '', amount: '', currency: 'EUR' },
    ]);
  });
});

describe('Txn.fromTransaction', () => {
  it('projects the editable core and defaults blank currency', () => {
    const t = Txn.fromTransaction(txnFixture(), 'USD');
    expect(t.date).toBe('2024-01-15');
    expect(t.payee).toBe('Coffee Shop');
    expect(t.status).toBe('cleared');
    expect(t.note).toBe('');
    expect(t.uid).toBe('u1');
    expect(t.postings[0]).toEqual({
      account: 'Expenses:Food',
      amount: '10.00',
      currency: 'USD',
    });
  });

  it('carries cost and assertion annotations', () => {
    const t = Txn.fromTransaction(
      txnFixture({
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
      }),
      'USD'
    );
    expect(t.postings[0].cost).toEqual({ amount: '90', currency: 'EUR' });
    expect(t.postings[1].assertion).toEqual({ amount: '500', currency: 'EUR' });
  });

  it('maps a missing posting currency to the default', () => {
    const t = Txn.fromTransaction(
      txnFixture({
        postings: [{ account: 'A', amount: '1', currency: '' }],
      }),
      'GBP'
    );
    expect(t.postings[0].currency).toBe('GBP');
  });
});

describe('Txn.fromParsedBlock', () => {
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
    const t = Txn.fromParsedBlock(block);
    expect(t.date).toBe('2024-02-01');
    expect(t.status).toBe('pending');
    expect(t.note).toBe('monthly');
    expect(t.postings).toHaveLength(2);
  });

  it('falls back to prev uid when the block omits it', () => {
    const prev = new Txn('2024-02-01', 'Rent', 'pending', '', [], 'keep-me');
    expect(Txn.fromParsedBlock(block, prev).uid).toBe('keep-me');
    expect(Txn.fromParsedBlock({ ...block, uid: 'own' }, prev).uid).toBe('own');
  });
});

describe('Txn.fromTemplate', () => {
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
    const t = Txn.fromTemplate(tmpl, 'USD');
    expect(t.date).toBe('');
    expect(t.payee).toBe('Groceries');
    expect(t.postings[0].cost).toEqual({ amount: '90', currency: 'EUR' });
  });

  it('defaults a blank template posting currency', () => {
    const t = Txn.fromTemplate(
      { ...tmpl, postings: [{ account: 'A', amount: '1', currency: '' }] },
      'JPY'
    );
    expect(t.postings[0].currency).toBe('JPY');
  });
});

describe('Txn.fromJSON', () => {
  it('rebuilds a Txn from a parsed wire object', () => {
    const t = Txn.fromJSON({
      date: '2024-03-03',
      payee: 'Wire',
      status: 'cleared',
      note: 'n',
      uid: 'w1',
      postings: [{ account: 'A', amount: '1', currency: 'USD' }],
    });
    expect(t).toBeInstanceOf(Txn);
    expect(t.uid).toBe('w1');
    expect(t.note).toBe('n');
    expect(t.postings[0].currency).toBe('USD');
  });

  it('treats a missing note/uid as empty/undefined', () => {
    const t = Txn.fromJSON({
      date: '2024-03-03',
      payee: 'Wire',
      status: 'none',
      postings: [],
    });
    expect(t.note).toBe('');
    expect(t.uid).toBeUndefined();
  });

  it('round-trips a Txn with cost and assertion through JSON serialization', () => {
    const original = new Txn(
      '2024-03-03',
      '  Wire  ',
      'cleared',
      '',
      [
        {
          account: 'Assets:USD',
          amount: ' 100 ',
          currency: ' USD ',
          cost: { amount: ' 90 ', currency: ' EUR ' },
        },
        {
          account: 'Assets:EUR',
          amount: ' -90 ',
          currency: ' EUR ',
          assertion: { amount: ' 500 ', currency: ' EUR ' },
        },
      ],
      'rt1'
    );
    const reconstructed = Txn.fromJSON(
      JSON.parse(JSON.stringify(original.toWire('edit')))
    );
    expect(reconstructed.date).toBe('2024-03-03');
    expect(reconstructed.payee).toBe('Wire');
    expect(reconstructed.uid).toBe('rt1');
    expect(reconstructed.postings[0].cost).toEqual({
      amount: '90',
      currency: 'EUR',
    });
    expect(reconstructed.postings[1].assertion).toEqual({
      amount: '500',
      currency: 'EUR',
    });
  });
});

describe('Txn immutable updates', () => {
  const base = () =>
    new Txn('2024-01-01', 'P', 'none', '', [
      { account: 'A', amount: '1', currency: 'USD' },
      { account: 'B', amount: '-1', currency: 'USD' },
    ]);

  it('withField returns a new instance and does not mutate', () => {
    const a = base();
    const b = a.withField('payee', 'Changed');
    expect(b.payee).toBe('Changed');
    expect(a.payee).toBe('P');
    expect(b).not.toBe(a);
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

describe('Txn outputs', () => {
  const t = () =>
    new Txn(
      '2024-01-15',
      '  Coffee  ',
      'cleared',
      '  hi  ',
      [
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
      'u9'
    );

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
      new Txn('2024-01-15', 'P', 'none', '   ', []).toWire('create').note
    ).toBeUndefined();
  });

  it('toSubmit produces the trimmed submit DTO with date and uid', () => {
    const s = t().toSubmit();
    expect(s.date).toBe('2024-01-15');
    expect(s.uid).toBe('u9');
    expect(s.postings[0].cost).toEqual({ amount: '90', currency: 'EUR' });
    expect(s.postings[1].assertion).toEqual({ amount: '500', currency: 'EUR' });
  });

  it('toTemplate omits date/uid, trims, and defaults blank payee to dash', () => {
    const tpl = t().toTemplate();
    expect('date' in tpl).toBe(false);
    expect('uid' in tpl).toBe(false);
    expect(tpl.payee).toBe('Coffee');
    expect(tpl.postings[0].cost).toEqual({ amount: '90', currency: 'EUR' });
    expect(
      new Txn('', '   ', 'none', '', [
        { account: 'A', amount: '1', currency: 'USD' },
        { account: 'B', amount: '-1', currency: 'USD' },
      ]).toTemplate().payee
    ).toBe('—');
  });
});
