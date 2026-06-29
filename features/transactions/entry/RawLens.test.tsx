import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { RawLens } from './RawLens';
import { initDraft } from './draftReducer';

const html = (node: React.ReactNode) => renderToStaticMarkup(node);

describe('RawLens', () => {
  const draft = initDraft(
    {
      date: '2026-06-29',
      payee: 'Whole Foods',
      status: 'cleared',
      postings: [
        { account: 'Expenses:Groceries', amount: '42.50', currency: 'USD' },
        { account: 'Assets:Checking', amount: '-42.50', currency: 'USD' },
      ],
    },
    'USD'
  );

  it('renders the ledger editor surface without crashing', () => {
    const out = html(
      <RawLens
        draft={draft}
        dispatch={() => {}}
        accounts={[]}
        payees={[]}
        commodities={[]}
      />
    );
    expect(out).toContain('aria-label="Transaction ledger text"');
    expect(out).toContain('Format');
  });

  it('renders no parse error on the initial render', () => {
    const out = html(
      <RawLens
        draft={draft}
        dispatch={() => {}}
        accounts={[]}
        payees={[]}
        commodities={[]}
      />
    );
    expect(out.toLowerCase()).not.toContain('could not parse');
  });
});
