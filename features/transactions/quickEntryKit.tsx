'use client';

import React from 'react';
import AmountInput from './AmountInput';
import type { DraftState } from './entry/draftReducer';
import {
  CurrencyCombobox,
  Field,
  optionsForRoles,
} from './entry/typeForms/fields';
import type {
  HeaderFields,
  TransactionTypeAdapter,
  TypeContext,
} from './entry/types/adapter';

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

export const todayLocal = () => new Date().toLocaleDateString('en-CA');
export const leafOf = (account: string) =>
  account.split(':').pop()?.trim() ?? '';
export const firstMoneyAccount = (accounts: string[]) =>
  optionsForRoles(accounts, ['asset', 'liability'])[0] ?? '';
export const isPositive = (s: string) => Number(s) > 0;
export const isNumber = (s: string) =>
  s.trim() !== '' && !Number.isNaN(Number(s));

// Every quick entry starts with a blank description so the "(optional)" field
// is consistently empty across types; when left blank, save() derives the payee
// from resolvePayee/label. Adapters otherwise seed a non-empty default payee.
export const seed = <F extends HeaderFields>(
  adapter: TransactionTypeAdapter<F>,
  ctx: TypeContext
): F => ({ ...adapter.emptyFields(ctx), payee: '', date: todayLocal() });

export const AmountRow = ({
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
