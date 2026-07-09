import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { ExtraItemsField } from './ExtraItemsField';

const html = (node: React.ReactNode) => renderToStaticMarkup(node);

describe('ExtraItemsField', () => {
  it('renders one row per item with its account and amount', () => {
    const out = html(
      <ExtraItemsField
        items={[
          { account: 'Expenses:Tips', amount: '20', currency: 'USD' },
          { account: 'Expenses:Fees', amount: '2', currency: 'EUR' },
        ]}
        accounts={['Expenses:Tips', 'Expenses:Fees']}
        defaultCurrency="USD"
        baseCount={2}
        onChange={() => {}}
      />
    );
    expect(out).toContain('Extra items');
    expect(out).toContain('Expenses:Tips');
    expect(out).toContain('20');
    expect(out).toContain('Expenses:Fees');
  });

  it('renders only the add button when empty', () => {
    const out = html(
      <ExtraItemsField
        items={[]}
        accounts={[]}
        defaultCurrency="USD"
        baseCount={2}
        onChange={() => {}}
      />
    );
    expect(out).toContain('Add item');
  });

  it('disables adding when the posting cap is reached', () => {
    const items = Array.from({ length: 48 }, () => ({
      account: 'Expenses:Fees',
      amount: '1',
      currency: 'USD',
    }));
    const out = html(
      <ExtraItemsField
        items={items}
        accounts={['Expenses:Fees']}
        defaultCurrency="USD"
        baseCount={2}
        onChange={() => {}}
      />
    );
    expect(out).toContain('disabled');
    expect(out).toContain('limit');
  });
});
