'use client';

import React, { useTransition } from 'react';
import AmountInput from '../../AmountInput';
import type { DraftStatus } from '../draftReducer';
import { accountsForRole, type AccountRole } from '../types/accountRole';
import Combobox from '@/components/Combobox';
import CommodityCombobox from '@/components/CommodityCombobox';
import { Label } from '@/components/ui/label';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { upsertMappingAction } from '@/features/currencies/actions';

export const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground sm:text-[0.7rem]">
    {children}
  </div>
);

export const Field = ({
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

export const optionsForRoles = (
  accounts: string[],
  roleOrRoles: AccountRole | AccountRole[]
): string[] => {
  const roles = Array.isArray(roleOrRoles) ? roleOrRoles : [roleOrRoles];
  const seen = new Set<string>();
  for (const role of roles)
    for (const account of accountsForRole(accounts, role)) seen.add(account);
  return [...seen];
};

const ROLE_EXAMPLE: Record<AccountRole, string> = {
  asset: 'Assets:Checking',
  liability: 'Liabilities:CreditCard',
  income: 'Income:Salary',
  expense: 'Expenses:Food',
  equity: 'Equity:Opening Balances',
  unknown: 'Assets:Checking',
};

/**
 * Builds a placeholder whose example matches the account role of the field, so
 * an asset picker doesn't suggest "Expenses:Food". For multi-role fields the
 * first role wins (it's the primary one — e.g. "asset" for "Paid from").
 */
export const placeholderForRole = (
  role: AccountRole | AccountRole[]
): string => {
  const first = (Array.isArray(role) ? role[0] : role) ?? 'unknown';
  return `Account, e.g. ${ROLE_EXAMPLE[first]}`;
};

export const AccountField = ({
  label,
  role,
  accounts,
  value,
  onChange,
  placeholder,
  error,
}: {
  label: string;
  role: AccountRole | AccountRole[];
  accounts: string[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  error?: string;
}) => {
  const options = optionsForRoles(accounts, role);
  return (
    <Field label={label} error={error}>
      <Combobox
        value={value}
        onChange={onChange}
        options={options}
        placeholder={placeholder ?? placeholderForRole(role)}
      />
    </Field>
  );
};

/**
 * Inline currency picker used alongside an amount input. Searches the commodity
 * provider and persists a mapping when the user picks a suggestion for the first
 * time. Free-typed tickers are accepted without persisting a mapping (the
 * classifier covers them at fetch time).
 */
export const CurrencyCombobox = ({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) => {
  const [, startPersist] = useTransition();
  return (
    <CommodityCombobox
      value={value}
      placeholder="Currency"
      triggerClassName={className}
      onSelect={(suggestion) => {
        onChange(suggestion.symbol);
        startPersist(
          () =>
            void upsertMappingAction({
              symbol: suggestion.symbol,
              kind: suggestion.kind,
              providerId: suggestion.providerId,
            })
        );
      }}
      onFreeText={(raw) => onChange(raw.toUpperCase())}
    />
  );
};

/** An amount input paired with its currency picker — the row every money form
 * opens with. */
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
  onAmount: (value: string) => void;
  onCurrency: (value: string) => void;
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

/** One-of-N picker: mutually exclusive options whose pressed state a screen
 * reader can announce. Every entry form that offers a choice (status, debt
 * direction) renders it through here. */
export const ChoiceToggle = <C extends string>({
  value,
  onChange,
  options,
  size,
}: {
  value: C;
  onChange: (choice: C) => void;
  options: { value: C; label: string }[];
  size?: React.ComponentProps<typeof ToggleGroup>['size'];
}) => (
  <ToggleGroup
    value={[value]}
    onValueChange={(values) => {
      if (values.length > 0) onChange(values[0] as C);
    }}
    spacing={0}
    variant="outline"
    size={size}
    className="w-full"
  >
    {options.map((option) => (
      <ToggleGroupItem
        key={option.value}
        value={option.value}
        className="flex-1"
      >
        {option.label}
      </ToggleGroupItem>
    ))}
  </ToggleGroup>
);

/** The journal's three transaction states, worded as the form shows them. */
export const STATUS_OPTIONS: { value: DraftStatus; label: string }[] = [
  { value: 'none', label: 'Unmarked' },
  { value: 'pending', label: 'Pending (!)' },
  { value: 'cleared', label: 'Cleared (*)' },
];
