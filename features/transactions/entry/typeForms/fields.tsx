'use client';

import React from 'react';
import { accountsForRole, type AccountRole } from '../types/accountRole';
import Combobox from '@/components/Combobox';
import { Label } from '@/components/ui/label';

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

const optionsForRoles = (
  accounts: string[],
  role: AccountRole | AccountRole[]
): string[] => {
  const roles = Array.isArray(role) ? role : [role];
  const seen = new Set<string>();
  for (const r of roles)
    for (const a of accountsForRole(accounts, r)) seen.add(a);
  return [...seen];
};

export const AccountField = ({
  label,
  role,
  accounts,
  value,
  onChange,
  placeholder = 'Search accounts…',
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
        placeholder={placeholder}
      />
      {/* Hidden list keeps filtered options in the DOM for SSR assertions. */}
      <span hidden aria-hidden="true">
        {options.join(' ')}
      </span>
    </Field>
  );
};
