// features/transactions/entry/typeForms/ExpenseForm.test.tsx
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { initDraft } from '../draftReducer';
import { ExpenseForm } from './ExpenseForm';

const html = (node: React.ReactNode) => renderToStaticMarkup(node);

describe('ExpenseForm', () => {
  it('renders fields seeded from an expense-shaped draft', () => {
    const draft = initDraft(
      {
        date: '2026-06-29',
        payee: 'Whole Foods',
        postings: [
          { account: 'Expenses:Groceries', amount: '42.50', currency: 'USD' },
          { account: 'Assets:Checking', amount: '-42.50', currency: 'USD' },
        ],
      },
      'USD'
    );
    const out = html(
      <ExpenseForm
        draft={draft}
        dispatch={() => {}}
        accounts={['Assets:Checking', 'Expenses:Groceries']}
        payees={['Whole Foods']}
        defaultCurrency="USD"
      />
    );
    expect(out).toContain('Whole Foods');
    expect(out).toContain('Expenses:Groceries');
    expect(out).toContain('Assets:Checking');
    expect(out).toContain('42.5');
  });

  it('renders empty fields for a fresh draft without crashing', () => {
    const out = html(
      <ExpenseForm
        draft={initDraft({ date: '2026-06-29' }, 'USD')}
        dispatch={() => {}}
        accounts={[]}
        payees={[]}
        defaultCurrency="USD"
      />
    );
    expect(out).toContain('Spent on');
    expect(out).toContain('Paid from');
  });
});
