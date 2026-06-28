import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { FormLens } from './FormLens';
import { initDraft } from './draftReducer';

const html = (node: React.ReactNode) => renderToStaticMarkup(node);

describe('FormLens', () => {
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

  it('renders the payee value and posting accounts', () => {
    const out = html(
      <FormLens
        draft={draft}
        dispatch={() => {}}
        accounts={['Assets:Checking']}
        payees={['Whole Foods']}
        defaultCurrency="USD"
      />
    );
    expect(out).toContain('Whole Foods');
    expect(out).toContain('Expenses:Groceries');
    expect(out).toContain('Assets:Checking');
  });

  it('renders the date value', () => {
    const out = html(
      <FormLens
        draft={draft}
        dispatch={() => {}}
        accounts={[]}
        payees={[]}
        defaultCurrency="USD"
      />
    );
    expect(out).toContain('2026-06-29');
  });
});
