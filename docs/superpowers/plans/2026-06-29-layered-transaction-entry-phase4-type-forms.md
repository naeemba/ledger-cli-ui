# Phase 4: The Five Type Forms ("Types" tab) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the user-facing **Types** tab — type chips plus a tailored mini-form per type — wired to Phase 3's adapters, all editing the one shared `DraftState`.

**Architecture:** A new `TypeLens` renders a chip row and the active type's form. Each `*Form` owns its typed adapter: it seeds its `fields` from `adapter.detect(draft) ?? { ...adapter.emptyFields(ctx), ...headerOf(draft) }`, and on every edit dispatches `{ type: 'replaceAll', state: adapter.compile(fields, ctx) }` so the shared draft stays canonical and Form/Raw tabs always reflect Types edits. Shared presentational primitives are factored out of `FormLens` into `typeForms/fields.tsx`. Fix-balance gets a display-only current→target→implied-adjustment preview backed by a server action.

**Tech Stack:** React 19 client components, TypeScript, Vitest + `react-dom/server` `renderToStaticMarkup` (node env, no jsdom), Next server actions, `ledger` CLI via `utils/runLedger`.

## Global Constraints

- The ledger file is the source of truth; a transaction's type is **inferred from posting shape, never stored**. Forms only ever produce a `DraftState` via the adapters.
- Every lens reads/writes the one shared `DraftState` via `dispatch`. Forms dispatch `{ type: 'replaceAll', state }` — never mutate postings directly.
- Tests: Vitest, `renderToStaticMarkup`, node env, no jsdom. Pure logic is unit-tested; interactive shells get static smoke tests.
- Account fields are role-filtered comboboxes but accept the **full account path** as free text (`Expenses:Coffee`). No auto-prefixing of role roots.
- Tab order is hardcoded `Types · Form · Raw` this phase; persistence/reordering is Phase 5.
- Each `*Form` imports its own **typed** adapter directly (e.g. `expenseAdapter: TransactionTypeAdapter<ExpenseFields>`); never cast the `unknown` fields from `registry.ts`.
- All new interactive components begin with `'use client';`.
- Run the full suite with `pnpm test` and types with `pnpm type-check`. Commit after every task.

---

### Task 1: Shared form primitives (`typeForms/fields.tsx`) + FormLens refactor

Extract the presentational primitives out of `FormLens.tsx` so both lenses share them, and add a role-filtered `AccountField`.

**Files:**
- Create: `features/transactions/entry/typeForms/fields.tsx`
- Create: `features/transactions/entry/typeForms/fields.test.tsx`
- Modify: `features/transactions/entry/FormLens.tsx` (import `Field`/`SectionLabel` from the new module; delete the local copies)

**Interfaces:**
- Consumes: `accountsForRole`, `AccountRole` from `../types/accountRole`; `Combobox` from `@/components/Combobox`; `Label` from `@/components/ui/label`.
- Produces:
  - `SectionLabel({ children: React.ReactNode })`
  - `Field({ label: string, htmlFor?: string, error?: string, children: React.ReactNode })`
  - `AccountField({ label, role, accounts, value, onChange, placeholder?, error? })` where `role: AccountRole | AccountRole[]`, `value: string`, `onChange: (v: string) => void`.

- [ ] **Step 1: Write the failing test**

```tsx
// features/transactions/entry/typeForms/fields.test.tsx
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { Field, SectionLabel, AccountField } from './fields';

const html = (node: React.ReactNode) => renderToStaticMarkup(node);

describe('fields primitives', () => {
  it('Field renders label and error', () => {
    const out = html(
      <Field label="Paid from" error="Required">
        <input />
      </Field>
    );
    expect(out).toContain('Paid from');
    expect(out).toContain('Required');
  });

  it('SectionLabel renders its text', () => {
    expect(html(<SectionLabel>Details</SectionLabel>)).toContain('Details');
  });

  it('AccountField shows only accounts matching the role(s)', () => {
    const out = html(
      <AccountField
        label="Spent on"
        role="expense"
        accounts={['Expenses:Food', 'Assets:Checking']}
        value=""
        onChange={() => {}}
      />
    );
    // Combobox renders its options in the DOM; the asset account must be absent.
    expect(out).toContain('Expenses:Food');
    expect(out).not.toContain('Assets:Checking');
  });

  it('AccountField accepts an array of roles', () => {
    const out = html(
      <AccountField
        label="From"
        role={['asset', 'liability']}
        accounts={['Assets:Checking', 'Liabilities:Card', 'Expenses:Food']}
        value=""
        onChange={() => {}}
      />
    );
    expect(out).toContain('Assets:Checking');
    expect(out).toContain('Liabilities:Card');
    expect(out).not.toContain('Expenses:Food');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test features/transactions/entry/typeForms/fields.test.tsx`
Expected: FAIL — `Cannot find module './fields'`.

- [ ] **Step 3: Write the implementation**

```tsx
// features/transactions/entry/typeForms/fields.tsx
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
  placeholder = 'Account (full path, e.g. Expenses:Food)',
  error,
}: {
  label: string;
  role: AccountRole | AccountRole[];
  accounts: string[];
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  error?: string;
}) => (
  <Field label={label} error={error}>
    <Combobox
      value={value}
      onChange={onChange}
      options={optionsForRoles(accounts, role)}
      placeholder={placeholder}
    />
  </Field>
);
```

- [ ] **Step 4: Refactor FormLens to import the shared primitives**

In `features/transactions/entry/FormLens.tsx`: delete the local `const SectionLabel = …` and `const Field = …` definitions (the two `// ─── Private sub-components ───` helpers), and add to the imports:

```tsx
import { Field, SectionLabel } from './typeForms/fields';
```

Leave `PostingRow` and `BalanceIndicator` in `FormLens.tsx` (they are form-specific).

- [ ] **Step 5: Run tests to verify all pass**

Run: `pnpm test features/transactions/entry/typeForms/fields.test.tsx features/transactions/entry/FormLens.test.tsx`
Expected: PASS — both the new `fields` tests and the existing FormLens smoke tests.

- [ ] **Step 6: Type-check and commit**

```bash
pnpm type-check
git add features/transactions/entry/typeForms/fields.tsx features/transactions/entry/typeForms/fields.test.tsx features/transactions/entry/FormLens.tsx
git commit -m "refactor(transactions): extract shared form primitives + role-filtered AccountField"
```

---

### Task 2: `isEmptyDraft` helper

A pure predicate so TypeLens can tell a fresh (create) draft from a populated one.

**Files:**
- Create: `features/transactions/entry/typeForms/isEmptyDraft.ts`
- Create: `features/transactions/entry/typeForms/isEmptyDraft.test.ts`

**Interfaces:**
- Consumes: `DraftState` from `../draftReducer`.
- Produces: `isEmptyDraft(draft: DraftState): boolean` — true when no posting has an account or amount AND payee/note are blank. (Date and currency are ignored: a fresh create draft has today's date and the default currency pre-filled.)

- [ ] **Step 1: Write the failing test**

```ts
// features/transactions/entry/typeForms/isEmptyDraft.test.ts
import { describe, it, expect } from 'vitest';
import { isEmptyDraft } from './isEmptyDraft';
import { initDraft } from '../draftReducer';

describe('isEmptyDraft', () => {
  it('is true for a fresh create draft (today + default currency only)', () => {
    expect(isEmptyDraft(initDraft({ date: '2026-06-29' }, 'USD'))).toBe(true);
  });

  it('is false when any posting has an account', () => {
    const d = initDraft({ date: '2026-06-29' }, 'USD');
    d.postings[0].account = 'Expenses:Food';
    expect(isEmptyDraft(d)).toBe(false);
  });

  it('is false when any posting has an amount', () => {
    const d = initDraft({ date: '2026-06-29' }, 'USD');
    d.postings[0].amount = '10';
    expect(isEmptyDraft(d)).toBe(false);
  });

  it('is false when a payee is set', () => {
    const d = initDraft({ date: '2026-06-29', payee: 'Cafe' }, 'USD');
    expect(isEmptyDraft(d)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test features/transactions/entry/typeForms/isEmptyDraft.test.ts`
Expected: FAIL — `Cannot find module './isEmptyDraft'`.

- [ ] **Step 3: Write the implementation**

```ts
// features/transactions/entry/typeForms/isEmptyDraft.ts
import type { DraftState } from '../draftReducer';

export const isEmptyDraft = (draft: DraftState): boolean =>
  draft.payee.trim() === '' &&
  draft.note.trim() === '' &&
  draft.postings.every(
    (p) => p.account.trim() === '' && p.amount.trim() === ''
  );
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test features/transactions/entry/typeForms/isEmptyDraft.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add features/transactions/entry/typeForms/isEmptyDraft.ts features/transactions/entry/typeForms/isEmptyDraft.test.ts
git commit -m "feat(transactions): isEmptyDraft predicate for type lens"
```

---

### Task 3: Shared `HeaderFields` component

The date / status / payee / note block every type form renders.

**Files:**
- Create: `features/transactions/entry/typeForms/HeaderFields.tsx`
- Create: `features/transactions/entry/typeForms/HeaderFields.test.tsx`

**Interfaces:**
- Consumes: `Field` from `./fields`; `HeaderFields` type from `../types/adapter`; `DraftStatus` from `../draftReducer`; `Input`, `Textarea`, `ToggleGroup`/`ToggleGroupItem` from `@/components/ui/*`; `Combobox`.
- Produces: `HeaderFieldsEditor({ header, payees, onChange })` where `header: HeaderFields` and `onChange: (patch: Partial<HeaderFields>) => void`. (Named `HeaderFieldsEditor` to avoid colliding with the `HeaderFields` type.)

- [ ] **Step 1: Write the failing test**

```tsx
// features/transactions/entry/typeForms/HeaderFields.test.tsx
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { HeaderFieldsEditor } from './HeaderFields';

const html = (node: React.ReactNode) => renderToStaticMarkup(node);

describe('HeaderFieldsEditor', () => {
  it('renders the date, payee and note values', () => {
    const out = html(
      <HeaderFieldsEditor
        header={{
          date: '2026-06-29',
          payee: 'Blue Bottle',
          status: 'none',
          note: 'morning',
        }}
        payees={['Blue Bottle']}
        onChange={() => {}}
      />
    );
    expect(out).toContain('2026-06-29');
    expect(out).toContain('Blue Bottle');
    expect(out).toContain('morning');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test features/transactions/entry/typeForms/HeaderFields.test.tsx`
Expected: FAIL — `Cannot find module './HeaderFields'`.

- [ ] **Step 3: Write the implementation**

```tsx
// features/transactions/entry/typeForms/HeaderFields.tsx
'use client';

import React from 'react';
import type { DraftStatus } from '../draftReducer';
import type { HeaderFields } from '../types/adapter';
import { Field, SectionLabel } from './fields';
import Combobox from '@/components/Combobox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

export const HeaderFieldsEditor = ({
  header,
  payees,
  onChange,
}: {
  header: HeaderFields;
  payees: string[];
  onChange: (patch: Partial<HeaderFields>) => void;
}): React.JSX.Element => (
  <section className="flex flex-col gap-5">
    <SectionLabel>Details</SectionLabel>

    <Field label="Date" htmlFor="ty-date">
      <Input
        id="ty-date"
        type="date"
        value={header.date}
        onChange={(e) => onChange({ date: e.target.value })}
        required
      />
    </Field>

    <Field label="Status">
      <ToggleGroup
        value={[header.status]}
        onValueChange={(values) => {
          if (values.length > 0)
            onChange({ status: values[0] as DraftStatus });
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

    <Field label="Payee">
      <Combobox
        value={header.payee}
        onChange={(v) => onChange({ payee: v })}
        options={payees}
        placeholder="Type or pick a payee…"
      />
    </Field>

    <Field label="Note (optional)" htmlFor="ty-note">
      <Textarea
        id="ty-note"
        value={header.note}
        onChange={(e) => onChange({ note: e.target.value })}
        rows={3}
        placeholder="Comment lines — written below the payee with a ; prefix"
      />
    </Field>
  </section>
);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test features/transactions/entry/typeForms/HeaderFields.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add features/transactions/entry/typeForms/HeaderFields.tsx features/transactions/entry/typeForms/HeaderFields.test.tsx
git commit -m "feat(transactions): shared header-fields editor for type forms"
```

---

### Task 4: ExpenseForm

The first concrete type form; establishes the form contract every later form follows.

**Files:**
- Create: `features/transactions/entry/typeForms/ExpenseForm.tsx`
- Create: `features/transactions/entry/typeForms/ExpenseForm.test.tsx`

**Interfaces:**
- Consumes: `expenseAdapter`, `ExpenseFields` from `../types/expense`; `headerOf` from `../types/adapter`; `DraftState`/`DraftAction` from `../draftReducer`; `HeaderFieldsEditor`, `Field`, `SectionLabel`, `AccountField` from the shared modules; `AmountInput` from `../../AmountInput`; `Input` from `@/components/ui/input`.
- Produces: `TypeFormProps` (shared contract, **defined here, re-exported for the other forms**) and `ExpenseForm(props: TypeFormProps)`.

```ts
export type TypeFormProps = {
  draft: DraftState;
  dispatch: (a: DraftAction) => void;
  accounts: string[];
  payees: string[];
  defaultCurrency: string;
};
```

The contract every form follows:
1. `const ctx = { defaultCurrency }` (memoized).
2. Seed once: `useState(() => adapter.detect(draft) ?? { ...adapter.emptyFields(ctx), ...headerOf(draft) })`. Seeding with `headerOf(draft)` preserves date/payee/status/note when the user switches type (TypeLens remounts the form but the draft still holds the previous type's header).
3. `update(next)` → `setFields(next)` then `dispatch({ type: 'replaceAll', state: adapter.compile(next, ctx) })`.
4. Header edits go through `update({ ...fields, ...patch })`.

- [ ] **Step 1: Write the failing test**

```tsx
// features/transactions/entry/typeForms/ExpenseForm.test.tsx
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { ExpenseForm } from './ExpenseForm';
import { initDraft } from '../draftReducer';

const html = (node: React.ReactNode) => renderToStaticMarkup(node);

describe('ExpenseForm', () => {
  it('renders fields seeded from an expense-shaped draft', () => {
    const draft = initDraft(
      {
        date: '2026-06-29',
        payee: 'Whole Foods',
        postings: [
          { account: 'Expenses:Groceries', amount: '42.50', currency: 'USD' },
          { account: 'Assets:Checking', amount: '-42.50', currency: 'USD' },
        ],
      },
      'USD'
    );
    const out = html(
      <ExpenseForm
        draft={draft}
        dispatch={() => {}}
        accounts={['Assets:Checking', 'Expenses:Groceries']}
        payees={['Whole Foods']}
        defaultCurrency="USD"
      />
    );
    expect(out).toContain('Whole Foods');
    expect(out).toContain('Expenses:Groceries');
    expect(out).toContain('Assets:Checking');
    expect(out).toContain('42.5');
  });

  it('renders empty fields for a fresh draft without crashing', () => {
    const out = html(
      <ExpenseForm
        draft={initDraft({ date: '2026-06-29' }, 'USD')}
        dispatch={() => {}}
        accounts={[]}
        payees={[]}
        defaultCurrency="USD"
      />
    );
    expect(out).toContain('Spent on');
    expect(out).toContain('Paid from');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test features/transactions/entry/typeForms/ExpenseForm.test.tsx`
Expected: FAIL — `Cannot find module './ExpenseForm'`.

- [ ] **Step 3: Write the implementation**

```tsx
// features/transactions/entry/typeForms/ExpenseForm.tsx
'use client';

import React, { useMemo, useState } from 'react';
import AmountInput from '../../AmountInput';
import type { DraftAction, DraftState } from '../draftReducer';
import { headerOf } from '../types/adapter';
import { expenseAdapter, type ExpenseFields } from '../types/expense';
import { Field, SectionLabel, AccountField } from './fields';
import { HeaderFieldsEditor } from './HeaderFields';
import { Input } from '@/components/ui/input';

export type TypeFormProps = {
  draft: DraftState;
  dispatch: (a: DraftAction) => void;
  accounts: string[];
  payees: string[];
  defaultCurrency: string;
};

export function ExpenseForm({
  draft,
  dispatch,
  accounts,
  payees,
  defaultCurrency,
}: TypeFormProps): React.JSX.Element {
  const ctx = useMemo(() => ({ defaultCurrency }), [defaultCurrency]);
  const [fields, setFields] = useState<ExpenseFields>(
    () =>
      expenseAdapter.detect(draft) ?? {
        ...expenseAdapter.emptyFields(ctx),
        ...headerOf(draft),
      }
  );

  const update = (next: ExpenseFields) => {
    setFields(next);
    dispatch({ type: 'replaceAll', state: expenseAdapter.compile(next, ctx) });
  };

  return (
    <div className="grid gap-6 md:grid-cols-[minmax(240px,1fr)_1.6fr] md:gap-8 lg:grid-cols-[minmax(280px,360px)_1fr]">
      <HeaderFieldsEditor
        header={fields}
        payees={payees}
        onChange={(patch) => update({ ...fields, ...patch })}
      />

      <section className="flex flex-col gap-5 md:border-l md:border-border md:pl-8">
        <SectionLabel>Expense</SectionLabel>

        <Field label="Amount">
          <div className="flex gap-2">
            <AmountInput
              value={fields.amount}
              onChange={(amount) => update({ ...fields, amount })}
              placeholder="Amount"
              className="flex-1 text-right tabular-nums"
            />
            <Input
              type="text"
              value={fields.currency}
              onChange={(e) => update({ ...fields, currency: e.target.value })}
              placeholder="Currency"
              className="w-24"
            />
          </div>
        </Field>

        <AccountField
          label="Paid from"
          role={['asset', 'liability']}
          accounts={accounts}
          value={fields.paidFrom}
          onChange={(paidFrom) => update({ ...fields, paidFrom })}
        />

        <AccountField
          label="Spent on"
          role="expense"
          accounts={accounts}
          value={fields.spentOn}
          onChange={(spentOn) => update({ ...fields, spentOn })}
        />
      </section>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test features/transactions/entry/typeForms/ExpenseForm.test.tsx`
Expected: PASS.

- [ ] **Step 5: Type-check and commit**

```bash
pnpm type-check
git add features/transactions/entry/typeForms/ExpenseForm.tsx features/transactions/entry/typeForms/ExpenseForm.test.tsx
git commit -m "feat(transactions): expense type form"
```

---

### Task 5: IncomeForm and TransferForm

Two near-identical forms following the ExpenseForm contract.

**Files:**
- Create: `features/transactions/entry/typeForms/IncomeForm.tsx`
- Create: `features/transactions/entry/typeForms/IncomeForm.test.tsx`
- Create: `features/transactions/entry/typeForms/TransferForm.tsx`
- Create: `features/transactions/entry/typeForms/TransferForm.test.tsx`

**Interfaces:**
- Consumes: `TypeFormProps` from `./ExpenseForm`; `incomeAdapter`/`IncomeFields` from `../types/income`; `transferAdapter`/`TransferFields` from `../types/transfer`; same shared UI modules as Task 4.
- Produces: `IncomeForm(props: TypeFormProps)`, `TransferForm(props: TypeFormProps)`.

> Confirmed field names: `IncomeFields = { amount, currency, receivedInto (asset), from (income) }`; `TransferFields = { amount, currency, from, to (both asset/liability) }`. Note income's income-account field is named `from`, labelled "Source".

- [ ] **Step 1: Write the failing IncomeForm test**

```tsx
// features/transactions/entry/typeForms/IncomeForm.test.tsx
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { IncomeForm } from './IncomeForm';
import { initDraft } from '../draftReducer';

const html = (node: React.ReactNode) => renderToStaticMarkup(node);

describe('IncomeForm', () => {
  it('renders income fields for a fresh draft', () => {
    const out = html(
      <IncomeForm
        draft={initDraft({ date: '2026-06-29' }, 'USD')}
        dispatch={() => {}}
        accounts={[]}
        payees={[]}
        defaultCurrency="USD"
      />
    );
    expect(out).toContain('Received into');
    expect(out).toContain('Source');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test features/transactions/entry/typeForms/IncomeForm.test.tsx`
Expected: FAIL — `Cannot find module './IncomeForm'`.

- [ ] **Step 3: Write IncomeForm**

Read `../types/income.ts` for the exact `IncomeFields` field names, then mirror ExpenseForm. The income posting (source) has role `income`; the deposit (received into) has role `asset`. Section label `Income`. Example body (adjust field names to match the adapter):

```tsx
// features/transactions/entry/typeForms/IncomeForm.tsx
'use client';

import React, { useMemo, useState } from 'react';
import AmountInput from '../../AmountInput';
import { headerOf } from '../types/adapter';
import { incomeAdapter, type IncomeFields } from '../types/income';
import type { TypeFormProps } from './ExpenseForm';
import { Field, SectionLabel, AccountField } from './fields';
import { HeaderFieldsEditor } from './HeaderFields';
import { Input } from '@/components/ui/input';

export function IncomeForm({
  draft,
  dispatch,
  accounts,
  payees,
  defaultCurrency,
}: TypeFormProps): React.JSX.Element {
  const ctx = useMemo(() => ({ defaultCurrency }), [defaultCurrency]);
  const [fields, setFields] = useState<IncomeFields>(
    () =>
      incomeAdapter.detect(draft) ?? {
        ...incomeAdapter.emptyFields(ctx),
        ...headerOf(draft),
      }
  );
  const update = (next: IncomeFields) => {
    setFields(next);
    dispatch({ type: 'replaceAll', state: incomeAdapter.compile(next, ctx) });
  };

  return (
    <div className="grid gap-6 md:grid-cols-[minmax(240px,1fr)_1.6fr] md:gap-8 lg:grid-cols-[minmax(280px,360px)_1fr]">
      <HeaderFieldsEditor
        header={fields}
        payees={payees}
        onChange={(patch) => update({ ...fields, ...patch })}
      />
      <section className="flex flex-col gap-5 md:border-l md:border-border md:pl-8">
        <SectionLabel>Income</SectionLabel>
        <Field label="Amount">
          <div className="flex gap-2">
            <AmountInput
              value={fields.amount}
              onChange={(amount) => update({ ...fields, amount })}
              placeholder="Amount"
              className="flex-1 text-right tabular-nums"
            />
            <Input
              type="text"
              value={fields.currency}
              onChange={(e) => update({ ...fields, currency: e.target.value })}
              placeholder="Currency"
              className="w-24"
            />
          </div>
        </Field>
        <AccountField
          label="Received into"
          role="asset"
          accounts={accounts}
          value={fields.receivedInto}
          onChange={(receivedInto) => update({ ...fields, receivedInto })}
        />
        <AccountField
          label="Source"
          role="income"
          accounts={accounts}
          value={fields.from}
          onChange={(from) => update({ ...fields, from })}
        />
      </section>
    </div>
  );
}
```

If the adapter's field names differ from `receivedInto`/`source`/`amount`/`currency`, use the adapter's actual names (TypeScript will flag mismatches at Step 6).

- [ ] **Step 4: Write the failing TransferForm test**

```tsx
// features/transactions/entry/typeForms/TransferForm.test.tsx
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { TransferForm } from './TransferForm';
import { initDraft } from '../draftReducer';

const html = (node: React.ReactNode) => renderToStaticMarkup(node);

describe('TransferForm', () => {
  it('renders from/to fields for a fresh draft', () => {
    const out = html(
      <TransferForm
        draft={initDraft({ date: '2026-06-29' }, 'USD')}
        dispatch={() => {}}
        accounts={[]}
        payees={[]}
        defaultCurrency="USD"
      />
    );
    expect(out).toContain('From');
    expect(out).toContain('To');
  });
});
```

- [ ] **Step 5: Write TransferForm**

Read `../types/transfer.ts` for the exact `TransferFields` field names, then mirror the structure with both account fields role `['asset', 'liability']`, section label `Transfer`, a single amount/currency. Use `transferAdapter`/`TransferFields`.

- [ ] **Step 6: Run tests + type-check**

Run: `pnpm test features/transactions/entry/typeForms/IncomeForm.test.tsx features/transactions/entry/typeForms/TransferForm.test.tsx && pnpm type-check`
Expected: PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
git add features/transactions/entry/typeForms/IncomeForm.tsx features/transactions/entry/typeForms/IncomeForm.test.tsx features/transactions/entry/typeForms/TransferForm.tsx features/transactions/entry/typeForms/TransferForm.test.tsx
git commit -m "feat(transactions): income and transfer type forms"
```

---

### Task 6: ExchangeForm

The two-sided (gave / got) form.

**Files:**
- Create: `features/transactions/entry/typeForms/ExchangeForm.tsx`
- Create: `features/transactions/entry/typeForms/ExchangeForm.test.tsx`

**Interfaces:**
- Consumes: `TypeFormProps` from `./ExpenseForm`; `exchangeAdapter`/`ExchangeFields` from `../types/exchange` (fields: `gaveAmount`, `gaveCurrency`, `gaveFrom`, `gotAmount`, `gotCurrency`, `gotInto`); same shared UI modules.
- Produces: `ExchangeForm(props: TypeFormProps)`.

- [ ] **Step 1: Write the failing test**

```tsx
// features/transactions/entry/typeForms/ExchangeForm.test.tsx
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { ExchangeForm } from './ExchangeForm';
import { initDraft } from '../draftReducer';

const html = (node: React.ReactNode) => renderToStaticMarkup(node);

describe('ExchangeForm', () => {
  it('renders gave/got sections for a fresh draft', () => {
    const out = html(
      <ExchangeForm
        draft={initDraft({ date: '2026-06-29' }, 'USD')}
        dispatch={() => {}}
        accounts={[]}
        payees={[]}
        defaultCurrency="USD"
      />
    );
    expect(out).toContain('Gave');
    expect(out).toContain('Got');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test features/transactions/entry/typeForms/ExchangeForm.test.tsx`
Expected: FAIL — `Cannot find module './ExchangeForm'`.

- [ ] **Step 3: Write the implementation**

```tsx
// features/transactions/entry/typeForms/ExchangeForm.tsx
'use client';

import React, { useMemo, useState } from 'react';
import AmountInput from '../../AmountInput';
import { headerOf } from '../types/adapter';
import { exchangeAdapter, type ExchangeFields } from '../types/exchange';
import type { TypeFormProps } from './ExpenseForm';
import { Field, SectionLabel, AccountField } from './fields';
import { HeaderFieldsEditor } from './HeaderFields';
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
```

- [ ] **Step 4: Run test + type-check**

Run: `pnpm test features/transactions/entry/typeForms/ExchangeForm.test.tsx && pnpm type-check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add features/transactions/entry/typeForms/ExchangeForm.tsx features/transactions/entry/typeForms/ExchangeForm.test.tsx
git commit -m "feat(transactions): exchange type form"
```

---

### Task 7: `getAccountBalance` server action + pure parser

The fix-balance preview backend. The pure parser is the tested core; the server action is a thin `runLedger` wrapper.

**Files:**
- Create: `features/transactions/entry/typeForms/fixBalancePreview.ts` (pure)
- Create: `features/transactions/entry/typeForms/fixBalancePreview.test.ts`
- Create: `features/transactions/entry/actions/getAccountBalance.ts` (server action)

**Interfaces:**
- Consumes: `parseBalanceRows` from `@/lib/balance/parse`; `runLedger` from `@/utils/runLedger`.
- Produces:
  - `extractAccountBalance(stdout: string, account: string): string` — the numeric balance string (e.g. `"1240.00"`, `"-50"`) for `account` from `ledger balance --format '%A|%T\n'` output, or `"0"` when absent. Strips thousands separators and any commodity token.
  - `getAccountBalance(account: string, currency: string): Promise<string>` — server action; runs ledger converted to `currency`, returns `extractAccountBalance(...)`, `"0"` on any error.

- [ ] **Step 1: Write the failing parser test**

```ts
// features/transactions/entry/typeForms/fixBalancePreview.test.ts
import { describe, it, expect } from 'vitest';
import { extractAccountBalance } from './fixBalancePreview';

describe('extractAccountBalance', () => {
  it('extracts the numeric balance for the matching account', () => {
    const stdout = 'Assets:Cash|1,240.00 USD\n';
    expect(extractAccountBalance(stdout, 'Assets:Cash')).toBe('1240.00');
  });

  it('handles negative balances and a leading symbol', () => {
    const stdout = 'Liabilities:Card|$-50.00\n';
    expect(extractAccountBalance(stdout, 'Liabilities:Card')).toBe('-50.00');
  });

  it('returns "0" when the account is absent', () => {
    expect(extractAccountBalance('', 'Assets:Cash')).toBe('0');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test features/transactions/entry/typeForms/fixBalancePreview.test.ts`
Expected: FAIL — `Cannot find module './fixBalancePreview'`.

- [ ] **Step 3: Write the parser**

```ts
// features/transactions/entry/typeForms/fixBalancePreview.ts
import { parseBalanceRows } from '@/lib/balance/parse';

/** Strip thousands separators and any non-numeric commodity token. */
const toNumber = (raw: string): string => {
  const cleaned = raw.replace(/,/g, '').replace(/[^0-9.\-]/g, '');
  return cleaned === '' || cleaned === '-' ? '0' : cleaned;
};

export const extractAccountBalance = (
  stdout: string,
  account: string
): string => {
  const row = parseBalanceRows(stdout).find((r) => r.account === account);
  return row ? toNumber(row.amount) : '0';
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test features/transactions/entry/typeForms/fixBalancePreview.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the server action**

```ts
// features/transactions/entry/actions/getAccountBalance.ts
'use server';

import { extractAccountBalance } from '../typeForms/fixBalancePreview';
import runLedger from '@/utils/runLedger';

export async function getAccountBalance(
  account: string,
  currency: string
): Promise<string> {
  if (!account.trim()) return '0';
  try {
    const stdout = await runLedger([
      'balance',
      account,
      '-X',
      currency,
      '--no-total',
      '--collapse',
      '--format',
      '%A|%T\n',
    ]);
    return extractAccountBalance(stdout, account);
  } catch {
    return '0';
  }
}
```

- [ ] **Step 6: Type-check and commit**

```bash
pnpm type-check
git add features/transactions/entry/typeForms/fixBalancePreview.ts features/transactions/entry/typeForms/fixBalancePreview.test.ts features/transactions/entry/actions/getAccountBalance.ts
git commit -m "feat(transactions): account-balance lookup for fix-balance preview"
```

> Manual-verification note (do in Task 11's manual pass): the exact `ledger balance` flags (`-X`, `--collapse`) may need tuning against the real CLI so a single numeric balance comes back for the chosen account/currency. The parser test is canned and unaffected; verify the live number in the running app.

---

### Task 8: FixBalanceForm (with live preview)

**Files:**
- Create: `features/transactions/entry/typeForms/FixBalanceForm.tsx`
- Create: `features/transactions/entry/typeForms/FixBalanceForm.test.tsx`

**Interfaces:**
- Consumes: `TypeFormProps` from `./ExpenseForm` **extended** with `getAccountBalance`; `fixBalanceAdapter`/`FixBalanceFields` from `../types/fixBalance` (fields: `account`, `targetAmount`, `targetCurrency`); shared UI modules.
- Produces: `FixBalanceFormProps = TypeFormProps & { getAccountBalance: (account: string, currency: string) => Promise<string> }` and `FixBalanceForm(props)`.

Behavior: on account/currency change, debounce ~300ms, call `getAccountBalance`, store the current balance, and render `now / target / implied adjustment (target − current)`. A monotonically increasing request-id ref discards stale responses. The preview never gates submit; the compiled draft is assertion + blank equity (the adapter's job).

- [ ] **Step 1: Write the failing test** (static smoke — the async preview isn't exercised under `renderToStaticMarkup`, so pass a stub)

```tsx
// features/transactions/entry/typeForms/FixBalanceForm.test.tsx
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { FixBalanceForm } from './FixBalanceForm';
import { initDraft } from '../draftReducer';

const html = (node: React.ReactNode) => renderToStaticMarkup(node);

describe('FixBalanceForm', () => {
  it('renders account and target fields for a fresh draft', () => {
    const out = html(
      <FixBalanceForm
        draft={initDraft({ date: '2026-06-29' }, 'USD')}
        dispatch={() => {}}
        accounts={['Assets:Cash']}
        payees={[]}
        defaultCurrency="USD"
        getAccountBalance={async () => '0'}
      />
    );
    expect(out).toContain('Account');
    expect(out).toContain('Target');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test features/transactions/entry/typeForms/FixBalanceForm.test.tsx`
Expected: FAIL — `Cannot find module './FixBalanceForm'`.

- [ ] **Step 3: Write the implementation**

```tsx
// features/transactions/entry/typeForms/FixBalanceForm.tsx
'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import AmountInput from '../../AmountInput';
import { headerOf } from '../types/adapter';
import { fixBalanceAdapter, type FixBalanceFields } from '../types/fixBalance';
import type { TypeFormProps } from './ExpenseForm';
import { Field, SectionLabel, AccountField } from './fields';
import { HeaderFieldsEditor } from './HeaderFields';
import { Input } from '@/components/ui/input';

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
    dispatch({ type: 'replaceAll', state: fixBalanceAdapter.compile(next, ctx) });
  };

  useEffect(() => {
    const account = fields.account.trim();
    if (!account) {
      setCurrent(null);
      return;
    }
    const id = ++reqId.current;
    setCurrent(null);
    const t = setTimeout(() => {
      void getAccountBalance(account, fields.targetCurrency).then((bal) => {
        if (id === reqId.current) setCurrent(bal);
      });
    }, 300);
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
            <Input
              type="text"
              value={fields.targetCurrency}
              onChange={(e) =>
                update({ ...fields, targetCurrency: e.target.value })
              }
              placeholder="Currency"
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
```

- [ ] **Step 4: Run test + type-check**

Run: `pnpm test features/transactions/entry/typeForms/FixBalanceForm.test.tsx && pnpm type-check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add features/transactions/entry/typeForms/FixBalanceForm.tsx features/transactions/entry/typeForms/FixBalanceForm.test.tsx
git commit -m "feat(transactions): fix-balance type form with live adjustment preview"
```

---

### Task 9: TypeLens shell

The chip row + state model that selects and renders the active form.

**Files:**
- Create: `features/transactions/entry/TypeLens.tsx`
- Create: `features/transactions/entry/TypeLens.test.tsx`

**Interfaces:**
- Consumes: `TYPE_ADAPTERS`, `detectType` from `./types/registry`; `isEmptyDraft` from `./typeForms/isEmptyDraft`; the five form components; `TypeFormProps` from `./typeForms/ExpenseForm`; `Button` from `@/components/ui/button`.
- Produces: `TypeLens(props: TypeFormProps & { getAccountBalance })`.

State model:
- `detected = detectType(draft)`; `empty = isEmptyDraft(draft)`.
- `picked` (user chip click) overrides; `selectedId = picked ?? detected?.id ?? null`.
- Chips disabled when `!empty && !detected` (no-match → greyed). When disabled and nothing picked, render the "use Form or Raw" notice.
- When `empty && selectedId === null`, render a "Pick a type" prompt.
- Otherwise render `FORM_BY_ID[selectedId]` with `key={selectedId}` so a chip switch remounts and reseeds.

- [ ] **Step 1: Write the failing test**

```tsx
// features/transactions/entry/TypeLens.test.tsx
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { TypeLens } from './TypeLens';
import { initDraft } from './draftReducer';

const html = (node: React.ReactNode) => renderToStaticMarkup(node);
const base = {
  dispatch: () => {},
  accounts: ['Assets:Checking', 'Expenses:Food'],
  payees: [],
  defaultCurrency: 'USD',
  getAccountBalance: async () => '0',
};

describe('TypeLens', () => {
  it('shows a pick-a-type prompt for an empty draft', () => {
    const out = html(
      <TypeLens draft={initDraft({ date: '2026-06-29' }, 'USD')} {...base} />
    );
    expect(out).toContain('Pick a type');
    expect(out).toContain('Expense');
  });

  it('renders the matching form for an expense-shaped draft', () => {
    const draft = initDraft(
      {
        date: '2026-06-29',
        payee: 'Cafe',
        postings: [
          { account: 'Expenses:Food', amount: '5', currency: 'USD' },
          { account: 'Assets:Checking', amount: '-5', currency: 'USD' },
        ],
      },
      'USD'
    );
    const out = html(<TypeLens draft={draft} {...base} />);
    expect(out).toContain('Spent on');
  });

  it('greys chips and shows a notice for an unrecognized shape', () => {
    const draft = initDraft(
      {
        date: '2026-06-29',
        payee: 'Split',
        postings: [
          { account: 'Expenses:Food', amount: '5', currency: 'USD' },
          { account: 'Expenses:Fun', amount: '5', currency: 'USD' },
          { account: 'Assets:Checking', amount: '-10', currency: 'USD' },
        ],
      },
      'USD'
    );
    const out = html(<TypeLens draft={draft} {...base} />);
    expect(out).toContain('Form or Raw');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test features/transactions/entry/TypeLens.test.tsx`
Expected: FAIL — `Cannot find module './TypeLens'`.

- [ ] **Step 3: Write the implementation**

```tsx
// features/transactions/entry/TypeLens.tsx
'use client';

import React, { useState } from 'react';
import { ExchangeForm } from './typeForms/ExchangeForm';
import { ExpenseForm, type TypeFormProps } from './typeForms/ExpenseForm';
import { FixBalanceForm } from './typeForms/FixBalanceForm';
import { IncomeForm } from './typeForms/IncomeForm';
import { TransferForm } from './typeForms/TransferForm';
import { isEmptyDraft } from './typeForms/isEmptyDraft';
import { TYPE_ADAPTERS, detectType } from './types/registry';
import { Button } from '@/components/ui/button';

type Props = TypeFormProps & {
  getAccountBalance: (account: string, currency: string) => Promise<string>;
};

export function TypeLens(props: Props): React.JSX.Element {
  const { draft, getAccountBalance, ...formProps } = props;
  const detected = detectType(draft);
  const empty = isEmptyDraft(draft);
  const [picked, setPicked] = useState<string | null>(null);

  const selectedId = picked ?? detected?.id ?? null;
  const chipsDisabled = !empty && !detected;

  const renderForm = () => {
    const shared = { draft, ...formProps };
    switch (selectedId) {
      case 'expense':
        return <ExpenseForm key="expense" {...shared} />;
      case 'income':
        return <IncomeForm key="income" {...shared} />;
      case 'transfer':
        return <TransferForm key="transfer" {...shared} />;
      case 'exchange':
        return <ExchangeForm key="exchange" {...shared} />;
      case 'fix-balance':
        return (
          <FixBalanceForm
            key="fix-balance"
            {...shared}
            getAccountBalance={getAccountBalance}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap gap-2">
        {TYPE_ADAPTERS.map((a) => (
          <Button
            key={a.id}
            type="button"
            size="sm"
            variant={selectedId === a.id ? 'default' : 'outline'}
            disabled={chipsDisabled}
            onClick={() => setPicked(a.id)}
          >
            <span aria-hidden className="mr-1">
              {a.icon}
            </span>
            {a.label}
          </Button>
        ))}
      </div>

      {chipsDisabled ? (
        <p className="text-sm text-muted-foreground">
          This transaction&apos;s shape doesn&apos;t map to a quick type — edit
          it in the Form or Raw tab.
        </p>
      ) : selectedId === null ? (
        <p className="text-sm text-muted-foreground">
          Pick a type to start a guided entry.
        </p>
      ) : (
        renderForm()
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test + type-check**

Run: `pnpm test features/transactions/entry/TypeLens.test.tsx && pnpm type-check`
Expected: PASS. (The `Button` variant strings must match the project's button variants — if `'default'`/`'outline'` aren't valid, read `@/components/ui/button` and use the actual variant names.)

- [ ] **Step 5: Commit**

```bash
git add features/transactions/entry/TypeLens.tsx features/transactions/entry/TypeLens.test.tsx
git commit -m "feat(transactions): TypeLens shell with chips and detect-driven selection"
```

---

### Task 10: Wire the Types tab into the shell

Register Types first, compute the initial tab, render TypeLens, and thread `getAccountBalance` from the server components.

**Files:**
- Modify: `features/transactions/entry/TransactionEntry.tsx`
- Modify: `features/transactions/entry/TransactionEntry.test.tsx`
- Modify: `features/transactions/NewTransaction.tsx`
- Modify: `features/transactions/EditTransaction.tsx`

**Interfaces:**
- Consumes: `TypeLens` from `./TypeLens`; `detectType` from `./types/registry`; `getAccountBalance` from `./actions/getAccountBalance`.
- Produces: `TransactionEntryProps` gains `getAccountBalance: (account: string, currency: string) => Promise<string>`.

- [ ] **Step 1: Update the TransactionEntry test first**

Add to `features/transactions/entry/TransactionEntry.test.tsx` a case asserting the Types tab renders and is the default in create mode. Match the existing test's render helper and props; add:

```tsx
it('shows Types as the first tab and defaults to it in create mode', () => {
  const out = html(
    <TransactionEntry
      accounts={[]}
      payees={[]}
      defaultCurrency="USD"
      submitAction={async () => ({ ok: false })}
      getAccountBalance={async () => '0'}
    />
  );
  expect(out).toContain('Types');
  // Types is default → its "Pick a type" prompt is present on first render.
  expect(out).toContain('Pick a type');
});
```

(If the existing tests construct a shared `props` object, add `getAccountBalance: async () => '0'` to it so they keep compiling.)

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test features/transactions/entry/TransactionEntry.test.tsx`
Expected: FAIL — missing `getAccountBalance` prop / no "Types".

- [ ] **Step 3: Wire TransactionEntry**

In `features/transactions/entry/TransactionEntry.tsx`:

Add imports:
```tsx
import { TypeLens } from './TypeLens';
import { detectType } from './types/registry';
import { getAccountBalance as defaultGetAccountBalance } from './actions/getAccountBalance';
```

Add `getAccountBalance` to `TransactionEntryProps`:
```tsx
  getAccountBalance?: (account: string, currency: string) => Promise<string>;
```

Register Types first:
```tsx
const TABS = [
  { id: 'types', label: 'Types' },
  { id: 'form', label: 'Form' },
  { id: 'raw', label: 'Raw' },
];
```

Replace the `const [active, setActive] = useState('form');` initializer with a draft-aware one (place it right after the `useReducer` that creates `draft`):
```tsx
const [active, setActive] = useState(() =>
  mode === 'edit' && !detectType(draft) ? 'form' : 'types'
);
```

Render TypeLens before the Form block inside the tab area:
```tsx
{active === 'types' && (
  <TypeLens
    draft={draft}
    dispatch={dispatch}
    accounts={accounts}
    payees={payees}
    defaultCurrency={defaultCurrency}
    getAccountBalance={getAccountBalance ?? defaultGetAccountBalance}
  />
)}
```

Add `getAccountBalance` to the destructured props of the component signature.

- [ ] **Step 4: Thread the prop from the server components**

In `features/transactions/NewTransaction.tsx` add the import and pass the prop:
```tsx
import { getAccountBalance } from './entry/actions/getAccountBalance';
```
```tsx
      <TransactionEntry
        accounts={accounts}
        payees={payees}
        defaultCurrency={defaultCurrency}
        submitAction={createTransactionAction}
        getAccountBalance={getAccountBalance}
        initialDraft={initialDraft}
        templateMissing={templateMissing}
      />
```

Do the same in `features/transactions/EditTransaction.tsx` (add the same import and `getAccountBalance={getAccountBalance}` prop on its `<TransactionEntry … />`). Read the file first to place the prop alongside the existing ones.

- [ ] **Step 5: Run tests + type-check**

Run: `pnpm test features/transactions/entry && pnpm type-check`
Expected: PASS across the entry suite.

- [ ] **Step 6: Commit**

```bash
git add features/transactions/entry/TransactionEntry.tsx features/transactions/entry/TransactionEntry.test.tsx features/transactions/NewTransaction.tsx features/transactions/EditTransaction.tsx
git commit -m "feat(transactions): mount Types tab as the default entry lens"
```

---

### Task 11: Carried Phase-1 cleanup + full verification

Fold in the roadmap's carried cleanup (both files are now in scope) and do the end-to-end manual pass.

**Files:**
- Modify: `features/transactions/entry/TabBar.test.tsx`
- Modify: `features/transactions/entry/TransactionEntry.tsx` (import `SubmitAction` from actions instead of re-declaring)
- Modify: `features/transactions/actions/types.ts` (or wherever `SubmitAction`/`TransactionActionState` live) if `SubmitAction` is not yet exported

- [ ] **Step 1: Add TabBar a11y assertions**

In `features/transactions/entry/TabBar.test.tsx`, add a test asserting the tablist/tab roles and that inactive tabs carry `aria-selected="false"`:

```tsx
it('marks inactive tabs aria-selected="false" and uses tablist/tab roles', () => {
  const out = html(
    <TabBar
      tabs={[
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
      ]}
      active="a"
      onSelect={() => {}}
    />
  );
  expect(out).toContain('role="tablist"');
  expect(out).toContain('role="tab"');
  expect(out).toContain('aria-selected="false"');
});
```

Run: `pnpm test features/transactions/entry/TabBar.test.tsx`
If it fails because `TabBar` lacks these roles/attributes, add them in `TabBar.tsx` (wrap in `role="tablist"`, each button `role="tab"` with `aria-selected={id === active}`), then re-run to green.

- [ ] **Step 2: Home the `SubmitAction` type**

Confirm `SubmitAction` is exported from `features/transactions/actions` (check `actions/types.ts` and `actions/index.ts`; export it if not). In `TransactionEntry.tsx`, remove any local `SubmitAction` re-declaration and rely on the existing `import type { SubmitAction, … } from '../actions'`.

Run: `pnpm type-check`
Expected: no errors.

- [ ] **Step 3: Full suite**

Run: `pnpm test`
Expected: PASS (whole suite).

- [ ] **Step 4: Lint**

Run: `pnpm lint`
Expected: clean.

- [ ] **Step 5: Manual pass in the running app**

Run: `pnpm dev`, open `/transactions/new`. Verify:
- Types is the default tab; chips render; picking Expense shows its form; typing fills the shared draft (switch to Form/Raw to confirm the postings appear).
- Switching chips preserves the date/payee.
- Fix balance: pick an account → the "Now: …" balance loads; entering a target shows the implied adjustment; saving writes an assertion + `Equity:Adjustments`.
- Editing an existing expense opens on the Types tab with the Expense form populated; editing a 3-way split opens on Form (or shows the no-match notice under Types).
- Tune the `getAccountBalance` ledger flags here if the live number looks wrong.

- [ ] **Step 6: Commit**

```bash
git add features/transactions/entry/TabBar.tsx features/transactions/entry/TabBar.test.tsx features/transactions/entry/TransactionEntry.tsx features/transactions/actions
git commit -m "chore(transactions): tab a11y assertions and home SubmitAction type"
```

---

## Self-Review Notes

- **Spec coverage:** TypeLens + chips (Task 9), five forms (Tasks 4–6, 8), role-filtered full-path account fields (Task 1 `AccountField`), Types-first + initial-tab detect (Task 10), fix-balance live preview + server action (Tasks 7–8), `fields.tsx` refactor (Task 1), carried cleanup (Task 11). All spec sections map to a task.
- **Adapter field names:** Tasks 5 (income/transfer) flag that exact `*Fields` property names must be read from the adapter source before writing; TypeScript verifies at each type-check step.
- **`unknown` typing:** every form imports its own typed adapter; TypeLens only reads `detectType(draft).id` (string) and maps by id — no casts.
- **Header preservation on type switch** is handled by seeding `{ ...emptyFields(ctx), ...headerOf(draft) }` plus the `key={selectedId}` remount in TypeLens.
- **UI variant/role names** (`Button` variants in Task 9; `ToggleGroup` props in Task 3) are copied from `FormLens.tsx`'s existing usage; if any differ, read the component and adjust — flagged inline.
