// features/transactions/entry/typeForms/FixBalanceForm.test.tsx
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { initDraft } from '../draftReducer';
import { FixBalanceForm } from './FixBalanceForm';

const html = (node: React.ReactNode) => renderToStaticMarkup(node);

describe('FixBalanceForm', () => {
  it('renders account and target fields for a fresh draft', () => {
    const out = html(
      <FixBalanceForm
        draft={initDraft({ date: '2026-06-29' }, 'USD')}
        dispatch={() => {}}
        accounts={['Assets:Cash']}
        payees={[]}
        defaultCurrency="USD"
        getAccountBalance={async () => '0'}
      />
    );
    expect(out).toContain('Account');
    expect(out).toContain('Target');
  });
});
