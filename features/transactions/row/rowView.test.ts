import { describe, expect, it } from 'vitest';
import { transactionRowToView } from './rowView';
import type { TransactionRow } from '@/lib/transactions/model';

const row: TransactionRow = {
  uid: 'u1',
  file: 'main.ledger',
  startLine: 1,
  date: '2026-01-15',
  payee: 'Coffee Shop',
  status: 'cleared',
  note: '',
  fingerprint: 'fp',
  postings: [
    { account: 'Expenses:Coffee', amount: '5.00', currency: 'USD' },
    { account: 'Assets:Checking', amount: '-5.00', currency: 'USD' },
  ],
};

describe('transactionRowToView', () => {
  it('maps core fields, accounts summary, amount, uid, and a template draft', () => {
    const view = transactionRowToView(row);
    expect(view.date).toBe('2026-01-15');
    expect(view.payee).toBe('Coffee Shop');
    expect(view.status).toBe('cleared');
    expect(view.uid).toBe('u1');
    expect(view.accountsSummary).toContain('Expenses:Coffee');
    expect(view.amount).toContain('USD');
    expect(view.templateDraft).toBeDefined();
    expect(view.templateDraft?.payee).toBe('Coffee Shop');
  });
});
