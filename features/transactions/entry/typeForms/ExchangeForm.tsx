'use client';

import React, { useMemo, useState } from 'react';
import AmountInput from '../../AmountInput';
import { headerOf } from '../types/adapter';
import { exchangeAdapter, type ExchangeFields } from '../types/exchange';
import { HeaderFieldsEditor } from './HeaderFields';
import { Field, SectionLabel, AccountField } from './fields';
import type { TypeFormProps } from './props';
import { Input } from '@/components/ui/input';

export function ExchangeForm({
  draft,
  dispatch,
  accounts,
  payees,
  defaultCurrency,
}: TypeFormProps): React.JSX.Element {
  const ctx = useMemo(() => ({ defaultCurrency }), [defaultCurrency]);
  const [fields, setFields] = useState<ExchangeFields>(
    () =>
      exchangeAdapter.detect(draft) ?? {
        ...exchangeAdapter.emptyFields(ctx),
        ...headerOf(draft),
      }
  );
  const update = (next: ExchangeFields) => {
    setFields(next);
    dispatch({ type: 'replaceAll', state: exchangeAdapter.compile(next, ctx) });
  };

  const amountRow = (
    amount: string,
    currency: string,
    onAmount: (v: string) => void,
    onCurrency: (v: string) => void
  ) => (
    <div className="flex gap-2">
      <AmountInput
        value={amount}
        onChange={onAmount}
        placeholder="Amount"
        className="flex-1 text-right tabular-nums"
      />
      <Input
        type="text"
        value={currency}
        onChange={(e) => onCurrency(e.target.value)}
        placeholder="Currency"
        className="w-24"
      />
    </div>
  );

  return (
    <div className="grid gap-6 md:grid-cols-[minmax(240px,1fr)_1.6fr] md:gap-8 lg:grid-cols-[minmax(280px,360px)_1fr]">
      <HeaderFieldsEditor
        header={fields}
        payees={payees}
        onChange={(patch) => update({ ...fields, ...patch })}
      />
      <section className="flex flex-col gap-5 md:border-l md:border-border md:pl-8">
        <SectionLabel>Gave</SectionLabel>
        <Field label="Amount">
          {amountRow(
            fields.gaveAmount,
            fields.gaveCurrency,
            (gaveAmount) => update({ ...fields, gaveAmount }),
            (gaveCurrency) => update({ ...fields, gaveCurrency })
          )}
        </Field>
        <AccountField
          label="From"
          role={['asset', 'liability']}
          accounts={accounts}
          value={fields.gaveFrom}
          onChange={(gaveFrom) => update({ ...fields, gaveFrom })}
        />

        <SectionLabel>Got</SectionLabel>
        <Field label="Amount">
          {amountRow(
            fields.gotAmount,
            fields.gotCurrency,
            (gotAmount) => update({ ...fields, gotAmount }),
            (gotCurrency) => update({ ...fields, gotCurrency })
          )}
        </Field>
        <AccountField
          label="Into"
          role={['asset', 'liability']}
          accounts={accounts}
          value={fields.gotInto}
          onChange={(gotInto) => update({ ...fields, gotInto })}
        />
      </section>
    </div>
  );
}
