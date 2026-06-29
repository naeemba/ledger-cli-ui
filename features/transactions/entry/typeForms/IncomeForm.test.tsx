// features/transactions/entry/typeForms/IncomeForm.test.tsx
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { initDraft } from '../draftReducer';
import { IncomeForm } from './IncomeForm';

const html = (node: React.ReactNode) => renderToStaticMarkup(node);

describe('IncomeForm', () => {
  it('renders income fields for a fresh draft', () => {
    const out = html(
      <IncomeForm
        draft={initDraft({ date: '2026-06-29' }, 'USD')}
        dispatch={() => {}}
        accounts={[]}
        payees={[]}
        defaultCurrency="USD"
      />
    );
    expect(out).toContain('Received into');
    expect(out).toContain('Source');
  });
});
