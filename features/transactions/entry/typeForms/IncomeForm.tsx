// features/transactions/entry/typeForms/IncomeForm.tsx
'use client';

import React, { useMemo, useState } from 'react';
import AmountInput from '../../AmountInput';
import { headerOf } from '../types/adapter';
import { incomeAdapter, type IncomeFields } from '../types/income';
import { HeaderFieldsEditor } from './HeaderFields';
import { Field, SectionLabel, AccountField, CurrencyCombobox } from './fields';
import type { TypeFormProps } from './props';

export function IncomeForm({
  draft,
  dispatch,
  accounts,
  payees,
  defaultCurrency,
}: TypeFormProps): React.JSX.Element {
  const ctx = useMemo(() => ({ defaultCurrency }), [defaultCurrency]);
  const [fields, setFields] = useState<IncomeFields>(
    () =>
      incomeAdapter.detect(draft) ?? {
        ...incomeAdapter.emptyFields(ctx),
        ...headerOf(draft),
      }
  );

  const update = (next: IncomeFields) => {
    setFields(next);
    dispatch({ type: 'replaceAll', state: incomeAdapter.compile(next, ctx) });
  };

  return (
    <div className="grid gap-6 md:grid-cols-[minmax(240px,1fr)_1.6fr] md:gap-8 lg:grid-cols-[minmax(280px,360px)_1fr]">
      <HeaderFieldsEditor
        header={fields}
        payees={payees}
        onChange={(patch) => update({ ...fields, ...patch })}
      />

      <section className="flex flex-col gap-5 md:border-l md:border-border md:pl-8">
        <SectionLabel>Income</SectionLabel>

        <Field label="Amount">
          <div className="flex gap-2">
            <AmountInput
              value={fields.amount}
              onChange={(amount) => update({ ...fields, amount })}
              placeholder="Amount"
              className="flex-1 text-right tabular-nums"
            />
            <CurrencyCombobox
              value={fields.currency}
              onChange={(currency) => update({ ...fields, currency })}
              className="w-24"
            />
          </div>
        </Field>

        <AccountField
          label="Received into"
          role="asset"
          accounts={accounts}
          value={fields.receivedInto}
          onChange={(receivedInto) => update({ ...fields, receivedInto })}
        />

        <AccountField
          label="Source"
          role="income"
          accounts={accounts}
          value={fields.from}
          onChange={(from) => update({ ...fields, from })}
        />
      </section>
    </div>
  );
}
