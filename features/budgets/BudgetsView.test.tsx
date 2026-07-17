import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';
import BudgetsView from './BudgetsView';

vi.mock('./actions/createBudget', () => ({
  createBudgetAction: async () => ({ ok: true }) as never,
}));
vi.mock('./actions/deleteBudget', () => ({
  deleteBudgetAction: async () => ({ ok: true }) as never,
}));

const html = (node: React.ReactNode) => renderToStaticMarkup(node);

describe('BudgetsView', () => {
  it('renders one delete button per uid even when two lines share an account', () => {
    const report = {
      month: [
        {
          account: 'Expenses:Groceries',
          actual: '100 USD',
          budgeted: '500 USD',
          difference: '400 USD',
          usedRatio: 0.2,
        },
      ],
      yearToDate: [],
      unbudgeted: [],
    };

    const lines = [
      {
        uid: 'uid-1',
        fingerprint: 'fp-1',
        period: 'every 1 month',
        postings: [
          { account: 'Expenses:Groceries', amount: '300', currency: 'USD' },
          { account: 'Assets:Checking', amount: '', currency: '' },
        ],
      },
      {
        uid: 'uid-2',
        fingerprint: 'fp-2',
        period: 'every 1 month',
        postings: [
          { account: 'Expenses:Groceries', amount: '200', currency: 'USD' },
          { account: 'Assets:Checking', amount: '', currency: '' },
        ],
      },
    ];

    const out = html(
      <BudgetsView report={report as any} lines={lines} baseCurrency="USD" />
    );

    const deleteButtonCount = (
      out.match(/aria-label="Delete budget line uid-/g) ?? []
    ).length;
    expect(deleteButtonCount).toBe(2);
    expect(out).toContain('Delete budget line uid-1');
    expect(out).toContain('Delete budget line uid-2');
  });
});
