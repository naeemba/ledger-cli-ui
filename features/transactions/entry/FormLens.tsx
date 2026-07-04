'use client';

import React from 'react';
import AmountInput from '../AmountInput';
import type {
  DraftAction,
  DraftPosting,
  DraftState,
  DraftStatus,
} from './draftReducer';
import { CurrencyCombobox, Field, SectionLabel } from './typeForms/fields';
import Combobox from '@/components/Combobox';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import type { Balance } from '@/lib/transactions/model';

type Props = {
  draft: DraftState;
  dispatch: (a: DraftAction) => void;
  accounts: string[];
  payees: string[];
  defaultCurrency: string;
  currencies?: string[];
  fieldErrors?: Record<string, string>;
};

export function FormLens({
  draft,
  dispatch,
  accounts,
  payees,
  defaultCurrency,
  currencies = [],
  fieldErrors,
}: Props): React.JSX.Element {
  const balance = draft.balance();

  return (
    <div className="grid gap-6 md:grid-cols-[minmax(240px,1fr)_1.6fr] md:gap-8 lg:grid-cols-[minmax(280px,360px)_1fr]">
      <section className="flex flex-col gap-5">
        <SectionLabel>Details</SectionLabel>

        <Field label="Date" htmlFor="tx-date" error={fieldErrors?.['date']}>
          <Input
            id="tx-date"
            type="date"
            value={draft.date}
            onChange={(e) =>
              dispatch({
                type: 'setField',
                field: 'date',
                value: e.target.value,
              })
            }
            aria-invalid={!!fieldErrors?.['date']}
            required
          />
        </Field>

        <Field label="Status">
          <ToggleGroup
            value={[draft.status]}
            onValueChange={(values) => {
              if (values.length > 0)
                dispatch({
                  type: 'setField',
                  field: 'status',
                  value: values[0] as DraftStatus,
                });
            }}
            spacing={0}
            variant="outline"
            size="sm"
            className="w-full"
          >
            <ToggleGroupItem value="none" className="flex-1">
              Unmarked
            </ToggleGroupItem>
            <ToggleGroupItem value="pending" className="flex-1">
              Pending (!)
            </ToggleGroupItem>
            <ToggleGroupItem value="cleared" className="flex-1">
              Cleared (*)
            </ToggleGroupItem>
          </ToggleGroup>
        </Field>

        <Field label="Payee" error={fieldErrors?.['payee']}>
          <Combobox
            value={draft.payee}
            onChange={(v) =>
              dispatch({ type: 'setField', field: 'payee', value: v })
            }
            options={payees}
            placeholder="Type or pick a payee…"
          />
        </Field>

        <Field
          label="Note (optional)"
          htmlFor="tx-note"
          error={fieldErrors?.['note']}
        >
          <Textarea
            id="tx-note"
            value={draft.note}
            onChange={(e) =>
              dispatch({
                type: 'setField',
                field: 'note',
                value: e.target.value,
              })
            }
            rows={4}
            placeholder="Comment lines — written below the payee with a ; prefix"
            aria-invalid={!!fieldErrors?.['note']}
          />
        </Field>
      </section>

      <section className="flex flex-col gap-3 md:border-l md:border-border md:pl-8">
        <div className="flex items-baseline justify-between">
          <SectionLabel>Postings</SectionLabel>
          <BalanceIndicator balance={balance} />
        </div>

        <div className="flex flex-col gap-2">
          {draft.postings.map((posting, idx) => (
            <PostingRow
              key={idx}
              posting={posting}
              accounts={accounts}
              currencies={currencies}
              canRemove={draft.postings.length > 2}
              onChange={(patch) =>
                dispatch({ type: 'setPosting', index: idx, patch })
              }
              onRemove={() => dispatch({ type: 'removePosting', index: idx })}
            />
          ))}
        </div>

        <div className="flex items-center justify-between">
          <Button
            type="button"
            onClick={() =>
              dispatch({ type: 'addPosting', currency: defaultCurrency })
            }
            variant="link"
            size="sm"
            className="px-0"
          >
            + Add posting
          </Button>
          {fieldErrors?.['postings'] && (
            <span className="text-xs text-destructive">
              {fieldErrors['postings']}
            </span>
          )}
        </div>
      </section>
    </div>
  );
}

// ─── Private sub-components ─────────────────────────────────────────────────

const PostingRow = ({
  posting,
  accounts,
  currencies,
  canRemove,
  onChange,
  onRemove,
}: {
  posting: DraftPosting;
  accounts: string[];
  currencies: string[];
  canRemove: boolean;
  onChange: (patch: Partial<DraftPosting>) => void;
  onRemove: () => void;
}) => (
  <div className="grid grid-cols-1 items-center gap-2 rounded-lg border border-border p-2 sm:grid-cols-[1fr_140px_90px_auto] sm:rounded-none sm:border-0 sm:p-0">
    <Combobox
      value={posting.account}
      onChange={(v) => onChange({ account: v })}
      options={accounts}
      placeholder="Account (e.g. Expenses:Food)"
    />
    <div className="flex items-center gap-2 sm:contents">
      <AmountInput
        value={posting.amount}
        onChange={(amount) => onChange({ amount })}
        placeholder="Amount"
        className="flex-1 text-right tabular-nums sm:flex-none"
      />
      <CurrencyCombobox
        value={posting.currency}
        onChange={(currency) => onChange({ currency })}
        currencies={currencies}
        className="w-24 sm:w-auto"
      />
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={onRemove}
        disabled={!canRemove}
        title={canRemove ? 'Remove posting' : 'At least two postings required'}
      >
        ×
      </Button>
    </div>
  </div>
);

const BalanceIndicator = ({ balance }: { balance: Balance }) => {
  if (balance.kind === 'balanced') {
    return <span className="text-xs text-positive">Balanced</span>;
  }
  if (balance.kind === 'auto-balance') {
    return (
      <span className="text-xs text-muted-foreground">
        Blank posting will auto-balance
      </span>
    );
  }
  if (balance.kind === 'too-many-blanks') {
    return (
      <span className="text-xs text-negative">
        Only one posting may be blank
      </span>
    );
  }
  if (balance.kind === 'invalid') {
    return <span className="text-xs text-negative">Invalid amount</span>;
  }
  return (
    <span className="text-xs text-negative tabular-nums">
      Off by{' '}
      {balance.issues
        .map(([ccy, total]) => `${ccy} ${total.toFixed(2)}`)
        .join(', ')}
    </span>
  );
};
