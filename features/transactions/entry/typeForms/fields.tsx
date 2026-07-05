'use client';

import React, { useTransition } from 'react';
import { accountsForRole, type AccountRole } from '../types/accountRole';
import Combobox from '@/components/Combobox';
import CommodityCombobox from '@/components/CommodityCombobox';
import { Label } from '@/components/ui/label';
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
  role: AccountRole | AccountRole[]
): string[] => {
  const roles = Array.isArray(role) ? role : [role];
  const seen = new Set<string>();
  for (const r of roles)
    for (const a of accountsForRole(accounts, r)) seen.add(a);
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
  onChange: (v: string) => void;
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
  onChange: (v: string) => void;
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
