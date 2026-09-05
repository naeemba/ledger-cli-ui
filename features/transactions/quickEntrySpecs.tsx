'use client';

import React from 'react';
import { ExtraItemsField } from './entry/typeForms/ExtraItemsField';
import { AccountField } from './entry/typeForms/fields';
import type { HeaderFields } from './entry/types/adapter';
import { exchangeAdapter, type ExchangeFields } from './entry/types/exchange';
import { expenseAdapter, type ExpenseFields } from './entry/types/expense';
import {
  fixBalanceAdapter,
  type FixBalanceFields,
} from './entry/types/fixBalance';
import { incomeAdapter, type IncomeFields } from './entry/types/income';
import { transferAdapter, type TransferFields } from './entry/types/transfer';
import {
  AmountRow,
  firstMoneyAccount,
  isNumber,
  isPositive,
  leafOf,
  seed,
  type QuickEntrySpec,
} from './quickEntryKit';
import { debtSpec, settleSpec } from './quickEntryPeopleSpecs';

// The kit holds the pieces every spec shares; re-exported so consumers keep a
// single import site for the quick-entry surface.
export {
  todayLocal,
  type QuickEntrySpec,
  type QuickEntryContext,
} from './quickEntryKit';

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
