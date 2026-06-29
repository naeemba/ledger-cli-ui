// features/transactions/entry/typeForms/ExpenseForm.tsx
'use client';

import React, { useMemo, useState } from 'react';
import AmountInput from '../../AmountInput';
import { headerOf } from '../types/adapter';
import { expenseAdapter, type ExpenseFields } from '../types/expense';
import { HeaderFieldsEditor } from './HeaderFields';
import { Field, SectionLabel, AccountField } from './fields';
import type { TypeFormProps } from './props';
import { Input } from '@/components/ui/input';

export function ExpenseForm({
  draft,
  dispatch,
  accounts,
  payees,
  defaultCurrency,
}: TypeFormProps): React.JSX.Element {
  const ctx = useMemo(() => ({ defaultCurrency }), [defaultCurrency]);
  const [fields, setFields] = useState<ExpenseFields>(
    () =>
      expenseAdapter.detect(draft) ?? {
        ...expenseAdapter.emptyFields(ctx),
        ...headerOf(draft),
      }
  );

  const update = (next: ExpenseFields) => {
    setFields(next);
    dispatch({ type: 'replaceAll', state: expenseAdapter.compile(next, ctx) });
  };

  return (
    <div className="grid gap-6 md:grid-cols-[minmax(240px,1fr)_1.6fr] md:gap-8 lg:grid-cols-[minmax(280px,360px)_1fr]">
      <HeaderFieldsEditor
        header={fields}
        payees={payees}
        onChange={(patch) => update({ ...fields, ...patch })}
      />

      <section className="flex flex-col gap-5 md:border-l md:border-border md:pl-8">
        <SectionLabel>Expense</SectionLabel>

        <Field label="Amount">
          <div className="flex gap-2">
            <AmountInput
              value={fields.amount}
              onChange={(amount) => update({ ...fields, amount })}
              placeholder="Amount"
              className="flex-1 text-right tabular-nums"
            />
            <Input
              type="text"
              value={fields.currency}
              onChange={(e) => update({ ...fields, currency: e.target.value })}
              placeholder="Currency"
              className="w-24"
            />
          </div>
        </Field>

        <AccountField
          label="Paid from"
          role={['asset', 'liability']}
          accounts={accounts}
          value={fields.paidFrom}
          onChange={(paidFrom) => update({ ...fields, paidFrom })}
        />

        <AccountField
          label="Spent on"
          role="expense"
          accounts={accounts}
          value={fields.spentOn}
          onChange={(spentOn) => update({ ...fields, spentOn })}
        />
      </section>
    </div>
  );
}
