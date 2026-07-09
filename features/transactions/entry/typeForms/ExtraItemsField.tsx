'use client';

import React from 'react';
import AmountInput from '../../AmountInput';
import type { ExtraItem } from '../types/extraItems';
import { CurrencyCombobox, SectionLabel } from './fields';
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
  const atCap = baseCount + items.length >= MAX_POSTINGS;

  const setItem = (index: number, patch: Partial<ExtraItem>) =>
    onChange(
      items.map((item, i) => (i === index ? { ...item, ...patch } : item))
    );
  const addItem = () =>
    onChange([
      ...items,
      { account: '', amount: '', currency: defaultCurrency },
    ]);
  const removeItem = (index: number) =>
    onChange(items.filter((_, i) => i !== index));

  return (
    <section className="flex flex-col gap-3">
      <SectionLabel>Extra items (fees, tips…)</SectionLabel>

      {items.map((item, index) => (
        <div key={index} className="flex items-center gap-2">
          <Combobox
            value={item.account}
            onChange={(account) => setItem(index, { account })}
            options={accounts}
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
