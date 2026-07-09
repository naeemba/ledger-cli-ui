'use client';

import React from 'react';
import AmountInput from '../../AmountInput';
import type { ExtraItem } from '../types/extraItems';
import { CurrencyCombobox, optionsForRoles, SectionLabel } from './fields';
import Combobox from '@/components/Combobox';
import { Button } from '@/components/ui/button';

const MAX_POSTINGS = 50;

export function ExtraItemsField({
  items,
  accounts,
  defaultCurrency,
  baseCount,
  onChange,
}: {
  items: ExtraItem[];
  accounts: string[];
  defaultCurrency: string;
  baseCount: number;
  onChange: (items: ExtraItem[]) => void;
}): React.JSX.Element {
  // `compile` emits one balancing posting per distinct residual currency, so the
  // compiled transaction can exceed the row count when extras span several
  // currencies. Bound the worst case: the fixed non-balancing base postings
  // (`baseCount - 1`), one posting per row, and one balancing posting per
  // distinct currency in play (the base residual currency plus each row's).
  const residualCurrencies = new Set([
    defaultCurrency,
    ...items.map((item) => item.currency),
  ]).size;
  const atCap =
    baseCount - 1 + items.length + residualCurrencies >= MAX_POSTINGS;
  const expenseAccounts = optionsForRoles(accounts, 'expense');

  // `Combobox` keeps uncontrolled internal state (open/search) that is not
  // derived from `value`, so keying rows by array index would misassociate that
  // state when a middle row is removed and the rows below shift up. Track a
  // stable per-row id instead, kept in lockstep with `items` on add/remove and
  // regenerated when the array is replaced from outside (type switch / detect).
  const [rowIds, setRowIds] = React.useState<string[]>(() =>
    items.map(() => crypto.randomUUID())
  );
  let ids = rowIds;
  if (ids.length !== items.length) {
    ids = items.map(() => crypto.randomUUID());
    setRowIds(ids);
  }

  const setItem = (index: number, patch: Partial<ExtraItem>) =>
    onChange(
      items.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item
      )
    );
  const addItem = () => {
    if (atCap) return;
    setRowIds((current) => [...current, crypto.randomUUID()]);
    onChange([
      ...items,
      { account: '', amount: '', currency: defaultCurrency },
    ]);
  };
  const removeItem = (index: number) => {
    setRowIds((current) =>
      current.filter((_, itemIndex) => itemIndex !== index)
    );
    onChange(items.filter((_, itemIndex) => itemIndex !== index));
  };

  return (
    <section className="flex flex-col gap-3">
      <SectionLabel>Extra items (fees, tips…)</SectionLabel>

      {items.map((item, index) => (
        <div key={ids[index]} className="flex items-center gap-2">
          <Combobox
            value={item.account}
            onChange={(account) => setItem(index, { account })}
            options={expenseAccounts}
            placeholder="Account, e.g. Expenses:Fees"
          />
          <AmountInput
            value={item.amount}
            onChange={(amount) => setItem(index, { amount })}
            placeholder="Amount"
            className="w-28 text-right tabular-nums"
          />
          <CurrencyCombobox
            value={item.currency}
            onChange={(currency) => setItem(index, { currency })}
            className="w-24"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Remove item"
            onClick={() => removeItem(index)}
          >
            ×
          </Button>
        </div>
      ))}

      <div className="flex flex-col gap-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          disabled={atCap}
          onClick={addItem}
        >
          + Add item
        </Button>
        {atCap && (
          <span className="text-xs text-muted-foreground">
            Posting limit reached ({MAX_POSTINGS}).
          </span>
        )}
      </div>
    </section>
  );
}
