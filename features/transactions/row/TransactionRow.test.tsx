import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';
import TransactionRow from './TransactionRow';
import { transactionRowToView } from './rowView';
import type { TransactionRow as TransactionRowData } from '@/lib/transactions/model';

// RowActions pulls in next/navigation + dialogs; stub it for a pure render.
vi.mock('../RowActions', () => ({ default: () => null }));

const row: TransactionRowData = {
  uid: 'U1',
  file: 'main.ledger',
  startLine: 1,
  date: '2026-01-02',
  payee: 'Coffee Shop',
  status: 'cleared',
  note: '',
  fingerprint: 'abc',
  postings: [
    { account: 'Expenses:Food', amount: '5.00', currency: '$' },
    { account: 'Assets:Cash', amount: '-5.00', currency: '$' },
  ],
};

const html = (view: Parameters<typeof TransactionRow>[0]['view']) =>
  renderToStaticMarkup(<TransactionRow view={view} />);

describe('TransactionRow', () => {
  it('renders the payee from transactionRowToView', () => {
    const view = transactionRowToView(row);
    const out = html(view);
    expect(out).toContain('Coffee Shop');
  });

  it('renders the account summary in the descriptor', () => {
    const view = transactionRowToView(row);
    const out = html(view);
    expect(out).toContain('Expenses:Food');
  });

  it('links to /transactions/U1/edit when the view has a uid', () => {
    const view = transactionRowToView(row);
    const out = html(view);
    expect(out).toContain('/transactions/U1/edit');
  });

  it('does NOT render an edit link when the view has no uid', () => {
    const view = transactionRowToView({ ...row, uid: undefined });
    const out = html(view);
    expect(out).not.toContain('/transactions/');
  });

  it('renders a running total when present', () => {
    const view = {
      date: '2026-01-02',
      payee: 'X',
      amount: '$ 5.00',
      runningTotal: '$ 42.00',
      uid: 'U1',
      status: 'cleared' as const,
    };
    const out = html(view);
    expect(out).toContain('42');
  });

  it('renders age on both mobile and desktop when present', () => {
    const view = {
      date: '2026-01-02',
      payee: 'X',
      amount: '$ 5.00',
      age: 42,
      uid: 'U1',
      status: 'cleared' as const,
    };
    const out = html(view);
    expect(out).toContain('42d');
  });
});
