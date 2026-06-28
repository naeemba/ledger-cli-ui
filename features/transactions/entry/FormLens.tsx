'use client';

import React from 'react';
import AmountInput from '../AmountInput';
import type {
  DraftAction,
  DraftPosting,
  DraftState,
  DraftStatus,
} from './draftReducer';
import Combobox from '@/components/Combobox';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

type Props = {
  draft: DraftState;
  dispatch: (a: DraftAction) => void;
  accounts: string[];
  payees: string[];
  defaultCurrency: string;
  fieldErrors?: Record<string, string>;
};

export function FormLens({
  draft,
  dispatch,
  accounts,
  payees,
  defaultCurrency,
  fieldErrors,
}: Props): React.JSX.Element {
  const balance = computeBalance(draft.postings);

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

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground sm:text-[0.7rem]">
    {children}
  </div>
);

const Field = ({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string;
  htmlFor?: string;
  error?: string;
  children: React.ReactNode;
}) => (
  <div className="flex flex-col gap-1.5">
    <Label htmlFor={htmlFor}>{label}</Label>
    {children}
    {error && <span className="text-xs text-destructive">{error}</span>}
  </div>
);

const PostingRow = ({
  posting,
  accounts,
  canRemove,
  onChange,
  onRemove,
}: {
  posting: DraftPosting;
  accounts: string[];
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
      <Input
        type="text"
        value={posting.currency}
        onChange={(e) => onChange({ currency: e.target.value })}
        placeholder="Currency"
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

type Balance =
  | { kind: 'balanced' }
  | { kind: 'auto-balance' }
  | { kind: 'invalid' }
  | { kind: 'too-many-blanks' }
  | { kind: 'unbalanced'; issues: [string, number][] };

const computeBalance = (postings: DraftPosting[]): Balance => {
  const blanks = postings.filter((p) => p.amount.trim() === '').length;
  if (blanks > 1) return { kind: 'too-many-blanks' };
  if (blanks === 1) return { kind: 'auto-balance' };
  const byCurrency = new Map<string, number>();
  for (const p of postings) {
    const value = Number(p.amount);
    if (!Number.isFinite(value)) return { kind: 'invalid' };
    byCurrency.set(p.currency, (byCurrency.get(p.currency) ?? 0) + value);
  }
  const issues = [...byCurrency.entries()].filter(
    ([, total]) => Math.abs(total) > 1e-9
  );
  if (issues.length === 0) return { kind: 'balanced' };
  return { kind: 'unbalanced', issues };
};

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
