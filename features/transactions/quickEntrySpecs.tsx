'use client';

import React from 'react';
import AmountInput from './AmountInput';
import type { DraftState } from './entry/draftReducer';
import { ExtraItemsField } from './entry/typeForms/ExtraItemsField';
import {
  AccountField,
  CurrencyCombobox,
  Field,
  optionsForRoles,
} from './entry/typeForms/fields';
import type {
  HeaderFields,
  TransactionTypeAdapter,
  TypeContext,
} from './entry/types/adapter';
import { exchangeAdapter, type ExchangeFields } from './entry/types/exchange';
import { expenseAdapter, type ExpenseFields } from './entry/types/expense';
import {
  fixBalanceAdapter,
  type FixBalanceFields,
} from './entry/types/fixBalance';
import { incomeAdapter, type IncomeFields } from './entry/types/income';
import { transferAdapter, type TransferFields } from './entry/types/transfer';
import Combobox from '@/components/Combobox';
import { Button } from '@/components/ui/button';

export type QuickEntryContext = { accounts: string[]; defaultCurrency: string };

type FieldsProps<F> = {
  fields: F;
  update: (patch: Partial<F>) => void;
} & QuickEntryContext;

/**
 * A single quick-entry form: how to seed it, validate it, name it, render its
 * handful of inputs, and compile it to a ledger draft. `compile` delegates to a
 * shared type adapter, so this file never does accounting math — it only builds
 * the simple fields and hands them off.
 */
export type QuickEntrySpec<F extends HeaderFields> = {
  kind: string;
  label: string;
  icon: string;
  compile: (fields: F, ctx: TypeContext) => DraftState;
  makeEmpty: (ctx: QuickEntryContext) => F;
  validate: (fields: F) => string | null;
  // Fallback payee when the user leaves it blank (the journal requires one).
  resolvePayee?: (fields: F) => string;
  Fields: (props: FieldsProps<F>) => React.JSX.Element;
};

const todayLocal = () => new Date().toLocaleDateString('en-CA');
const leafOf = (account: string) => account.split(':').pop()?.trim() ?? '';
const firstMoneyAccount = (accounts: string[]) =>
  optionsForRoles(accounts, ['asset', 'liability'])[0] ?? '';
const isPositive = (s: string) => Number(s) > 0;
const isNumber = (s: string) => s.trim() !== '' && !Number.isNaN(Number(s));

// Every quick entry starts with a blank description so the "(optional)" field
// is consistently empty across types; when left blank, save() derives the payee
// from resolvePayee/label. Adapters otherwise seed a non-empty default payee.
const seed = <F extends HeaderFields>(
  adapter: TransactionTypeAdapter<F>,
  ctx: TypeContext
): F => ({ ...adapter.emptyFields(ctx), payee: '', date: todayLocal() });

const AmountRow = ({
  label,
  amount,
  currency,
  onAmount,
  onCurrency,
}: {
  label: string;
  amount: string;
  currency: string;
  onAmount: (v: string) => void;
  onCurrency: (v: string) => void;
}) => (
  <Field label={label}>
    <div className="flex gap-2">
      <AmountInput
        value={amount}
        onChange={onAmount}
        placeholder="0.00"
        className="flex-1 text-right tabular-nums"
      />
      <CurrencyCombobox
        value={currency}
        onChange={onCurrency}
        className="w-24"
      />
    </div>
  </Field>
);

const expenseSpec: QuickEntrySpec<ExpenseFields> = {
  kind: 'expense',
  label: 'Expense',
  icon: '🛒',
  compile: expenseAdapter.compile,
  makeEmpty: (ctx) => ({
    ...seed(expenseAdapter, ctx),
    paidFrom: firstMoneyAccount(ctx.accounts),
  }),
  validate: (f) =>
    !isPositive(f.amount)
      ? 'Enter an amount.'
      : !f.spentOn.trim()
        ? 'Pick a category.'
        : !f.paidFrom.trim()
          ? 'Pick where it was paid from.'
          : null,
  resolvePayee: (f) => leafOf(f.spentOn),
  Fields: ({ fields, update, accounts }) => (
    <>
      <AmountRow
        label="Amount"
        amount={fields.amount}
        currency={fields.currency}
        onAmount={(amount) => update({ amount })}
        onCurrency={(currency) => update({ currency })}
      />
      <AccountField
        label="Category"
        role="expense"
        accounts={accounts}
        value={fields.spentOn}
        onChange={(spentOn) => update({ spentOn })}
      />
      <ExtraItemsField
        sectionLabel="Split into another category"
        addLabel="another category"
        items={fields.extraItems}
        accounts={accounts}
        defaultCurrency={fields.currency}
        baseCount={2}
        onChange={(extraItems) => update({ extraItems })}
      />
      <AccountField
        label="Paid from"
        role={['asset', 'liability']}
        accounts={accounts}
        value={fields.paidFrom}
        onChange={(paidFrom) => update({ paidFrom })}
      />
    </>
  ),
};

const incomeSpec: QuickEntrySpec<IncomeFields> = {
  kind: 'income',
  label: 'Income',
  icon: '💰',
  compile: incomeAdapter.compile,
  makeEmpty: (ctx) => ({
    ...seed(incomeAdapter, ctx),
    receivedInto: firstMoneyAccount(ctx.accounts),
  }),
  validate: (f) =>
    !isPositive(f.amount)
      ? 'Enter an amount.'
      : !f.receivedInto.trim()
        ? 'Pick where it was received.'
        : !f.from.trim()
          ? 'Pick an income source.'
          : null,
  resolvePayee: (f) => leafOf(f.from),
  Fields: ({ fields, update, accounts }) => (
    <>
      <AmountRow
        label="Amount"
        amount={fields.amount}
        currency={fields.currency}
        onAmount={(amount) => update({ amount })}
        onCurrency={(currency) => update({ currency })}
      />
      <AccountField
        label="Received into"
        role={['asset', 'liability']}
        accounts={accounts}
        value={fields.receivedInto}
        onChange={(receivedInto) => update({ receivedInto })}
      />
      <AccountField
        label="Source"
        role="income"
        accounts={accounts}
        value={fields.from}
        onChange={(from) => update({ from })}
      />
      <ExtraItemsField
        sectionLabel="Deductions"
        addLabel="a deduction"
        items={fields.extraItems}
        accounts={accounts}
        defaultCurrency={fields.currency}
        baseCount={2}
        onChange={(extraItems) => update({ extraItems })}
      />
    </>
  ),
};

// A refund is money coming back into an account and crediting a category back
// down (a returned purchase). That is exactly an income entry whose "source" is
// an expense account rather than an income one, so it compiles through
// incomeAdapter unchanged — money into `receivedInto`, the same amount negated
// on the expense category. No new adapter, no negative-amount input to fat-finger.
const refundSpec: QuickEntrySpec<IncomeFields> = {
  kind: 'refund',
  label: 'Refund',
  icon: '↩️',
  compile: incomeAdapter.compile,
  makeEmpty: (ctx) => ({
    ...seed(incomeAdapter, ctx),
    receivedInto: firstMoneyAccount(ctx.accounts),
  }),
  validate: (f) =>
    !isPositive(f.amount)
      ? 'Enter an amount.'
      : !f.receivedInto.trim()
        ? 'Pick where the money went back.'
        : !f.from.trim()
          ? 'Pick the category being refunded.'
          : null,
  resolvePayee: (f) => `Refund: ${leafOf(f.from)}`,
  Fields: ({ fields, update, accounts }) => (
    <>
      <AmountRow
        label="Amount"
        amount={fields.amount}
        currency={fields.currency}
        onAmount={(amount) => update({ amount })}
        onCurrency={(currency) => update({ currency })}
      />
      <AccountField
        label="Refunded to"
        role={['asset', 'liability']}
        accounts={accounts}
        value={fields.receivedInto}
        onChange={(receivedInto) => update({ receivedInto })}
      />
      <AccountField
        label="Category"
        role="expense"
        accounts={accounts}
        value={fields.from}
        onChange={(from) => update({ from })}
      />
    </>
  ),
};

const transferSpec: QuickEntrySpec<TransferFields> = {
  kind: 'transfer',
  label: 'Transfer',
  icon: '🔁',
  compile: transferAdapter.compile,
  makeEmpty: (ctx) => ({
    ...seed(transferAdapter, ctx),
    from: firstMoneyAccount(ctx.accounts),
  }),
  validate: (f) =>
    !isPositive(f.amount)
      ? 'Enter an amount.'
      : !f.from.trim()
        ? 'Pick the source account.'
        : !f.to.trim()
          ? 'Pick the destination account.'
          : f.from === f.to
            ? 'Source and destination must differ.'
            : null,
  resolvePayee: () => 'Transfer',
  Fields: ({ fields, update, accounts }) => (
    <>
      <AmountRow
        label="Amount"
        amount={fields.amount}
        currency={fields.currency}
        onAmount={(amount) => update({ amount })}
        onCurrency={(currency) => update({ currency })}
      />
      <AccountField
        label="From"
        role={['asset', 'liability']}
        accounts={accounts}
        value={fields.from}
        onChange={(from) => update({ from })}
      />
      <AccountField
        label="To"
        role={['asset', 'liability']}
        accounts={accounts}
        value={fields.to}
        onChange={(to) => update({ to })}
      />
    </>
  ),
};

const exchangeSpec: QuickEntrySpec<ExchangeFields> = {
  kind: 'exchange',
  label: 'Exchange',
  icon: '💱',
  compile: exchangeAdapter.compile,
  // Seed only the paid-from side; leave received-into blank so the two account
  // pickers don't default to the same account (validate then guards equality).
  makeEmpty: (ctx) => ({
    ...seed(exchangeAdapter, ctx),
    gaveFrom: firstMoneyAccount(ctx.accounts),
  }),
  validate: (f) =>
    !isPositive(f.gaveAmount)
      ? 'Enter the amount you gave.'
      : !f.gaveFrom.trim()
        ? 'Pick the account you paid from.'
        : !isPositive(f.gotAmount)
          ? 'Enter the amount you received.'
          : !f.gotCurrency.trim()
            ? 'Pick the currency you received.'
            : !f.gotInto.trim()
              ? 'Pick the account you received into.'
              : f.gaveFrom === f.gotInto
                ? 'Paid-from and received-into accounts must differ.'
                : null,
  resolvePayee: () => 'Currency exchange',
  Fields: ({ fields, update, accounts }) => (
    <>
      <AmountRow
        label="Gave"
        amount={fields.gaveAmount}
        currency={fields.gaveCurrency}
        onAmount={(gaveAmount) => update({ gaveAmount })}
        onCurrency={(gaveCurrency) => update({ gaveCurrency })}
      />
      <AccountField
        label="Paid from"
        role={['asset', 'liability']}
        accounts={accounts}
        value={fields.gaveFrom}
        onChange={(gaveFrom) => update({ gaveFrom })}
      />
      <AmountRow
        label="Got"
        amount={fields.gotAmount}
        currency={fields.gotCurrency}
        onAmount={(gotAmount) => update({ gotAmount })}
        onCurrency={(gotCurrency) => update({ gotCurrency })}
      />
      <AccountField
        label="Received into"
        role={['asset', 'liability']}
        accounts={accounts}
        value={fields.gotInto}
        onChange={(gotInto) => update({ gotInto })}
      />
    </>
  ),
};

const fixBalanceSpec: QuickEntrySpec<FixBalanceFields> = {
  kind: 'fix-balance',
  label: 'Fix balance',
  icon: '⚖️',
  compile: fixBalanceAdapter.compile,
  makeEmpty: (ctx) => ({
    ...seed(fixBalanceAdapter, ctx),
    account: firstMoneyAccount(ctx.accounts),
  }),
  validate: (f) =>
    !f.account.trim()
      ? 'Pick an account.'
      : !isNumber(f.targetAmount)
        ? 'Enter the correct balance.'
        : null,
  resolvePayee: () => 'Balance adjustment',
  Fields: ({ fields, update, accounts }) => (
    <>
      <AccountField
        label="Account"
        role={['asset', 'liability']}
        accounts={accounts}
        value={fields.account}
        onChange={(account) => update({ account })}
      />
      <AmountRow
        label="Correct balance"
        amount={fields.targetAmount}
        currency={fields.targetCurrency}
        onAmount={(targetAmount) => update({ targetAmount })}
        onCurrency={(targetCurrency) => update({ targetCurrency })}
      />
    </>
  ),
};

// --- Debt (money owed) -----------------------------------------------------
// Not a registry adapter: a debt is mechanically a transfer, so it compiles via
// transferAdapter. The value it adds is translation — the user names a person
// and the form builds the right account (Assets:Receivable:<Name> for money
// owed to them, Liabilities:Payable:<Name> for money they owe), so a per-person
// balance is a single ledger query over `/:<Name>$/`.
const RECEIVABLE_ROOT = 'Assets:Receivable';
const PAYABLE_ROOT = 'Liabilities:Payable';

type DebtDirection = 'owed-to-you' | 'you-owe';

type DebtFields = HeaderFields & {
  direction: DebtDirection;
  person: string;
  amount: string;
  currency: string;
  cashAccount: string;
};

// A person name becomes a single account segment: colons would fake a
// sub-hierarchy and doubled spaces are rejected by the account schema.
const cleanPerson = (raw: string) =>
  raw.replace(/:/g, ' ').replace(/\s+/g, ' ').trim();

// Existing people, parsed from the receivable/payable account leaves, so the
// same person reuses the same account instead of spawning a near-duplicate.
const knownPeople = (accounts: string[]): string[] => {
  const people = new Set<string>();
  for (const account of accounts) {
    const match = account.match(
      /^(?:Assets:Receivable|Liabilities:Payable):([^:]+)$/
    );
    if (match) people.add(match[1]);
  }
  return [...people];
};

// Resolve the person account and its opposite (cash) side for a direction, so
// validate and compile agree on which two accounts a debt touches.
const debtAccounts = (
  person: string,
  f: DebtFields
): [to: string, from: string] =>
  f.direction === 'owed-to-you'
    ? [`${RECEIVABLE_ROOT}:${person}`, f.cashAccount]
    : [f.cashAccount, `${PAYABLE_ROOT}:${person}`];

const debtSpec: QuickEntrySpec<DebtFields> = {
  kind: 'debt',
  label: 'Debt',
  icon: '🤝',
  makeEmpty: (ctx) => ({
    date: todayLocal(),
    payee: '',
    status: 'none',
    note: '',
    direction: 'owed-to-you',
    person: '',
    amount: '',
    currency: ctx.defaultCurrency,
    cashAccount: firstMoneyAccount(ctx.accounts),
  }),
  validate: (f) => {
    const person = cleanPerson(f.person);
    if (!person) return 'Enter a name.';
    if (!isPositive(f.amount)) return 'Enter an amount.';
    if (!f.cashAccount.trim()) return 'Pick an account.';
    const [to, from] = debtAccounts(person, f);
    // The cash picker offers receivable/payable accounts too, so a user can
    // pick the same person's account as cash — that nets to zero on one account.
    if (from === to) return 'The cash account must differ from the person.';
    return null;
  },
  resolvePayee: (f) =>
    f.direction === 'owed-to-you'
      ? `Lent to ${cleanPerson(f.person)}`
      : `Borrowed from ${cleanPerson(f.person)}`,
  compile: (f, ctx) => {
    const person = cleanPerson(f.person);
    // `to` gets +amount, `from` gets −amount (transferAdapter convention).
    // Owed to you: their receivable rises, your cash falls.
    // You owe them: your cash rises, your payable falls (a liability you owe).
    const [to, from] = debtAccounts(person, f);
    const transferFields: TransferFields = {
      date: f.date,
      payee: f.payee,
      status: f.status,
      note: f.note,
      uid: f.uid,
      amount: f.amount,
      currency: f.currency,
      from,
      to,
      extraItems: [],
    };
    return transferAdapter.compile(transferFields, ctx);
  },
  Fields: ({ fields, update, accounts, defaultCurrency }) => {
    const owedToYou = fields.direction === 'owed-to-you';
    return (
      <>
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant={owedToYou ? 'default' : 'outline'}
            onClick={() => update({ direction: 'owed-to-you' })}
          >
            They owe you
          </Button>
          <Button
            type="button"
            variant={owedToYou ? 'outline' : 'default'}
            onClick={() => update({ direction: 'you-owe' })}
          >
            You owe them
          </Button>
        </div>

        <Field label="Name">
          <Combobox
            value={fields.person}
            onChange={(person) => update({ person })}
            options={knownPeople(accounts)}
            placeholder="e.g. Alex"
          />
        </Field>

        <AmountRow
          label="Amount"
          amount={fields.amount}
          currency={fields.currency || defaultCurrency}
          onAmount={(amount) => update({ amount })}
          onCurrency={(currency) => update({ currency })}
        />

        <AccountField
          label={owedToYou ? 'Paid from' : 'Received into'}
          role={['asset', 'liability']}
          accounts={accounts}
          value={fields.cashAccount}
          onChange={(cashAccount) => update({ cashAccount })}
        />
      </>
    );
  },
};

// --- Settle up (pay down a debt) -------------------------------------------
// The follow-up the debt account model was designed for: reduce an existing
// Assets:Receivable:<Name> / Liabilities:Payable:<Name> balance. Settling moves
// money the opposite way to creating the debt, so the two accounts are exactly
// debtAccounts' pair swapped — still a transfer, still ledger's math. We do not
// look up the outstanding balance in JS (that's a ledger query); over- or
// under-settling is the user's call and ledger records whatever remains.
type SettleDirection = 'they-paid-you' | 'you-paid-them';

type SettleFields = HeaderFields & {
  direction: SettleDirection;
  person: string;
  amount: string;
  currency: string;
  cashAccount: string;
};

const settleAccounts = (
  person: string,
  f: SettleFields
): [to: string, from: string] =>
  f.direction === 'they-paid-you'
    ? [f.cashAccount, `${RECEIVABLE_ROOT}:${person}`]
    : [`${PAYABLE_ROOT}:${person}`, f.cashAccount];

const settleSpec: QuickEntrySpec<SettleFields> = {
  kind: 'settle',
  label: 'Settle up',
  icon: '✅',
  makeEmpty: (ctx) => ({
    date: todayLocal(),
    payee: '',
    status: 'none',
    note: '',
    direction: 'they-paid-you',
    person: '',
    amount: '',
    currency: ctx.defaultCurrency,
    cashAccount: firstMoneyAccount(ctx.accounts),
  }),
  validate: (f) => {
    const person = cleanPerson(f.person);
    if (!person) return 'Enter a name.';
    if (!isPositive(f.amount)) return 'Enter an amount.';
    if (!f.cashAccount.trim()) return 'Pick an account.';
    const [to, from] = settleAccounts(person, f);
    if (from === to) return 'The cash account must differ from the person.';
    return null;
  },
  resolvePayee: (f) =>
    f.direction === 'they-paid-you'
      ? `${cleanPerson(f.person)} paid you back`
      : `Paid ${cleanPerson(f.person)} back`,
  compile: (f, ctx) => {
    const person = cleanPerson(f.person);
    // Swap of debtAccounts: `to` gets +amount, `from` gets −amount.
    // They paid you back: your cash rises, their receivable falls toward zero.
    // You paid them back: your payable rises toward zero, your cash falls.
    const [to, from] = settleAccounts(person, f);
    const transferFields: TransferFields = {
      date: f.date,
      payee: f.payee,
      status: f.status,
      note: f.note,
      uid: f.uid,
      amount: f.amount,
      currency: f.currency,
      from,
      to,
      extraItems: [],
    };
    return transferAdapter.compile(transferFields, ctx);
  },
  Fields: ({ fields, update, accounts, defaultCurrency }) => {
    const theyPaid = fields.direction === 'they-paid-you';
    return (
      <>
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant={theyPaid ? 'default' : 'outline'}
            onClick={() => update({ direction: 'they-paid-you' })}
          >
            They paid you back
          </Button>
          <Button
            type="button"
            variant={theyPaid ? 'outline' : 'default'}
            onClick={() => update({ direction: 'you-paid-them' })}
          >
            You paid them back
          </Button>
        </div>

        <Field label="Name">
          <Combobox
            value={fields.person}
            onChange={(person) => update({ person })}
            options={knownPeople(accounts)}
            placeholder="e.g. Alex"
          />
        </Field>

        <AmountRow
          label="Amount"
          amount={fields.amount}
          currency={fields.currency || defaultCurrency}
          onAmount={(amount) => update({ amount })}
          onCurrency={(currency) => update({ currency })}
        />

        <AccountField
          label={theyPaid ? 'Received into' : 'Paid from'}
          role={['asset', 'liability']}
          accounts={accounts}
          value={fields.cashAccount}
          onChange={(cashAccount) => update({ cashAccount })}
        />
      </>
    );
  },
};

// Order shown in the dropdown; expense is the primary split-button action.
// Erased to a uniform field type at the boundary (like registry.ts does with
// its adapters) so the engine can treat every spec identically — each spec is
// still fully type-checked against its own field shape at definition above.
export const QUICK_ENTRY_SPECS = [
  expenseSpec,
  incomeSpec,
  refundSpec,
  transferSpec,
  exchangeSpec,
  debtSpec,
  settleSpec,
  fixBalanceSpec,
] as unknown as readonly QuickEntrySpec<HeaderFields>[];
