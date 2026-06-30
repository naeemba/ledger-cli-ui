import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';
import TransactionRowItem from './TransactionRowItem';
import type { TransactionRow } from './transactionRow';

// RowActions pulls in next/navigation + dialogs; stub it for a pure render.
vi.mock('./RowActions', () => ({ default: () => null }));

const row: TransactionRow = {
  uid: 'U1',
  file: 'main.ledger',
  startLine: 1,
  date: '2026-01-02',
  payee: 'Coffee Shop',
  status: 'cleared',
  note: null,
  fingerprint: 'abc',
  postings: [
    { account: 'Expenses:Food', amount: '5.00', currency: '$' },
    { account: 'Assets:Cash', amount: '-5.00', currency: '$' },
  ],
};

const html = (node: React.ReactNode) => renderToStaticMarkup(node);

describe('TransactionRowItem', () => {
  it('renders the payee', () => {
    expect(html(<TransactionRowItem row={row} />)).toContain('Coffee Shop');
  });

  it('renders the account summary', () => {
    expect(html(<TransactionRowItem row={row} />)).toContain('Expenses:Food');
  });

  it('links to the edit page when a uid is present', () => {
    expect(html(<TransactionRowItem row={row} />)).toContain(
      '/transactions/U1/edit'
    );
  });
});
