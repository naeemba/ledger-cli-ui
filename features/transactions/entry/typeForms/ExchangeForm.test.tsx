import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { initDraft } from '../draftReducer';
import { ExchangeForm } from './ExchangeForm';

const html = (node: React.ReactNode) => renderToStaticMarkup(node);

describe('ExchangeForm', () => {
  it('renders gave/got sections for a fresh draft', () => {
    const out = html(
      <ExchangeForm
        draft={initDraft({ date: '2026-06-29' }, 'USD')}
        dispatch={() => {}}
        accounts={[]}
        payees={[]}
        defaultCurrency="USD"
      />
    );
    expect(out).toContain('Gave');
    expect(out).toContain('Got');
  });
});
