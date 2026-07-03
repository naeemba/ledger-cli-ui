import { describe, expect, it } from 'vitest';
import { Txn } from './model';
import type { Transaction } from '@/lib/journal/parser';

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
