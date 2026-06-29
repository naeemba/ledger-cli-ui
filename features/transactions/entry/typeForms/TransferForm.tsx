// features/transactions/entry/typeForms/TransferForm.tsx
'use client';

import React, { useMemo, useState } from 'react';
import AmountInput from '../../AmountInput';
import { headerOf } from '../types/adapter';
import { transferAdapter, type TransferFields } from '../types/transfer';
import { HeaderFieldsEditor } from './HeaderFields';
import { Field, SectionLabel, AccountField, CurrencyCombobox } from './fields';
import type { TypeFormProps } from './props';

export function TransferForm({
  draft,
  dispatch,
  accounts,
  payees,
  defaultCurrency,
  currencies = [],
}: TypeFormProps): React.JSX.Element {
  const ctx = useMemo(() => ({ defaultCurrency }), [defaultCurrency]);
  const [fields, setFields] = useState<TransferFields>(
    () =>
      transferAdapter.detect(draft) ?? {
        ...transferAdapter.emptyFields(ctx),
        ...headerOf(draft),
      }
  );

  const update = (next: TransferFields) => {
    setFields(next);
    dispatch({ type: 'replaceAll', state: transferAdapter.compile(next, ctx) });
  };

  return (
    <div className="grid gap-6 md:grid-cols-[minmax(240px,1fr)_1.6fr] md:gap-8 lg:grid-cols-[minmax(280px,360px)_1fr]">
      <HeaderFieldsEditor
        header={fields}
        payees={payees}
        onChange={(patch) => update({ ...fields, ...patch })}
      />

      <section className="flex flex-col gap-5 md:border-l md:border-border md:pl-8">
        <SectionLabel>Transfer</SectionLabel>

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
              currencies={currencies}
              className="w-24"
            />
          </div>
        </Field>

        <AccountField
          label="From"
          role={['asset', 'liability']}
          accounts={accounts}
          value={fields.from}
          onChange={(from) => update({ ...fields, from })}
        />

        <AccountField
          label="To"
          role={['asset', 'liability']}
          accounts={accounts}
          value={fields.to}
          onChange={(to) => update({ ...fields, to })}
        />
      </section>
    </div>
  );
}
