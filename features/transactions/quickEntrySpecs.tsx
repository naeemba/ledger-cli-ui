'use client';

import React from 'react';
import AmountInput from './AmountInput';
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

export type QuickEntryContext = { accounts: string[]; defaultCurrency: string };

type FieldsProps<F> = {
  fields: F;
  update: (patch: Partial<F>) => void;
} & QuickEntryContext;

/**
 * A single quick-entry form: how to seed it, validate it, name it, and render
 * its handful of inputs. The heavy lifting — turning these simple fields into a
 * correctly balanced ledger draft — is delegated to the shared `adapter`, so
 * this file never does accounting math.
 */
export type QuickEntrySpec<F extends HeaderFields> = {
  kind: string;
  label: string;
  icon: string;
  adapter: TransactionTypeAdapter<F>;
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
  adapter: expenseAdapter,
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
  adapter: incomeAdapter,
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
    </>
  ),
};

const transferSpec: QuickEntrySpec<TransferFields> = {
  kind: 'transfer',
  label: 'Transfer',
  icon: '🔁',
  adapter: transferAdapter,
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
  adapter: exchangeAdapter,
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
  adapter: fixBalanceAdapter,
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

// Order shown in the dropdown; expense is the primary split-button action.
// Erased to a uniform field type at the boundary (like registry.ts does with
// its adapters) so the engine can treat every spec identically — each spec is
// still fully type-checked against its own field shape at definition above.
export const QUICK_ENTRY_SPECS = [
  expenseSpec,
  incomeSpec,
  transferSpec,
  exchangeSpec,
  fixBalanceSpec,
] as unknown as readonly QuickEntrySpec<HeaderFields>[];
