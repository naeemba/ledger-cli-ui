import { describe, it, expect } from 'vitest';
import { optionsForRoles } from './entry/typeForms/fields';
import type { QuickEntryContext } from './quickEntryKit';
import {
  OWED_TO_YOU_ROLES,
  YOU_OWE_ROLES,
  debtSpec,
  settleSpec,
} from './quickEntryPeopleSpecs';

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

describe('the debt picker offers whatever the debt came from', () => {
  it('owed to you reaches income and expense as well as cash', () => {
    const options = optionsForRoles(ctx.accounts, OWED_TO_YOU_ROLES);
    expect(options).toContain('Assets:Checking');
    expect(options).toContain('Liabilities:Card');
    expect(options).toContain('Income:Salary');
    expect(options).toContain('Expenses:Groceries');
  });

  it('you owe them reaches expense but not income', () => {
    const options = optionsForRoles(ctx.accounts, YOU_OWE_ROLES);
    expect(options).toContain('Assets:Checking');
    expect(options).toContain('Expenses:Groceries');
    expect(options).not.toContain('Income:Salary');
  });

  it('settling up stays on cash accounts', () => {
    const options = optionsForRoles(ctx.accounts, ['asset', 'liability']);
    expect(options).not.toContain('Income:Salary');
    expect(options).not.toContain('Expenses:Groceries');
  });
});

describe('debt spec compiles to the right accounts', () => {
  const fields = (patch: Partial<ReturnType<typeof debtSpec.makeEmpty>>) => ({
    ...debtSpec.makeEmpty(ctx),
    person: 'Alex',
    amount: '50',
    otherAccount: 'Assets:Checking',
    ...patch,
  });
  const postingsOf = (patch: Partial<ReturnType<typeof debtSpec.makeEmpty>>) =>
    debtSpec.compile(fields(patch), ctx).toWire('create').postings;

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

  it('you owe them for something they bought: the expense carries the debt', () => {
    expect(
      postingsOf({ direction: 'you-owe', otherAccount: 'Expenses:Electronics' })
    ).toEqual([
      { account: 'Expenses:Electronics', amount: '50', currency: 'USD' },
      { account: 'Liabilities:Payable:Alex', amount: '-50', currency: 'USD' },
    ]);
  });

  it('they owe you for something you earned: the income carries the debt', () => {
    expect(
      postingsOf({ direction: 'owed-to-you', otherAccount: 'Income:Rent' })
    ).toEqual([
      { account: 'Assets:Receivable:Alex', amount: '50', currency: 'USD' },
      { account: 'Income:Rent', amount: '-50', currency: 'USD' },
    ]);
  });

  it('they owe you their share of an expense you covered', () => {
    expect(
      postingsOf({
        direction: 'owed-to-you',
        otherAccount: 'Expenses:Utilities',
      })
    ).toEqual([
      { account: 'Assets:Receivable:Alex', amount: '50', currency: 'USD' },
      { account: 'Expenses:Utilities', amount: '-50', currency: 'USD' },
    ]);
  });

  it('sanitizes a name into a single account segment', () => {
    expect(postingsOf({ person: 'Bob:  Smith' })[0].account).toBe(
      'Assets:Receivable:Bob Smith'
    );
  });

  it('validate rejects a missing name', () => {
    expect(debtSpec.validate(fields({ person: '  ' }))).toBe('Enter a name.');
  });

  it('validate rejects the other account resolving to the person account', () => {
    expect(
      debtSpec.validate(
        fields({
          direction: 'owed-to-you',
          person: 'Alex',
          otherAccount: 'Assets:Receivable:Alex',
        })
      )
    ).toBe('The other account must differ from the person.');
  });
});

describe('settle-up reverses a debt back toward zero', () => {
  const fields = (patch: Partial<ReturnType<typeof settleSpec.makeEmpty>>) => ({
    ...settleSpec.makeEmpty(ctx),
    person: 'Alex',
    amount: '50',
    cashAccount: 'Assets:Checking',
    ...patch,
  });
  const postingsOf = (
    patch: Partial<ReturnType<typeof settleSpec.makeEmpty>>
  ) => settleSpec.compile(fields(patch), ctx).toWire('create').postings;

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
    expect(
      settleSpec.resolvePayee?.(fields({ direction: 'they-paid-you' }))
    ).toBe('Alex paid you back');
    expect(
      settleSpec.resolvePayee?.(fields({ direction: 'you-paid-them' }))
    ).toBe('Paid Alex back');
  });

  it('rejects the cash account resolving to the person account', () => {
    expect(
      settleSpec.validate(
        fields({
          direction: 'they-paid-you',
          person: 'Alex',
          cashAccount: 'Assets:Receivable:Alex',
        })
      )
    ).toBe('The cash account must differ from the person.');
  });
});
