// features/transactions/entry/TypeLens.test.tsx
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { TypeLens } from './TypeLens';
import { initDraft } from './draftReducer';

const html = (node: React.ReactNode) => renderToStaticMarkup(node);
const base = {
  dispatch: () => {},
  accounts: ['Assets:Checking', 'Expenses:Food'],
  payees: [],
  defaultCurrency: 'USD',
  getAccountBalance: async () => '0',
};

describe('TypeLens', () => {
  it('preselects the Expense type for an empty draft', () => {
    const out = html(
      <TypeLens draft={initDraft({ date: '2026-06-29' }, 'USD')} {...base} />
    );
    // An empty draft preselects Expense, so its form renders ("Paid from" is an
    // Expense-form field) instead of the "Pick a type" prompt.
    expect(out).not.toContain('Pick a type');
    expect(out).toContain('Expense');
    expect(out).toContain('Paid from');
  });

  it('renders the matching form for an expense-shaped draft', () => {
    const draft = initDraft(
      {
        date: '2026-06-29',
        payee: 'Cafe',
        postings: [
          { account: 'Expenses:Food', amount: '5', currency: 'USD' },
          { account: 'Assets:Checking', amount: '-5', currency: 'USD' },
        ],
      },
      'USD'
    );
    const out = html(<TypeLens draft={draft} {...base} />);
    expect(out).toContain('Spent on');
  });

  it('greys chips and shows a notice for an unrecognized shape', () => {
    const draft = initDraft(
      {
        date: '2026-06-29',
        payee: 'Split',
        postings: [
          { account: 'Expenses:Food', amount: '5', currency: 'USD' },
          { account: 'Expenses:Fun', amount: '5', currency: 'USD' },
          { account: 'Assets:Checking', amount: '-10', currency: 'USD' },
        ],
      },
      'USD'
    );
    const out = html(<TypeLens draft={draft} {...base} />);
    expect(out).toContain('Form or Raw');
  });
});
