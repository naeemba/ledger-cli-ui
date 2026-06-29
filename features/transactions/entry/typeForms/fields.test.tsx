import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { Field, SectionLabel, AccountField, optionsForRoles } from './fields';

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

  it('optionsForRoles filters accounts by a single role', () => {
    expect(
      optionsForRoles(['Expenses:Food', 'Assets:Checking'], 'expense')
    ).toEqual(['Expenses:Food']);
  });

  it('optionsForRoles unions across an array of roles and dedupes', () => {
    expect(
      optionsForRoles(
        ['Assets:Checking', 'Liabilities:Card', 'Expenses:Food'],
        ['asset', 'liability']
      )
    ).toEqual(['Assets:Checking', 'Liabilities:Card']);
  });

  it('AccountField renders its label', () => {
    const out = html(
      <AccountField
        label="Spent on"
        role="expense"
        accounts={['Expenses:Food']}
        value=""
        onChange={() => {}}
      />
    );
    expect(out).toContain('Spent on');
  });
});
