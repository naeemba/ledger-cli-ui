// features/transactions/entry/typeForms/TransferForm.test.tsx
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { initDraft } from '../draftReducer';
import { TransferForm } from './TransferForm';

const html = (node: React.ReactNode) => renderToStaticMarkup(node);

describe('TransferForm', () => {
  it('renders from/to fields for a fresh draft', () => {
    const out = html(
      <TransferForm
        draft={initDraft({ date: '2026-06-29' }, 'USD')}
        dispatch={() => {}}
        accounts={[]}
        payees={[]}
        defaultCurrency="USD"
      />
    );
    expect(out).toContain('From');
    expect(out).toContain('To');
  });
});
