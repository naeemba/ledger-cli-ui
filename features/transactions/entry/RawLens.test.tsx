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

  it('seeds the textarea with the formatted ledger text', () => {
    const out = html(<RawLens draft={draft} dispatch={() => {}} />);
    expect(out).toContain('<textarea');
    expect(out).toContain('Whole Foods');
    expect(out).toContain('Expenses:Groceries');
    expect(out).toContain('Assets:Checking');
  });

  it('renders no error on the initial (seeded) render', () => {
    const out = html(<RawLens draft={draft} dispatch={() => {}} />);
    expect(out.toLowerCase()).not.toContain('could not parse');
  });
});
