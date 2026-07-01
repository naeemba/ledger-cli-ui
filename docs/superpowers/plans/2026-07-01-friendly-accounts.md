# Friendly Accounts Section Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-render the Accounts list so non-ledger users understand it — grouped into "Accounts" and "Categories" buckets, with friendly balances (magnitude + direction arrow + color, plus an exception chip on reversed balances) and a collapsible tree.

**Architecture:** Presentation-layer only. The server component fetches per-node balances via ledger's *tree-mode* `balance` (no `--flat`), which emits every account node — real and synthetic parents — with the correct hierarchical rollup already computed. Pure helper modules turn `(role, signedBalance)` into a direction/chip and parse ledger amount strings; client components build the bucketed tree, filter on search, and manage collapse state. No journal, ledger-command, or data-model changes beyond swapping the read query.

**Tech Stack:** Next.js (App Router, RSC), React client components, TypeScript, Tailwind (design tokens in `app/globals.css`), Vitest (+ `react-dom/server` `renderToStaticMarkup` for component tests — no testing-library in this repo).

## Global Constraints

- **Presentation-only.** Do not modify the journal, ledger write paths, or `runLedger` internals. The only backend change is the read query in `features/accounts/Accounts.tsx`.
- **Colors:** use existing Tailwind tokens `text-positive` (green) and `text-negative` (red). Never hardcode hex.
- **Roles come from** `classifyAccount(account)` in `features/transactions/entry/types/accountRole.ts` (`asset | liability | income | expense | equity | unknown`). Do not infer account subtypes from names.
- **Tests co-located** as `<name>.test.ts(x)` next to source; run with `pnpm test`. Component tests use `renderToStaticMarkup` from `react-dom/server` and assert on the returned HTML string (see `utils/formatAmount.test.tsx` for the pattern).
- **No AI/tool attribution** in commits or comments.
- **Chip vocabulary (exact strings):** `owed to you`, `overdrawn`, `reduced`, `refunded`.

---

## File Structure

- **Create** `features/accounts/balanceDisplay.ts` — pure `balanceDisplay(role, signed)` → `{ direction, chip? }`.
- **Create** `features/accounts/balanceDisplay.test.ts`.
- **Create** `features/accounts/amountParts.ts` — parse a raw ledger amount string into `{ unit, magnitude, negative, signed }`.
- **Create** `features/accounts/amountParts.test.ts`.
- **Create** `features/accounts/FriendlyBalance.tsx` — renders arrow + magnitude + optional chip, colored by direction.
- **Create** `features/accounts/FriendlyBalance.test.tsx`.
- **Create** `features/accounts/accountTree.ts` — `buildAccountTree(rows)`, `bucketRoots(roots)`, `countLeaves(roots)`.
- **Create** `features/accounts/accountTree.test.ts`.
- **Create** `features/accounts/AccountTree.tsx` — recursive client tree with per-node collapse.
- **Create** `features/accounts/BucketSection.tsx` — collapsible titled section wrapper.
- **Modify** `features/accounts/AccountsView.tsx` — build buckets from rows, search filter, render sections.
- **Modify** `features/accounts/Accounts.tsx` — fetch tree-mode balances + base currency, thread rows through, update help copy.
- **Retire** `features/accounts/Accounts.utils.ts` (`buildTree`) and `features/accounts/Tree.tsx` once `AccountsView` no longer imports them (Task 7 removes them).

---

### Task 1: `balanceDisplay` — direction + chip from (role, signed balance)

**Files:**
- Create: `features/accounts/balanceDisplay.ts`
- Test: `features/accounts/balanceDisplay.test.ts`

**Interfaces:**
- Consumes: `AccountRole` from `@/features/transactions/entry/types/accountRole`.
- Produces:
  ```ts
  export type BalanceDirection = 'favor' | 'against';
  export type BalanceDisplay = { direction: BalanceDirection; chip?: string };
  export function balanceDisplay(role: AccountRole, signed: number): BalanceDisplay;
  ```

- [ ] **Step 1: Write the failing test**

```ts
// features/accounts/balanceDisplay.test.ts
import { describe, it, expect } from 'vitest';
import { balanceDisplay } from './balanceDisplay';

describe('balanceDisplay', () => {
  it('asset with money is in your favor, no chip', () => {
    expect(balanceDisplay('asset', 2340)).toEqual({ direction: 'favor' });
  });
  it('overdrawn asset is against you, with overdrawn chip', () => {
    expect(balanceDisplay('asset', -50)).toEqual({ direction: 'against', chip: 'overdrawn' });
  });
  it('liability you owe (credit balance) is against you, no chip', () => {
    expect(balanceDisplay('liability', -500)).toEqual({ direction: 'against' });
  });
  it('reversed liability (they owe you) is in your favor, with owed-to-you chip', () => {
    expect(balanceDisplay('liability', 200)).toEqual({ direction: 'favor', chip: 'owed to you' });
  });
  it('income earned (credit balance) is in your favor, no chip', () => {
    expect(balanceDisplay('income', -5000)).toEqual({ direction: 'favor' });
  });
  it('reversed income (refund/reversal) is against you, with reduced chip', () => {
    expect(balanceDisplay('income', 80)).toEqual({ direction: 'against', chip: 'reduced' });
  });
  it('expense spent (debit balance) is against you, no chip', () => {
    expect(balanceDisplay('expense', 412)).toEqual({ direction: 'against' });
  });
  it('rebated expense (credit balance) is in your favor, with refunded chip', () => {
    expect(balanceDisplay('expense', -30)).toEqual({ direction: 'favor', chip: 'refunded' });
  });
  it('zero balance is neutral (favor), no chip', () => {
    expect(balanceDisplay('liability', 0)).toEqual({ direction: 'favor' });
  });
  it('equity/unknown show direction by raw sign, no chip', () => {
    expect(balanceDisplay('equity', -1000)).toEqual({ direction: 'against' });
    expect(balanceDisplay('unknown', 20)).toEqual({ direction: 'favor' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run features/accounts/balanceDisplay.test.ts`
Expected: FAIL — cannot resolve `./balanceDisplay`.

- [ ] **Step 3: Write minimal implementation**

```ts
// features/accounts/balanceDisplay.ts
import type { AccountRole } from '@/features/transactions/entry/types/accountRole';

export type BalanceDirection = 'favor' | 'against';
export type BalanceDisplay = { direction: BalanceDirection; chip?: string };

/**
 * Turn an account's role and its signed base-currency balance into a
 * user-facing direction (favor/against) plus an optional exception chip that
 * appears only when the balance sits opposite its role's normal side.
 *
 * Normal sides: assets/expenses are debit-normal (positive is expected);
 * liabilities/income are credit-normal (ledger reports them negative).
 */
export function balanceDisplay(role: AccountRole, signed: number): BalanceDisplay {
  if (signed === 0) return { direction: 'favor' };
  switch (role) {
    case 'asset':
      return signed > 0 ? { direction: 'favor' } : { direction: 'against', chip: 'overdrawn' };
    case 'liability':
      return signed < 0 ? { direction: 'against' } : { direction: 'favor', chip: 'owed to you' };
    case 'income':
      return signed < 0 ? { direction: 'favor' } : { direction: 'against', chip: 'reduced' };
    case 'expense':
      return signed > 0 ? { direction: 'against' } : { direction: 'favor', chip: 'refunded' };
    case 'equity':
    case 'unknown':
    default:
      return signed >= 0 ? { direction: 'favor' } : { direction: 'against' };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run features/accounts/balanceDisplay.test.ts`
Expected: PASS (11 assertions).

- [ ] **Step 5: Commit**

```bash
git add features/accounts/balanceDisplay.ts features/accounts/balanceDisplay.test.ts
git commit -m "feat(accounts): add balanceDisplay direction/chip helper"
```

---

### Task 2: `parseAmountParts` — split a ledger amount string into unit/magnitude/sign

**Files:**
- Create: `features/accounts/amountParts.ts`
- Test: `features/accounts/amountParts.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  ```ts
  export type AmountParts = { unit: string; magnitude: string; negative: boolean; signed: number };
  export function parseAmountParts(raw: string): AmountParts;
  ```
- Note: follows the same unit-first convention as `utils/formatAmount.tsx` (ledger emits `"$ 1,234.50"` / `"$ -200.00"`). `magnitude` keeps ledger's original digits/grouping (no reformatting) so display precision is preserved; `signed` is the numeric value used only for sign decisions.

- [ ] **Step 1: Write the failing test**

```ts
// features/accounts/amountParts.test.ts
import { describe, it, expect } from 'vitest';
import { parseAmountParts } from './amountParts';

describe('parseAmountParts', () => {
  it('parses a positive amount with a unit', () => {
    expect(parseAmountParts('$ 3,170.00')).toEqual({
      unit: '$', magnitude: '3,170.00', negative: false, signed: 3170,
    });
  });
  it('parses a negative amount (minus after the unit)', () => {
    expect(parseAmountParts('$ -200.00')).toEqual({
      unit: '$', magnitude: '200.00', negative: true, signed: -200,
    });
  });
  it('parses a code-style unit', () => {
    expect(parseAmountParts('USD 1,000.00')).toEqual({
      unit: 'USD', magnitude: '1,000.00', negative: false, signed: 1000,
    });
  });
  it('parses a unit-less amount', () => {
    expect(parseAmountParts('42.50')).toEqual({
      unit: '', magnitude: '42.50', negative: false, signed: 42.5,
    });
  });
  it('returns empty parts for blank input', () => {
    expect(parseAmountParts('')).toEqual({ unit: '', magnitude: '', negative: false, signed: 0 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run features/accounts/amountParts.test.ts`
Expected: FAIL — cannot resolve `./amountParts`.

- [ ] **Step 3: Write minimal implementation**

```ts
// features/accounts/amountParts.ts
export type AmountParts = {
  unit: string;
  magnitude: string;
  negative: boolean;
  signed: number;
};

/**
 * Split a ledger amount string (e.g. "$ 3,170.00", "$ -200.00", "USD 1,000.00")
 * into its unit, its magnitude (ledger's original digits, sign stripped), a
 * negativity flag, and the numeric value. Unit-first, matching utils/formatAmount.
 */
export function parseAmountParts(raw: string): AmountParts {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return { unit: '', magnitude: '', negative: false, signed: 0 };

  const parts = trimmed.split(/\s+/);
  let unit = '';
  let numStr = trimmed;
  if (parts.length >= 2) {
    unit = parts[0];
    numStr = parts[1];
  }
  const negative = numStr.startsWith('-');
  const magnitude = numStr.replace(/^-/, '');
  const signed = Number(numStr.replaceAll(',', '')) || 0;
  return { unit, magnitude, negative, signed };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run features/accounts/amountParts.test.ts`
Expected: PASS (5 assertions).

- [ ] **Step 5: Commit**

```bash
git add features/accounts/amountParts.ts features/accounts/amountParts.test.ts
git commit -m "feat(accounts): add parseAmountParts ledger-amount parser"
```

---

### Task 3: `FriendlyBalance` component — arrow + magnitude + chip

**Files:**
- Create: `features/accounts/FriendlyBalance.tsx`
- Test: `features/accounts/FriendlyBalance.test.tsx`

**Interfaces:**
- Consumes: `parseAmountParts` (Task 2), `balanceDisplay` (Task 1), `AccountRole`.
- Produces: `export default function FriendlyBalance({ amount, role }: { amount: string; role: AccountRole }): JSX.Element`.

- [ ] **Step 1: Write the failing test**

```tsx
// features/accounts/FriendlyBalance.test.tsx
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import FriendlyBalance from './FriendlyBalance';

const html = (node: React.ReactNode): string => renderToStaticMarkup(node);

describe('FriendlyBalance', () => {
  it('renders an em-dash for a blank balance', () => {
    expect(html(<FriendlyBalance amount="" role="asset" />)).toContain('—');
  });
  it('shows an up arrow and positive color for an asset with money', () => {
    const out = html(<FriendlyBalance amount="$ 2,340.00" role="asset" />);
    expect(out).toContain('↑');
    expect(out).toContain('2,340.00');
    expect(out).toContain('text-positive');
    expect(out).not.toContain('text-negative');
  });
  it('shows a down arrow and negative color for a liability you owe, no chip', () => {
    const out = html(<FriendlyBalance amount="$ -500.00" role="liability" />);
    expect(out).toContain('↓');
    expect(out).toContain('500.00');
    expect(out).toContain('text-negative');
    expect(out).not.toContain('owed to you');
  });
  it('shows the owed-to-you chip for a reversed liability', () => {
    const out = html(<FriendlyBalance amount="$ 200.00" role="liability" />);
    expect(out).toContain('↑');
    expect(out).toContain('text-positive');
    expect(out).toContain('owed to you');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run features/accounts/FriendlyBalance.test.tsx`
Expected: FAIL — cannot resolve `./FriendlyBalance`.

- [ ] **Step 3: Write minimal implementation**

```tsx
// features/accounts/FriendlyBalance.tsx
import type { AccountRole } from '@/features/transactions/entry/types/accountRole';
import { parseAmountParts } from './amountParts';
import { balanceDisplay } from './balanceDisplay';

type Props = { amount: string; role: AccountRole };

const FriendlyBalance = ({ amount, role }: Props) => {
  const { unit, magnitude, signed } = parseAmountParts(amount);
  if (!magnitude) return <span className="text-muted-foreground">—</span>;

  const { direction, chip } = balanceDisplay(role, signed);
  const favorable = direction === 'favor';
  const color = favorable ? 'text-positive' : 'text-negative';
  const arrow = favorable ? '↑' : '↓';

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`font-medium tabular-nums ${color}`}>
        <span aria-hidden="true">{arrow}</span>{' '}
        {unit ? `${unit} ` : ''}
        {magnitude}
        <span className="sr-only">{favorable ? ' in your favour' : ' owed or spent'}</span>
      </span>
      {chip && (
        <span className="rounded-full bg-subtle px-2 py-0.5 text-xs text-muted-foreground">
          {chip}
        </span>
      )}
    </span>
  );
};

export default FriendlyBalance;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run features/accounts/FriendlyBalance.test.tsx`
Expected: PASS (4 assertions).

- [ ] **Step 5: Commit**

```bash
git add features/accounts/FriendlyBalance.tsx features/accounts/FriendlyBalance.test.tsx
git commit -m "feat(accounts): add FriendlyBalance display component"
```

---

### Task 4: `accountTree` — build nested nodes, bucket roots, count leaves

**Files:**
- Create: `features/accounts/accountTree.ts`
- Test: `features/accounts/accountTree.test.ts`

**Interfaces:**
- Consumes: `BalanceRow` from `@/lib/balance/parse` (`{ account: string; amount: string }`); `classifyAccount`, `AccountRole`.
- Produces:
  ```ts
  export type AccountNode = {
    name: string;    // leaf segment, e.g. "Checking"
    path: string;    // full colon path, e.g. "Assets:Bank:Checking"
    amount: string;  // raw ledger amount for THIS node, '' if ledger emitted none
    role: AccountRole;
    children: AccountNode[];
  };
  export type BucketKey = 'accounts' | 'categories' | 'advanced';
  export type Bucket = { key: BucketKey; title: string; roots: AccountNode[] };
  export function buildAccountTree(rows: BalanceRow[]): AccountNode[]; // roots, children sorted by name
  export function bucketRoots(roots: AccountNode[]): Bucket[];         // always 3 buckets, in fixed order
  export function countLeaves(roots: AccountNode[]): number;
  ```
- Notes: `bucketRoots` maps `asset|liability → accounts`, `income|expense → categories`, `equity|unknown → advanced`; always returns the three buckets in order `[accounts, categories, advanced]` (a bucket may have empty `roots`). Root order within a bucket is alphabetical by `name`.

- [ ] **Step 1: Write the failing test**

```ts
// features/accounts/accountTree.test.ts
import { describe, it, expect } from 'vitest';
import { buildAccountTree, bucketRoots, countLeaves } from './accountTree';

const rows = [
  { account: 'Assets', amount: '$ 3,150.00' },
  { account: 'Assets:Bank', amount: '$ 3,170.00' },
  { account: 'Assets:Bank:Checking', amount: '$ 3,150.00' },
  { account: 'Assets:Cash', amount: '$ -20.00' },
  { account: 'Liabilities:CreditCard', amount: '$ -30.00' },
  { account: 'Income:Salary', amount: '$ -2,000.00' },
  { account: 'Expenses:Food:Dining', amount: '$ 30.00' },
  { account: 'Equity:Opening', amount: '$ -1,000.00' },
];

describe('buildAccountTree', () => {
  it('nests by colon segments and attaches each node its own amount', () => {
    const roots = buildAccountTree(rows);
    const assets = roots.find((r) => r.path === 'Assets')!;
    expect(assets.amount).toBe('$ 3,150.00');
    expect(assets.role).toBe('asset');
    const bank = assets.children.find((c) => c.name === 'Bank')!;
    expect(bank.path).toBe('Assets:Bank');
    expect(bank.amount).toBe('$ 3,170.00');
    expect(bank.children.map((c) => c.name)).toEqual(['Checking']);
  });

  it('synthesises missing parent nodes with empty amount', () => {
    const roots = buildAccountTree([
      { account: 'Expenses:Food:Dining', amount: '$ 30.00' },
    ]);
    const expenses = roots.find((r) => r.path === 'Expenses')!;
    expect(expenses.amount).toBe('');
    expect(expenses.children[0].name).toBe('Food');
  });
});

describe('bucketRoots', () => {
  it('groups roots into accounts / categories / advanced in fixed order', () => {
    const buckets = bucketRoots(buildAccountTree(rows));
    expect(buckets.map((b) => b.key)).toEqual(['accounts', 'categories', 'advanced']);
    const byKey = Object.fromEntries(buckets.map((b) => [b.key, b.roots.map((r) => r.name)]));
    expect(byKey.accounts).toEqual(['Assets', 'Liabilities']);
    expect(byKey.categories).toEqual(['Expenses', 'Income']);
    expect(byKey.advanced).toEqual(['Equity']);
  });
});

describe('countLeaves', () => {
  it('counts only nodes without children', () => {
    // leaves: Assets:Bank:Checking, Assets:Cash, Liabilities:CreditCard,
    //         Income:Salary, Expenses:Food:Dining, Equity:Opening = 6
    expect(countLeaves(buildAccountTree(rows))).toBe(6);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run features/accounts/accountTree.test.ts`
Expected: FAIL — cannot resolve `./accountTree`.

- [ ] **Step 3: Write minimal implementation**

```ts
// features/accounts/accountTree.ts
import {
  classifyAccount,
  type AccountRole,
} from '@/features/transactions/entry/types/accountRole';
import type { BalanceRow } from '@/lib/balance/parse';

export type AccountNode = {
  name: string;
  path: string;
  amount: string;
  role: AccountRole;
  children: AccountNode[];
};

export type BucketKey = 'accounts' | 'categories' | 'advanced';
export type Bucket = { key: BucketKey; title: string; roots: AccountNode[] };

const BUCKET_OF: Record<AccountRole, BucketKey> = {
  asset: 'accounts',
  liability: 'accounts',
  income: 'categories',
  expense: 'categories',
  equity: 'advanced',
  unknown: 'advanced',
};

const BUCKET_TITLES: Record<BucketKey, string> = {
  accounts: 'Accounts',
  categories: 'Categories',
  advanced: 'Advanced',
};

export function buildAccountTree(rows: BalanceRow[]): AccountNode[] {
  const roots: AccountNode[] = [];
  const byPath = new Map<string, AccountNode>();

  const ensure = (path: string): AccountNode => {
    const existing = byPath.get(path);
    if (existing) return existing;
    const segments = path.split(':');
    const name = segments[segments.length - 1];
    const node: AccountNode = {
      name,
      path,
      amount: '',
      role: classifyAccount(path),
      children: [],
    };
    byPath.set(path, node);
    if (segments.length === 1) {
      roots.push(node);
    } else {
      const parent = ensure(segments.slice(0, -1).join(':'));
      parent.children.push(node);
    }
    return node;
  };

  for (const row of rows) {
    ensure(row.account).amount = row.amount;
  }

  const sortRec = (nodes: AccountNode[]) => {
    nodes.sort((a, b) => a.name.localeCompare(b.name));
    nodes.forEach((n) => sortRec(n.children));
  };
  sortRec(roots);
  return roots;
}

export function bucketRoots(roots: AccountNode[]): Bucket[] {
  const order: BucketKey[] = ['accounts', 'categories', 'advanced'];
  const groups: Record<BucketKey, AccountNode[]> = {
    accounts: [],
    categories: [],
    advanced: [],
  };
  for (const root of roots) {
    groups[BUCKET_OF[root.role]].push(root);
  }
  return order.map((key) => ({
    key,
    title: BUCKET_TITLES[key],
    roots: groups[key].sort((a, b) => a.name.localeCompare(b.name)),
  }));
}

export function countLeaves(roots: AccountNode[]): number {
  let total = 0;
  const walk = (nodes: AccountNode[]) => {
    for (const n of nodes) {
      if (n.children.length === 0) total += 1;
      else walk(n.children);
    }
  };
  walk(roots);
  return total;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run features/accounts/accountTree.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add features/accounts/accountTree.ts features/accounts/accountTree.test.ts
git commit -m "feat(accounts): add account tree builder, bucketing, leaf count"
```

---

### Task 5: `AccountTree` + `BucketSection` — collapsible client UI

**Files:**
- Create: `features/accounts/AccountTree.tsx`
- Create: `features/accounts/BucketSection.tsx`

**Interfaces:**
- Consumes: `AccountNode` (Task 4), `FriendlyBalance` (Task 3), existing `AccountButtons` (`features/accounts/AccountButtons.tsx`, prop `path: string`).
- Produces:
  ```ts
  // AccountTree.tsx
  export default function AccountTree({ nodes, forceOpen }: { nodes: AccountNode[]; forceOpen: boolean }): JSX.Element;
  // BucketSection.tsx
  export default function BucketSection(
    { title, count, defaultOpen, children }:
    { title: string; count: number; defaultOpen: boolean; children: React.ReactNode }
  ): JSX.Element;
  ```
- Collapse rules: each tree node starts expanded only when its `path === 'Expenses'`; `forceOpen` (search active) overrides and expands every node. `BucketSection` starts expanded per its `defaultOpen` prop.

This task is UI wiring verified visually in Task 7 (repo has no component-interaction test harness); no new unit test.

- [ ] **Step 1: Create `BucketSection.tsx`**

```tsx
// features/accounts/BucketSection.tsx
'use client';

import { useState } from 'react';

type Props = {
  title: string;
  count: number;
  defaultOpen: boolean;
  children: React.ReactNode;
};

const BucketSection = ({ title, count, defaultOpen, children }: Props) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="rounded-2xl border border-border bg-card shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-4 py-3 text-left"
      >
        <span aria-hidden="true" className="text-muted-foreground">
          {open ? '▾' : '▸'}
        </span>
        <h2 className="text-sm font-semibold uppercase tracking-wider">{title}</h2>
        <span className="ml-auto text-xs text-muted-foreground">{count}</span>
      </button>
      {open && <div className="border-t border-border p-2">{children}</div>}
    </section>
  );
};

export default BucketSection;
```

- [ ] **Step 2: Create `AccountTree.tsx`**

```tsx
// features/accounts/AccountTree.tsx
'use client';

import { useState } from 'react';
import type { AccountNode } from './accountTree';
import AccountButtons from './AccountButtons';
import FriendlyBalance from './FriendlyBalance';

const Node = ({
  node,
  forceOpen,
}: {
  node: AccountNode;
  forceOpen: boolean;
}) => {
  const hasChildren = node.children.length > 0;
  const [open, setOpen] = useState(node.path === 'Expenses');
  const isOpen = forceOpen || open;

  return (
    <li>
      <div className="group flex flex-wrap items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-subtle">
        {hasChildren ? (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={isOpen}
            aria-label={isOpen ? `Collapse ${node.name}` : `Expand ${node.name}`}
            className="text-muted-foreground"
          >
            {isOpen ? '▾' : '▸'}
          </button>
        ) : (
          <span className="inline-block w-[1ch]" aria-hidden="true" />
        )}
        <span className="font-medium text-fg">{node.name}</span>
        <FriendlyBalance amount={node.amount} role={node.role} />
        <span className="ml-auto">
          <AccountButtons path={node.path} />
        </span>
      </div>
      {hasChildren && isOpen && (
        <ul className="ml-4 space-y-1 border-l border-border pl-4">
          {node.children.map((child) => (
            <Node key={child.path} node={child} forceOpen={forceOpen} />
          ))}
        </ul>
      )}
    </li>
  );
};

const AccountTree = ({
  nodes,
  forceOpen,
}: {
  nodes: AccountNode[];
  forceOpen: boolean;
}) => {
  if (nodes.length === 0) {
    return <p className="px-3 py-2 text-sm text-muted-foreground">No accounts.</p>;
  }
  return (
    <ul className="space-y-1">
      {nodes.map((node) => (
        <Node key={node.path} node={node} forceOpen={forceOpen} />
      ))}
    </ul>
  );
};

export default AccountTree;
```

- [ ] **Step 3: Verify it type-checks**

Run: `pnpm exec tsc --noEmit`
Expected: no errors from the new files. (`AccountsView` still references the old `Tree`; that is replaced in Task 6.)

- [ ] **Step 4: Commit**

```bash
git add features/accounts/AccountTree.tsx features/accounts/BucketSection.tsx
git commit -m "feat(accounts): add collapsible bucketed account tree UI"
```

---

### Task 6: Rewire `AccountsView` to render bucketed trees with search

**Files:**
- Modify: `features/accounts/AccountsView.tsx` (full rewrite of the component body)

**Interfaces:**
- Consumes: `BalanceRow[]` (new prop `rows`), `buildAccountTree`/`bucketRoots` (Task 4), `AccountTree` (Task 5), `BucketSection` (Task 5).
- Produces: `const AccountsView = ({ rows }: { rows: BalanceRow[] }) => JSX.Element` (default export unchanged).
- Behaviour: search filters `rows` by case-insensitive substring on `account`; buckets rebuild from the filtered rows; when a query is present, pass `forceOpen` to expand all matches. The `advanced` bucket defaults collapsed; `accounts` and `categories` default open.

- [ ] **Step 1: Replace the file contents**

```tsx
// features/accounts/AccountsView.tsx
'use client';

import { useMemo, useState } from 'react';
import type { BalanceRow } from '@/lib/balance/parse';
import { bucketRoots, buildAccountTree, countLeaves } from './accountTree';
import AccountTree from './AccountTree';
import BucketSection from './BucketSection';

type Props = {
  rows: BalanceRow[];
};

const AccountsView = ({ rows }: Props) => {
  const [query, setQuery] = useState('');
  const trimmed = query.trim().toLowerCase();

  const buckets = useMemo(() => {
    const filtered = trimmed
      ? rows.filter((r) => r.account.toLowerCase().includes(trimmed))
      : rows;
    return bucketRoots(buildAccountTree(filtered));
  }, [rows, trimmed]);

  const searching = trimmed.length > 0;

  return (
    <div className="flex flex-col gap-4">
      <input
        type="search"
        placeholder="Search accounts…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="block w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-fg shadow-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
      />
      {buckets.map((bucket) => (
        <BucketSection
          key={bucket.key}
          title={bucket.title}
          count={countLeaves(bucket.roots)}
          defaultOpen={bucket.key !== 'advanced'}
        >
          <AccountTree nodes={bucket.roots} forceOpen={searching} />
        </BucketSection>
      ))}
    </div>
  );
};

export default AccountsView;
```

- [ ] **Step 2: Verify it type-checks**

Run: `pnpm exec tsc --noEmit`
Expected: FAIL only in `features/accounts/Accounts.tsx` (still passing the old `accounts` prop). That is fixed in Task 7. No errors inside `AccountsView.tsx` itself.

- [ ] **Step 3: Commit**

```bash
git add features/accounts/AccountsView.tsx
git commit -m "feat(accounts): render bucketed collapsible tree with search"
```

---

### Task 7: Rewire `Accounts.tsx` to fetch tree-mode balances; retire old tree files

**Files:**
- Modify: `features/accounts/Accounts.tsx`
- Delete: `features/accounts/Tree.tsx`, `features/accounts/Accounts.utils.ts`

**Interfaces:**
- Consumes: `runLedger`, `getBaseCurrency` (`@/lib/settings`), `parseBalanceRows` (`@/lib/balance/parse`), `countLeaves`/`buildAccountTree` (Task 4), the rewritten `AccountsView` (Task 6, prop `rows`).
- Produces: unchanged default export (server component).
- Query change: fetch **tree-mode** balance (NO `--flat`) so every node — including synthetic parents — arrives with its rolled-up `%T`. Filter out ledger's footer `Total` row (parseBalanceRows labels it `Total`).

- [ ] **Step 1: Replace the file contents**

```tsx
// features/accounts/Accounts.tsx
import AccountsView from './AccountsView';
import { buildAccountTree, countLeaves } from './accountTree';
import ExportButton from '@/components/ExportButton';
import Help from '@/components/Help';
import { parseBalanceRows, type BalanceRow } from '@/lib/balance/parse';
import { getBaseCurrency } from '@/lib/settings';
import runLedger from '@/utils/runLedger';

const Accounts = async () => {
  let rows: BalanceRow[];
  try {
    const base = await getBaseCurrency();
    const stdout = await runLedger([
      'balance',
      '--no-total',
      '-X',
      base,
      '--format',
      '%A|%T\n',
    ]);
    rows = parseBalanceRows(stdout).filter((r) => r.account !== 'Total');
  } catch (e) {
    console.error(e);
    return (
      <div className="rounded-2xl border border-border bg-card p-6 text-sm text-negative shadow-sm">
        Failed to load accounts from ledger.
      </div>
    );
  }

  const leafCount = countLeaves(buildAccountTree(rows));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Accounts</h1>
          <Help label="About accounts">
            Your money is grouped into <strong>Accounts</strong> (what you have
            and owe — bank, cash, cards) and <strong>Categories</strong> (where
            money comes from and goes). An arrow shows whether a balance is in
            your favour (↑) or against you (↓); a tag like{' '}
            <em>owed to you</em> appears when a balance is the opposite of what
            is usual. Less-common accounts live under <strong>Advanced</strong>.
          </Help>
          <ExportButton href="/api/accounts/export" />
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {leafCount} account{leafCount === 1 ? '' : 's'}
        </p>
      </div>
      <AccountsView rows={rows} />
    </div>
  );
};

export default Accounts;
```

- [ ] **Step 2: Delete the retired files**

```bash
git rm features/accounts/Tree.tsx features/accounts/Accounts.utils.ts
```

- [ ] **Step 3: Confirm nothing else imports the retired modules**

Run: `grep -rn "Accounts.utils\|accounts/Tree" features app components lib utils`
Expected: no matches. (If `Accounts.utils` has its own test file, delete it too and re-run.)

- [ ] **Step 4: Type-check and run the full test suite**

Run: `pnpm exec tsc --noEmit && pnpm test`
Expected: type-check clean; all tests pass (including the four new suites).

- [ ] **Step 5: Manual verification**

Run: `pnpm dev`, open `/accounts`. Confirm:
- Three sections: **Accounts**, **Categories** (both open), **Advanced** (collapsed).
- Under Categories, **Expenses** is expanded; other roots collapsed.
- Balances show `↑/↓ + amount`; an overdrawn asset or a reversed `Liabilities:*` shows the matching chip.
- Typing in search expands and filters to matches; clearing restores default collapse.
- Clicking an account still opens its detail page.

- [ ] **Step 6: Commit**

```bash
git add features/accounts/Accounts.tsx
git commit -m "feat(accounts): friendly bucketed accounts view over tree-mode balances"
```

---

## Self-Review

**Spec coverage:**
- Section 1 (two buckets + Advanced fold): Task 4 `bucketRoots`, Task 6/7 rendering. ✓
- Section 2 (magnitude + arrow + color always, chip on reversed; sign-driven direction; friend-swing/overdraft): Task 1 `balanceDisplay` (+ tests for every case in the spec's testing list), Task 3 `FriendlyBalance`. ✓
- Section 2 data source (reuse balance query, base currency, per-node rollups): Task 7 tree-mode query; empirically verified `%T` gives correct rollups. ✓
- Section 3 (collapsible, Expenses expanded by default, row anatomy, leaves clickable): Task 5 `AccountTree`/`BucketSection`, Task 6 defaults. ✓
- Deferred items (ledger mode, path visible-vs-tooltip, subtype icons, multi-currency): not implemented, by design. ✓

**Placeholder scan:** No TBD/TODO; every code step has complete code and exact commands. ✓

**Type consistency:** `AccountNode`/`Bucket`/`BalanceDisplay`/`AmountParts` names and `balanceDisplay`/`parseAmountParts`/`buildAccountTree`/`bucketRoots`/`countLeaves` signatures are used consistently across Tasks 3–7. `AccountsView` prop renamed `accounts: string[]` → `rows: BalanceRow[]` and updated in both its definition (Task 6) and its caller (Task 7). ✓

**Note on zero-balance accounts:** tree-mode `ledger balance` omits accounts that net to zero, so a currently-zero account disappears from this view (it reappears via the deferred "ledger mode"). This is intended for a balance-oriented view and called out here so it is not mistaken for a bug.
