import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { Field, SectionLabel, AccountField } from './fields';

const html = (node: React.ReactNode) => renderToStaticMarkup(node);

describe('fields primitives', () => {
  it('Field renders label and error', () => {
    const out = html(
      <Field label="Paid from" error="Required">
        <input />
      </Field>
    );
    expect(out).toContain('Paid from');
    expect(out).toContain('Required');
  });

  it('SectionLabel renders its text', () => {
    expect(html(<SectionLabel>Details</SectionLabel>)).toContain('Details');
  });

  it('AccountField shows only accounts matching the role(s)', () => {
    const out = html(
      <AccountField
        label="Spent on"
        role="expense"
        accounts={['Expenses:Food', 'Assets:Checking']}
        value=""
        onChange={() => {}}
      />
    );
    // Combobox renders its options in the DOM; the asset account must be absent.
    expect(out).toContain('Expenses:Food');
    expect(out).not.toContain('Assets:Checking');
  });

  it('AccountField accepts an array of roles', () => {
    const out = html(
      <AccountField
        label="From"
        role={['asset', 'liability']}
        accounts={['Assets:Checking', 'Liabilities:Card', 'Expenses:Food']}
        value=""
        onChange={() => {}}
      />
    );
    expect(out).toContain('Assets:Checking');
    expect(out).toContain('Liabilities:Card');
    expect(out).not.toContain('Expenses:Food');
  });
});
