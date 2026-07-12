import { describe, it, expect } from 'vitest';
import { QUICK_ENTRY_SPECS, type QuickEntryContext } from './quickEntrySpecs';

const ctx: QuickEntryContext = {
  accounts: [
    'Assets:Checking',
    'Assets:Savings',
    'Liabilities:Card',
    'Expenses:Groceries',
    'Income:Salary',
  ],
  defaultCurrency: 'USD',
};

const specOf = (kind: string) => {
  const spec = QUICK_ENTRY_SPECS.find((s) => s.kind === kind);
  if (!spec) throw new Error(`no spec ${kind}`);
  return spec;
};

describe('quick-entry specs seed with a blank description', () => {
  it.each(QUICK_ENTRY_SPECS.map((s) => s.kind))('%s', (kind) => {
    expect(specOf(kind).makeEmpty(ctx).payee).toBe('');
  });
});

describe('validate rejects empty fields with the expected message', () => {
  const cases: Array<[string, string]> = [
    ['expense', 'Enter an amount.'],
    ['income', 'Enter an amount.'],
    ['transfer', 'Enter an amount.'],
    ['exchange', 'Enter the amount you gave.'],
    // makeEmpty seeds an account, so the first missing field is the balance.
    ['fix-balance', 'Enter the correct balance.'],
  ];
  it.each(cases)('%s', (kind, message) => {
    const spec = specOf(kind);
    // makeEmpty seeds one account but no amounts, so the empty entry is invalid.
    expect(spec.validate(spec.makeEmpty(ctx))).toBe(message);
  });
});

describe('validate passes a fully filled entry', () => {
  const filled: Record<string, Record<string, string>> = {
    'expense': {
      amount: '10',
      spentOn: 'Expenses:Groceries',
      paidFrom: 'Assets:Checking',
    },
    'income': {
      amount: '10',
      receivedInto: 'Assets:Checking',
      from: 'Income:Salary',
    },
    'transfer': { amount: '10', from: 'Assets:Checking', to: 'Assets:Savings' },
    'exchange': {
      gaveAmount: '10',
      gaveFrom: 'Assets:Checking',
      gotAmount: '9',
      gotCurrency: 'EUR',
      gotInto: 'Assets:Savings',
    },
    'fix-balance': { account: 'Assets:Checking', targetAmount: '100' },
  };
  it.each(Object.keys(filled))('%s', (kind) => {
    const spec = specOf(kind);
    expect(
      spec.validate({ ...spec.makeEmpty(ctx), ...filled[kind] })
    ).toBeNull();
  });
});

describe('same-account guards', () => {
  it('transfer rejects from === to', () => {
    const spec = specOf('transfer');
    const fields = {
      ...spec.makeEmpty(ctx),
      amount: '10',
      from: 'Assets:Checking',
      to: 'Assets:Checking',
    };
    expect(spec.validate(fields)).toBe('Source and destination must differ.');
  });

  it('exchange rejects gaveFrom === gotInto', () => {
    const spec = specOf('exchange');
    const fields = {
      ...spec.makeEmpty(ctx),
      gaveAmount: '10',
      gaveFrom: 'Assets:Checking',
      gotAmount: '9',
      gotCurrency: 'EUR',
      gotInto: 'Assets:Checking',
    };
    expect(spec.validate(fields)).toBe(
      'Paid-from and received-into accounts must differ.'
    );
  });
});

describe('resolvePayee falls back to a sensible leaf/label', () => {
  const cases: Array<[string, Record<string, string>, string]> = [
    ['expense', { spentOn: 'Expenses:Groceries' }, 'Groceries'],
    ['income', { from: 'Income:Salary' }, 'Salary'],
    ['transfer', {}, 'Transfer'],
    ['exchange', {}, 'Currency exchange'],
    ['fix-balance', {}, 'Balance adjustment'],
  ];
  it.each(cases)('%s', (kind, fields, expected) => {
    const spec = specOf(kind);
    expect(spec.resolvePayee?.({ ...spec.makeEmpty(ctx), ...fields })).toBe(
      expected
    );
  });
});
