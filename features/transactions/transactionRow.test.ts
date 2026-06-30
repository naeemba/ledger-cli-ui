import { describe, it, expect } from 'vitest';
import { toTransactionRow } from './transactionRow';
import type { Transaction } from '@/lib/journal/parser';

const sample: Transaction = {
  uid: 'U1',
  file: 'main.ledger',
  startLine: 1,
  endLine: 4,
  date: '2026-01-02',
  payee: 'Coffee',
  status: 'cleared',
  note: null,
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

describe('toTransactionRow', () => {
  it('drops rawBlock and endLine', () => {
    const row = toTransactionRow(sample);
    expect('rawBlock' in row).toBe(false);
    expect('endLine' in row).toBe(false);
  });

  it('slims postings to account/amount/currency only', () => {
    const row = toTransactionRow(sample);
    expect(row.postings[0]).toEqual({
      account: 'Expenses:Food',
      amount: '5.00',
      currency: '$',
    });
    expect('cost' in row.postings[0]).toBe(false);
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
      note: null,
      fingerprint: 'abc',
    });
  });
});
