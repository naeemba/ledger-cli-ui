import { describe, it, expect } from 'vitest';
import { toTransactionRow } from './transactionRow';
import type { TransactionData } from '@/lib/transactions/model';

const sample: TransactionData = {
  uid: 'U1',
  file: 'main.ledger',
  startLine: 1,
  endLine: 4,
  date: '2026-01-02',
  payee: 'Coffee',
  status: 'cleared',
  note: '',
  postings: [
    {
      account: 'Expenses:Food',
      amount: '5.00',
      currency: '$',
      cost: { amount: '1', currency: '€' },
    },
    { account: 'Assets:Cash', amount: '-5.00', currency: '$' },
  ],
  rawBlock: '2026-01-02 Coffee\n  Expenses:Food  $5.00\n  Assets:Cash  $-5.00',
  fingerprint: 'abc',
};

const withAssertion: TransactionData = {
  ...sample,
  postings: [
    { account: 'Assets:Cash', amount: '-5.00', currency: '$' },
    { account: 'Expenses:Food', amount: '5.00', currency: '$' },
    {
      account: 'Assets:Cash',
      amount: '',
      currency: '',
      assertion: { amount: '95.00', currency: '$' },
    },
  ],
};

describe('toTransactionRow', () => {
  it('drops rawBlock and endLine', () => {
    const row = toTransactionRow(sample);
    expect('rawBlock' in row).toBe(false);
    expect('endLine' in row).toBe(false);
  });

  it('carries cost annotations through so they can round-trip', () => {
    const row = toTransactionRow(sample);
    expect(row.postings[0]).toEqual({
      account: 'Expenses:Food',
      amount: '5.00',
      currency: '$',
      cost: { amount: '1', currency: '€' },
    });
  });

  it('carries balance-assertion annotations through', () => {
    const row = toTransactionRow(withAssertion);
    expect(row.postings[2]).toEqual({
      account: 'Assets:Cash',
      amount: '',
      currency: '',
      assertion: { amount: '95.00', currency: '$' },
    });
  });

  it('omits cost/assertion keys for plain postings', () => {
    const row = toTransactionRow(sample);
    expect('cost' in row.postings[1]).toBe(false);
    expect('assertion' in row.postings[1]).toBe(false);
  });

  it('preserves fields the table and row actions consume', () => {
    const row = toTransactionRow(sample);
    expect(row).toMatchObject({
      uid: 'U1',
      file: 'main.ledger',
      startLine: 1,
      date: '2026-01-02',
      payee: 'Coffee',
      status: 'cleared',
      note: '',
      fingerprint: 'abc',
    });
  });
});
