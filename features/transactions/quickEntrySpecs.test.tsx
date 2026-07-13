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

describe('refund puts money back into an account and credits a category', () => {
  const spec = specOf('refund');

  it('compiles to money-in on the account and the category negated', () => {
    const fields = {
      ...spec.makeEmpty(ctx),
      amount: '20',
      receivedInto: 'Assets:Checking',
      from: 'Expenses:Groceries',
    };
    expect(spec.compile(fields, ctx).toWire('create').postings).toEqual([
      { account: 'Assets:Checking', amount: '20', currency: 'USD' },
      { account: 'Expenses:Groceries', amount: '-20', currency: 'USD' },
    ]);
  });

  it('names the payee after the refunded category', () => {
    const fields = { ...spec.makeEmpty(ctx), from: 'Expenses:Groceries' };
    expect(spec.resolvePayee?.(fields)).toBe('Refund: Groceries');
  });

  it('rejects a missing category', () => {
    const fields = {
      ...spec.makeEmpty(ctx),
      amount: '20',
      receivedInto: 'Assets:Checking',
    };
    expect(spec.validate(fields)).toBe('Pick the category being refunded.');
  });
});

describe('splits surface extra category lines to the adapter', () => {
  it('expense: each split is its own posting, paid-from balances the rest', () => {
    const spec = specOf('expense');
    const fields = {
      ...spec.makeEmpty(ctx),
      amount: '30',
      spentOn: 'Expenses:Groceries',
      paidFrom: 'Assets:Checking',
      extraItems: [
        { account: 'Expenses:Household', amount: '20', currency: 'USD' },
      ],
    };
    const draft = spec.compile(fields, ctx);
    expect(draft.toWire('create').postings).toEqual([
      { account: 'Expenses:Groceries', amount: '30', currency: 'USD' },
      { account: 'Expenses:Household', amount: '20', currency: 'USD' },
      // Amount-less: ledger fills the −50 residual, never JS.
      { account: 'Assets:Checking', amount: '', currency: '' },
    ]);
  });

  it('income: deductions post alongside the source, received-into balances', () => {
    const spec = specOf('income');
    const fields = {
      ...spec.makeEmpty(ctx),
      amount: '1000',
      receivedInto: 'Assets:Checking',
      from: 'Income:Salary',
      extraItems: [{ account: 'Expenses:Tax', amount: '200', currency: 'USD' }],
    };
    const draft = spec.compile(fields, ctx);
    expect(draft.toWire('create').postings).toEqual([
      { account: 'Assets:Checking', amount: '', currency: '' },
      { account: 'Income:Salary', amount: '-1000', currency: 'USD' },
      { account: 'Expenses:Tax', amount: '200', currency: 'USD' },
    ]);
  });

  it('drops half-filled split rows (an account or amount alone is not a posting)', () => {
    const spec = specOf('expense');
    const fields = {
      ...spec.makeEmpty(ctx),
      amount: '30',
      spentOn: 'Expenses:Groceries',
      paidFrom: 'Assets:Checking',
      extraItems: [
        { account: 'Expenses:Household', amount: '', currency: 'USD' },
      ],
    };
    const draft = spec.compile(fields, ctx);
    // No real extra → plain two-posting expense with an explicit −30.
    expect(draft.toWire('create').postings).toEqual([
      { account: 'Expenses:Groceries', amount: '30', currency: 'USD' },
      { account: 'Assets:Checking', amount: '-30', currency: 'USD' },
    ]);
  });
});

describe('debt spec compiles to the right accounts', () => {
  const debt = specOf('debt');
  const fields = (patch: Record<string, string>) => ({
    ...debt.makeEmpty(ctx),
    person: 'Alex',
    amount: '50',
    cashAccount: 'Assets:Checking',
    ...patch,
  });
  const postingsOf = (patch: Record<string, string>) =>
    debt.compile(fields(patch), ctx).toWire('create').postings;

  it('owed to you: their receivable rises, your cash falls', () => {
    expect(postingsOf({ direction: 'owed-to-you' })).toEqual([
      { account: 'Assets:Receivable:Alex', amount: '50', currency: 'USD' },
      { account: 'Assets:Checking', amount: '-50', currency: 'USD' },
    ]);
  });

  it('you owe them: your cash rises, your payable falls', () => {
    expect(postingsOf({ direction: 'you-owe' })).toEqual([
      { account: 'Assets:Checking', amount: '50', currency: 'USD' },
      { account: 'Liabilities:Payable:Alex', amount: '-50', currency: 'USD' },
    ]);
  });

  it('sanitizes a name into a single account segment', () => {
    expect(postingsOf({ person: 'Bob:  Smith' })[0].account).toBe(
      'Assets:Receivable:Bob Smith'
    );
  });

  it('validate rejects a missing name', () => {
    expect(debt.validate(fields({ person: '  ' }))).toBe('Enter a name.');
  });

  it('validate rejects the cash account resolving to the person account', () => {
    expect(
      debt.validate(
        fields({
          direction: 'owed-to-you',
          person: 'Alex',
          cashAccount: 'Assets:Receivable:Alex',
        })
      )
    ).toBe('The cash account must differ from the person.');
  });
});

describe('settle-up reverses a debt back toward zero', () => {
  const settle = specOf('settle');
  const fields = (patch: Record<string, string>) => ({
    ...settle.makeEmpty(ctx),
    person: 'Alex',
    amount: '50',
    cashAccount: 'Assets:Checking',
    ...patch,
  });
  const postingsOf = (patch: Record<string, string>) =>
    settle.compile(fields(patch), ctx).toWire('create').postings;

  it('they paid you back: your cash rises, their receivable falls', () => {
    expect(postingsOf({ direction: 'they-paid-you' })).toEqual([
      { account: 'Assets:Checking', amount: '50', currency: 'USD' },
      { account: 'Assets:Receivable:Alex', amount: '-50', currency: 'USD' },
    ]);
  });

  it('you paid them back: your payable rises toward zero, your cash falls', () => {
    expect(postingsOf({ direction: 'you-paid-them' })).toEqual([
      { account: 'Liabilities:Payable:Alex', amount: '50', currency: 'USD' },
      { account: 'Assets:Checking', amount: '-50', currency: 'USD' },
    ]);
  });

  it('names the payee for each direction', () => {
    expect(settle.resolvePayee?.(fields({ direction: 'they-paid-you' }))).toBe(
      'Alex paid you back'
    );
    expect(settle.resolvePayee?.(fields({ direction: 'you-paid-them' }))).toBe(
      'Paid Alex back'
    );
  });

  it('rejects the cash account resolving to the person account', () => {
    expect(
      settle.validate(
        fields({
          direction: 'they-paid-you',
          person: 'Alex',
          cashAccount: 'Assets:Receivable:Alex',
        })
      )
    ).toBe('The cash account must differ from the person.');
  });
});
