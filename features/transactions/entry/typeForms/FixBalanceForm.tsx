// features/transactions/entry/typeForms/FixBalanceForm.tsx
'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import AmountInput from '../../AmountInput';
import { headerOf } from '../types/adapter';
import { fixBalanceAdapter, type FixBalanceFields } from '../types/fixBalance';
import { HeaderFieldsEditor } from './HeaderFields';
import { Field, SectionLabel, AccountField, CurrencyCombobox } from './fields';
import type { TypeFormProps } from './props';

export type FixBalanceFormProps = TypeFormProps & {
  getAccountBalance: (account: string, currency: string) => Promise<string>;
};

export function FixBalanceForm({
  draft,
  dispatch,
  accounts,
  payees,
  defaultCurrency,
  getAccountBalance,
}: FixBalanceFormProps): React.JSX.Element {
  const ctx = useMemo(() => ({ defaultCurrency }), [defaultCurrency]);
  const [fields, setFields] = useState<FixBalanceFields>(
    () =>
      fixBalanceAdapter.detect(draft) ?? {
        ...fixBalanceAdapter.emptyFields(ctx),
        ...headerOf(draft),
      }
  );
  const [current, setCurrent] = useState<string | null>(null);
  const reqId = useRef(0);

  const update = (next: FixBalanceFields) => {
    setFields(next);
    dispatch({
      type: 'replaceAll',
      state: fixBalanceAdapter.compile(next, ctx),
    });
  };

  useEffect(() => {
    const account = fields.account.trim();
    const id = ++reqId.current;
    // Deferred so the empty-account clear doesn't setState synchronously in
    // the effect body; the debounce only matters when there's a fetch to make.
    const t = setTimeout(
      () => {
        if (id !== reqId.current) return;
        if (!account) {
          setCurrent(null);
          return;
        }
        void getAccountBalance(account, fields.targetCurrency).then((bal) => {
          if (id === reqId.current) setCurrent(bal);
        });
      },
      account ? 300 : 0
    );
    return () => clearTimeout(t);
  }, [fields.account, fields.targetCurrency, getAccountBalance]);

  const implied =
    current !== null && fields.targetAmount.trim() !== ''
      ? (Number(fields.targetAmount) - Number(current)).toFixed(2)
      : null;

  return (
    <div className="grid gap-6 md:grid-cols-[minmax(240px,1fr)_1.6fr] md:gap-8 lg:grid-cols-[minmax(280px,360px)_1fr]">
      <HeaderFieldsEditor
        header={fields}
        payees={payees}
        onChange={(patch) => update({ ...fields, ...patch })}
      />
      <section className="flex flex-col gap-5 md:border-l md:border-border md:pl-8">
        <SectionLabel>Fix balance</SectionLabel>

        <AccountField
          label="Account"
          role={['asset', 'liability', 'income', 'expense', 'equity']}
          accounts={accounts}
          value={fields.account}
          onChange={(account) => update({ ...fields, account })}
        />

        <Field label="Target balance">
          <div className="flex gap-2">
            <AmountInput
              value={fields.targetAmount}
              onChange={(targetAmount) => update({ ...fields, targetAmount })}
              placeholder="Target"
              className="flex-1 text-right tabular-nums"
            />
            <CurrencyCombobox
              value={fields.targetCurrency}
              onChange={(targetCurrency) =>
                update({ ...fields, targetCurrency })
              }
              className="w-24"
            />
          </div>
        </Field>

        <div className="text-xs text-muted-foreground tabular-nums">
          {current === null
            ? 'Enter an account to see its current balance.'
            : `Now: ${current} ${fields.targetCurrency}`}
          {implied !== null && (
            <span className="ml-2">
              · Implied adjustment: {implied} {fields.targetCurrency}
            </span>
          )}
        </div>
      </section>
    </div>
  );
}
