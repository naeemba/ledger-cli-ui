# Transactions Pagination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/transactions` load and render in bounded memory so it is fast and never crashes mobile, via server-action offset paging of a slimmed row shape plus client-side virtualization.

**Architecture:** The server component ships only page 1 of a slimmed `TransactionRow[]` (dropping the heavy `rawBlock`). A client list seeds from that page, renders only the visible window with `@tanstack/react-virtual`, and fetches further pages from a `loadTransactionPageAction` server action as the user scrolls. All paging/projection logic lives in pure functions that are unit-tested in Vitest's `node` environment; the React shell is thin and verified manually.

**Tech Stack:** Next.js 16 (App Router, RSC + server actions), React 19, TypeScript, Vitest (`node` env), `@tanstack/react-virtual`, pnpm.

## Global Constraints

- **`PAGE_SIZE = 50`** — shared constant, exported from `features/transactions/pageTransactions.ts`.
- **Add only `@tanstack/react-virtual`.** Do NOT add `@tanstack/react-table`. Do NOT use shadcn's "data-table" recipe.
- **Offset paging**, not keyset cursors. The filtered list is a stable in-memory snapshot within the existing 60s `unstable_cache` window.
- **Filter change resets to page 1** — the client list is keyed on the serialized filters so React remounts it.
- **Server action calls `requireUser()`** — identity comes from the session, never from client input.
- **No real `<table>`** for the list — virtualized rows must be absolutely positioned; use div-grid rows styled to match. shadcn primitives (`Button`, `DropdownMenu`) stay.
- **`/api/transactions/export` is untouched** — it already streams the full filtered set server-side.
- **Package manager: pnpm.** Conventional-commit messages. No AI/assistant attribution in commits or code.
- **Test env is `node`** (no jsdom). Pure logic is unit-tested; presentational components are tested with `renderToStaticMarkup` from `react-dom/server`; the virtualized scroll wiring is verified manually.

---

### Task 1: `TransactionRow` type + `toTransactionRow` projector

**Files:**
- Create: `features/transactions/transactionRow.ts`
- Test: `features/transactions/transactionRow.test.ts`

**Interfaces:**
- Consumes: `Transaction` from `@/lib/journal/parser`.
- Produces: `type TransactionRow`, `toTransactionRow(t: Transaction): TransactionRow`.

- [ ] **Step 1: Write the failing test**

```ts
// features/transactions/transactionRow.test.ts
import { describe, it, expect } from 'vitest';
import { toTransactionRow } from './transactionRow';
import type { Transaction } from '@/lib/journal/parser';

const sample: Transaction = {
  uid: 'U1',
  file: 'main.ledger',
  startLine: 1,
  endLine: 4,
  date: '2026-01-02',
  payee: 'Coffee',
  status: 'cleared',
  note: null,
  postings: [
    {
      account: 'Expenses:Food',
      amount: '5.00',
      currency: '$',
      cost: { amount: '1', currency: '€' },
    },
    { account: 'Assets:Cash', amount: '-5.00', currency: '$' },
  ],
  rawBlock: '2026-01-02 Coffee\n  Expenses:Food  $5.00\n  Assets:Cash  $-5.00',
  fingerprint: 'abc',
};

describe('toTransactionRow', () => {
  it('drops rawBlock and endLine', () => {
    const row = toTransactionRow(sample);
    expect('rawBlock' in row).toBe(false);
    expect('endLine' in row).toBe(false);
  });

  it('slims postings to account/amount/currency only', () => {
    const row = toTransactionRow(sample);
    expect(row.postings[0]).toEqual({
      account: 'Expenses:Food',
      amount: '5.00',
      currency: '$',
    });
    expect('cost' in row.postings[0]).toBe(false);
  });

  it('preserves fields the table and row actions consume', () => {
    const row = toTransactionRow(sample);
    expect(row).toMatchObject({
      uid: 'U1',
      file: 'main.ledger',
      startLine: 1,
      date: '2026-01-02',
      payee: 'Coffee',
      status: 'cleared',
      note: null,
      fingerprint: 'abc',
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run features/transactions/transactionRow.test.ts`
Expected: FAIL — cannot find module `./transactionRow`.

- [ ] **Step 3: Write minimal implementation**

```ts
// features/transactions/transactionRow.ts
import type { Transaction } from '@/lib/journal/parser';

export type TransactionRow = Omit<
  Transaction,
  'rawBlock' | 'endLine' | 'postings'
> & {
  postings: Array<{ account: string; amount: string; currency: string }>;
};

export const toTransactionRow = (t: Transaction): TransactionRow => ({
  uid: t.uid,
  file: t.file,
  startLine: t.startLine,
  date: t.date,
  payee: t.payee,
  status: t.status,
  note: t.note,
  fingerprint: t.fingerprint,
  postings: t.postings.map((p) => ({
    account: p.account,
    amount: p.amount,
    currency: p.currency,
  })),
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run features/transactions/transactionRow.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add features/transactions/transactionRow.ts features/transactions/transactionRow.test.ts
git commit -m "feat(transactions): add slimmed TransactionRow projection"
```

---

### Task 2: `pageTransactions` pager + `PAGE_SIZE` + `appendPage`

**Files:**
- Create: `features/transactions/pageTransactions.ts`
- Test: `features/transactions/pageTransactions.test.ts`

**Interfaces:**
- Consumes: `applyTransactionFilters`, `TransactionFilters` from `./applyTransactionFilters`; `toTransactionRow`, `TransactionRow` from `./transactionRow` (Task 1); `Transaction` from `@/lib/journal/parser`.
- Produces:
  - `const PAGE_SIZE = 50`
  - `type TransactionPage = { rows: TransactionRow[]; nextOffset: number | null; total: number }`
  - `pageTransactions(all: Transaction[], filters: TransactionFilters, offset: number, limit: number): TransactionPage`
  - `appendPage(prev: { rows: TransactionRow[]; nextOffset: number | null }, page: TransactionPage): { rows: TransactionRow[]; nextOffset: number | null }`

- [ ] **Step 1: Write the failing test**

```ts
// features/transactions/pageTransactions.test.ts
import { describe, it, expect } from 'vitest';
import { PAGE_SIZE, pageTransactions, appendPage } from './pageTransactions';
import type { Transaction } from '@/lib/journal/parser';

const tx = (date: string, payee: string): Transaction => ({
  uid: `${date}-${payee}`,
  file: 'main.ledger',
  startLine: 1,
  endLine: 2,
  date,
  payee,
  status: 'none',
  note: null,
  postings: [{ account: 'Assets:Cash', amount: '1.00', currency: '$' }],
  rawBlock: `${date} ${payee}`,
  fingerprint: `${date}-${payee}`,
});

// 5 transactions across 5 days, deliberately out of order.
const all: Transaction[] = [
  tx('2026-01-01', 'A'),
  tx('2026-01-05', 'B'),
  tx('2026-01-03', 'C'),
  tx('2026-01-02', 'D'),
  tx('2026-01-04', 'B'),
];

describe('PAGE_SIZE', () => {
  it('is 50', () => {
    expect(PAGE_SIZE).toBe(50);
  });
});

describe('pageTransactions', () => {
  it('sorts by date descending and slices the first page', () => {
    const page = pageTransactions(all, {}, 0, 2);
    expect(page.rows.map((r) => r.date)).toEqual(['2026-01-05', '2026-01-04']);
  });

  it('reports total as the filtered count, not the page size', () => {
    const page = pageTransactions(all, {}, 0, 2);
    expect(page.total).toBe(5);
  });

  it('returns a numeric nextOffset while rows remain', () => {
    const page = pageTransactions(all, {}, 0, 2);
    expect(page.nextOffset).toBe(2);
  });

  it('returns nextOffset null on the last page', () => {
    const page = pageTransactions(all, {}, 4, 2);
    expect(page.rows.map((r) => r.date)).toEqual(['2026-01-01']);
    expect(page.nextOffset).toBeNull();
  });

  it('returns empty rows and null nextOffset past the end', () => {
    const page = pageTransactions(all, {}, 99, 2);
    expect(page.rows).toEqual([]);
    expect(page.nextOffset).toBeNull();
  });

  it('applies filters before paging', () => {
    const page = pageTransactions(all, { payee: 'B' }, 0, 50);
    expect(page.total).toBe(2);
    expect(page.rows.map((r) => r.date)).toEqual(['2026-01-05', '2026-01-04']);
  });

  it('returns slimmed rows (no rawBlock)', () => {
    const page = pageTransactions(all, {}, 0, 1);
    expect('rawBlock' in page.rows[0]).toBe(false);
  });
});

describe('appendPage', () => {
  it('concatenates rows and adopts the new nextOffset', () => {
    const first = pageTransactions(all, {}, 0, 2);
    const second = pageTransactions(all, {}, 2, 2);
    const merged = appendPage(
      { rows: first.rows, nextOffset: first.nextOffset },
      second
    );
    expect(merged.rows).toHaveLength(4);
    expect(merged.nextOffset).toBe(4);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run features/transactions/pageTransactions.test.ts`
Expected: FAIL — cannot find module `./pageTransactions`.

- [ ] **Step 3: Write minimal implementation**

```ts
// features/transactions/pageTransactions.ts
import {
  applyTransactionFilters,
  type TransactionFilters,
} from './applyTransactionFilters';
import { toTransactionRow, type TransactionRow } from './transactionRow';
import type { Transaction } from '@/lib/journal/parser';

export const PAGE_SIZE = 50;

export type TransactionPage = {
  rows: TransactionRow[];
  nextOffset: number | null;
  total: number;
};

export const pageTransactions = (
  all: Transaction[],
  filters: TransactionFilters,
  offset: number,
  limit: number
): TransactionPage => {
  const filtered = applyTransactionFilters(all, filters).sort((a, b) =>
    b.date.localeCompare(a.date)
  );
  const total = filtered.length;
  const rows = filtered.slice(offset, offset + limit).map(toTransactionRow);
  const consumed = offset + rows.length;
  const nextOffset = consumed < total ? consumed : null;
  return { rows, nextOffset, total };
};

export const appendPage = (
  prev: { rows: TransactionRow[]; nextOffset: number | null },
  page: TransactionPage
): { rows: TransactionRow[]; nextOffset: number | null } => ({
  rows: prev.rows.concat(page.rows),
  nextOffset: page.nextOffset,
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run features/transactions/pageTransactions.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add features/transactions/pageTransactions.ts features/transactions/pageTransactions.test.ts
git commit -m "feat(transactions): add pure offset pager and page accumulator"
```

---

### Task 3: Shared journal loader + `loadTransactionPageAction`

**Files:**
- Create: `features/transactions/loadJournalTransactions.ts`
- Create: `features/transactions/actions/loadTransactionPage.ts`
- Modify: `features/transactions/actions/index.ts` (add one re-export line)

**Interfaces:**
- Consumes: `journalRepository`, `getJournalCacheTag` from `@/lib/journal` / `@/lib/journal/layout`; `requireUser` from `@/lib/auth/require-user`; `pageTransactions`, `TransactionPage` (Task 2); `TransactionFilters` from `./applyTransactionFilters`.
- Produces:
  - `loadJournalTransactions(userId: string): Promise<Transaction[]>` (cached, the same loader the page used inline)
  - `loadTransactionPageAction(input: { filters: TransactionFilters; offset: number; limit: number }): Promise<TransactionPage>`

> **Note on testing:** This task's logic is the pure `pageTransactions` (already covered in Task 2). The two files here are a cached IO loader and a thin `'use server'` wrapper that depends on session auth; the repo has no precedent for unit-testing server actions, so verification is type-check + the manual run in Task 6. No new test file.

- [ ] **Step 1: Create the shared loader (extracted verbatim from `Transactions.tsx`)**

```ts
// features/transactions/loadJournalTransactions.ts
import 'server-only';
import { journalRepository } from '@/lib/journal';
import { getJournalCacheTag } from '@/lib/journal/layout';
import { type Transaction } from '@/lib/journal/parser';
import { unstable_cache } from 'next/cache';

const buildLoader = (tag: string, fingerprint: string) =>
  unstable_cache(
    async (userId: string): Promise<Transaction[]> => {
      // getFingerprint (below) already pulled the canonical journal into the
      // local cache, so read straight from the repository.
      const journal = await journalRepository.list(userId);
      return journal.transactions;
    },
    ['journal-transactions', tag, fingerprint],
    { revalidate: 60, tags: [tag] }
  );

export const loadJournalTransactions = async (
  userId: string
): Promise<Transaction[]> => {
  const fingerprint = await journalRepository.getFingerprint(userId);
  return buildLoader(getJournalCacheTag(userId), fingerprint)(userId);
};
```

- [ ] **Step 2: Create the server action**

```ts
// features/transactions/actions/loadTransactionPage.ts
'use server';

import { requireUser } from '@/lib/auth/require-user';
import { type TransactionFilters } from '../applyTransactionFilters';
import { loadJournalTransactions } from '../loadJournalTransactions';
import { pageTransactions, type TransactionPage } from '../pageTransactions';

export async function loadTransactionPageAction(input: {
  filters: TransactionFilters;
  offset: number;
  limit: number;
}): Promise<TransactionPage> {
  const user = await requireUser();
  const all = await loadJournalTransactions(user.id);
  return pageTransactions(all, input.filters, input.offset, input.limit);
}
```

- [ ] **Step 3: Re-export from the actions barrel**

Open `features/transactions/actions/index.ts` and add, alongside the existing re-exports (e.g. the `deleteTransaction` line), following the file's existing style:

```ts
export { loadTransactionPageAction } from './loadTransactionPage';
```

- [ ] **Step 4: Verify it type-checks**

Run: `pnpm type-check`
Expected: PASS (no errors). This confirms the action, loader, and barrel wire together.

- [ ] **Step 5: Commit**

```bash
git add features/transactions/loadJournalTransactions.ts features/transactions/actions/loadTransactionPage.ts features/transactions/actions/index.ts
git commit -m "feat(transactions): add paged loader server action"
```

---

### Task 4: `TransactionRowItem` presentational component + retype `RowActions`

**Files:**
- Create: `features/transactions/TransactionRowItem.tsx`
- Test: `features/transactions/TransactionRowItem.test.tsx`
- Modify: `features/transactions/RowActions.tsx` (change prop type `Transaction` → `TransactionRow`)

**Interfaces:**
- Consumes: `TransactionRow` (Task 1); `RowActions` (this task, retyped); `formatAmount` from `@/utils/formatAmount`; `Format`, `formatDateWithLocale` from `@/utils/formatDateCore`.
- Produces: `default` export `TransactionRowItem({ row }: { row: TransactionRow })` rendering a mobile card (`md:hidden`) and a desktop grid row (`hidden md:grid`).

- [ ] **Step 1: Retype `RowActions` to accept `TransactionRow`**

In `features/transactions/RowActions.tsx`:
- Replace `import type { Transaction } from '@/lib/journal/parser';` with `import type { TransactionRow } from './transactionRow';`
- Change `type Props = { transaction: Transaction };` to `type Props = { transaction: TransactionRow };`
- Change `const toTemplateDraft = (t: Transaction): TemplateDraft => ({` to `const toTemplateDraft = (t: TransactionRow): TemplateDraft => ({`

(All fields `RowActions` uses — `uid`, `fingerprint`, `payee`, `status`, `note`, `postings.{account,amount,currency}` — exist on `TransactionRow`.)

- [ ] **Step 2: Write the failing test**

```tsx
// features/transactions/TransactionRowItem.test.tsx
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';
import TransactionRowItem from './TransactionRowItem';
import type { TransactionRow } from './transactionRow';

// RowActions pulls in next/navigation + dialogs; stub it for a pure render.
vi.mock('./RowActions', () => ({ default: () => null }));

const row: TransactionRow = {
  uid: 'U1',
  file: 'main.ledger',
  startLine: 1,
  date: '2026-01-02',
  payee: 'Coffee Shop',
  status: 'cleared',
  note: null,
  fingerprint: 'abc',
  postings: [
    { account: 'Expenses:Food', amount: '5.00', currency: '$' },
    { account: 'Assets:Cash', amount: '-5.00', currency: '$' },
  ],
};

const html = (node: React.ReactNode) => renderToStaticMarkup(node);

describe('TransactionRowItem', () => {
  it('renders the payee', () => {
    expect(html(<TransactionRowItem row={row} />)).toContain('Coffee Shop');
  });

  it('renders the account summary', () => {
    expect(html(<TransactionRowItem row={row} />)).toContain('Expenses:Food');
  });

  it('links to the edit page when a uid is present', () => {
    expect(html(<TransactionRowItem row={row} />)).toContain(
      '/transactions/U1/edit'
    );
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm exec vitest run features/transactions/TransactionRowItem.test.tsx`
Expected: FAIL — cannot find module `./TransactionRowItem`.

- [ ] **Step 4: Write the component**

```tsx
// features/transactions/TransactionRowItem.tsx
import RowActions from './RowActions';
import type { TransactionRow } from './transactionRow';
import formatAmount from '@/utils/formatAmount';
import { Format, formatDateWithLocale } from '@/utils/formatDateCore';
import Link from 'next/link';

const statusBadge = (status: TransactionRow['status']) => {
  if (status === 'cleared') return <span className="text-positive">✓</span>;
  if (status === 'pending') return <span className="text-warning">!</span>;
  return null;
};

const accountsSummary = (t: TransactionRow) =>
  `${t.postings
    .slice(0, 2)
    .map((p) => p.account)
    .join(' → ')}${t.postings.length > 2 ? ' …' : ''}`;

const magnitudeByCurrency = (t: TransactionRow): Array<[string, number]> => {
  const sums = new Map<string, number>();
  for (const p of t.postings) {
    const v = Number(p.amount);
    if (!Number.isFinite(v) || v <= 0) continue;
    const key = p.currency || '';
    sums.set(key, (sums.get(key) ?? 0) + v);
  }
  return [...sums.entries()];
};

const payeeNode = (t: TransactionRow) =>
  t.uid ? (
    <Link href={`/transactions/${t.uid}/edit`} className="hover:underline">
      {t.payee}
    </Link>
  ) : (
    <span>{t.payee}</span>
  );

const actionsNode = (t: TransactionRow) =>
  t.uid ? (
    <RowActions transaction={t} />
  ) : (
    <span
      className="text-xs text-muted-foreground"
      title="Re-import the journal to enable editing for this transaction"
    >
      no uid
    </span>
  );

const TransactionRowItem = ({ row: t }: { row: TransactionRow }) => (
  <>
    {/* Mobile: stacked card (more readable than a 7-col table on a phone). */}
    <div className="rounded-lg border border-border p-3 text-sm md:hidden">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 font-medium break-words">
            {statusBadge(t.status)}
            {payeeNode(t)}
          </div>
          <div className="mt-0.5 text-xs tabular-nums text-muted-foreground">
            {formatDateWithLocale(t.date, Format.DATE)}
          </div>
        </div>
        <div className="shrink-0">{actionsNode(t)}</div>
      </div>
      <div className="mt-2 flex items-end justify-between gap-3">
        <span className="min-w-0 break-words text-xs text-muted-foreground">
          {accountsSummary(t)}
        </span>
        <span className="shrink-0 text-right tabular-nums">
          {magnitudeByCurrency(t).map(([ccy, amt]) => (
            <span key={ccy} className="block">
              {formatAmount(`${ccy} ${amt.toFixed(2)}`, true)}
            </span>
          ))}
        </span>
      </div>
    </div>

    {/* Desktop: grid row mirroring the old table columns (no <table> so the
        parent can absolutely-position it for virtualization). */}
    <div className="hidden grid-cols-[7rem_1.5rem_1fr_1fr_8rem_6rem] items-center gap-2 border-t border-border py-2 text-sm md:grid">
      <span className="whitespace-nowrap tabular-nums">
        {formatDateWithLocale(t.date, Format.DATE)}
      </span>
      <span>{statusBadge(t.status)}</span>
      <span className="min-w-0 truncate">{payeeNode(t)}</span>
      <span className="min-w-0 truncate text-muted-foreground">
        {accountsSummary(t)}
      </span>
      <span className="text-right whitespace-nowrap tabular-nums">
        {magnitudeByCurrency(t).map(([ccy, amt]) => (
          <span key={ccy} className="block">
            {formatAmount(`${ccy} ${amt.toFixed(2)}`, true)}
          </span>
        ))}
      </span>
      <span className="text-right">{actionsNode(t)}</span>
    </div>
  </>
);

export default TransactionRowItem;
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm exec vitest run features/transactions/TransactionRowItem.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add features/transactions/TransactionRowItem.tsx features/transactions/TransactionRowItem.test.tsx features/transactions/RowActions.tsx
git commit -m "feat(transactions): add row-item component and retype row actions"
```

---

### Task 5: `TransactionList` virtualized client list

**Files:**
- Create: `features/transactions/TransactionList.tsx`
- Modify: `package.json` (add `@tanstack/react-virtual`)

**Interfaces:**
- Consumes: `TransactionRowItem` (Task 4); `loadTransactionPageAction` from `./actions` (Task 3); `TransactionRow` (Task 1); `PAGE_SIZE`, `appendPage` (Task 2); `TransactionFilters` from `./applyTransactionFilters`; `useVirtualizer` from `@tanstack/react-virtual`.
- Produces: `default` export
  `TransactionList({ initialRows, total, initialNextOffset, filters }: { initialRows: TransactionRow[]; total: number; initialNextOffset: number | null; filters: TransactionFilters })`.

> **Note on testing:** Virtualization needs a measured scroll element and `IntersectionObserver`/`useEffect`, none of which run under Vitest's `node` env or in `renderToStaticMarkup` (the virtualizer renders zero items without a real scroll element). The correctness-bearing logic — `pageTransactions` and `appendPage` — is already unit-tested in Task 2. This component is verified manually in Task 6, Step 4.

- [ ] **Step 1: Install the virtualizer**

Run: `pnpm add @tanstack/react-virtual`
Expected: `@tanstack/react-virtual` appears in `package.json` `dependencies`.

- [ ] **Step 2: Write the component**

```tsx
// features/transactions/TransactionList.tsx
'use client';

import { loadTransactionPageAction } from './actions';
import { type TransactionFilters } from './applyTransactionFilters';
import { PAGE_SIZE, appendPage } from './pageTransactions';
import TransactionRowItem from './TransactionRowItem';
import { type TransactionRow } from './transactionRow';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useCallback, useEffect, useRef, useState } from 'react';

type Props = {
  initialRows: TransactionRow[];
  total: number;
  initialNextOffset: number | null;
  filters: TransactionFilters;
};

const rowKey = (r: TransactionRow) => r.uid ?? `${r.file}:${r.startLine}`;

const TransactionList = ({
  initialRows,
  total,
  initialNextOffset,
  filters,
}: Props) => {
  const parentRef = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState<{
    rows: TransactionRow[];
    nextOffset: number | null;
  }>({ rows: initialRows, nextOffset: initialNextOffset });
  const [loading, setLoading] = useState(false);

  const virtualizer = useVirtualizer({
    count: page.rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 80,
    overscan: 8,
  });

  const loadMore = useCallback(async () => {
    if (loading || page.nextOffset === null) return;
    setLoading(true);
    try {
      const next = await loadTransactionPageAction({
        filters,
        offset: page.nextOffset,
        limit: PAGE_SIZE,
      });
      setPage((prev) => appendPage(prev, next));
    } finally {
      setLoading(false);
    }
  }, [loading, page.nextOffset, filters]);

  const items = virtualizer.getVirtualItems();

  // Prefetch the next page when the last rendered item nears the loaded tail.
  useEffect(() => {
    const last = items[items.length - 1];
    if (!last) return;
    if (last.index >= page.rows.length - 10) void loadMore();
  }, [items, page.rows.length, loadMore]);

  if (total === 0) {
    return (
      <div className="rounded-md border border-border p-8 text-center text-sm text-muted-foreground">
        No matches. Try clearing the filters.
      </div>
    );
  }

  return (
    <div ref={parentRef} className="h-[70vh] overflow-auto">
      <div
        style={{ height: virtualizer.getTotalSize(), position: 'relative' }}
      >
        {items.map((vi) => {
          const row = page.rows[vi.index];
          return (
            <div
              key={rowKey(row)}
              data-index={vi.index}
              ref={virtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${vi.start}px)`,
              }}
            >
              <TransactionRowItem row={row} />
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default TransactionList;
```

- [ ] **Step 3: Verify type-check**

Run: `pnpm type-check`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add features/transactions/TransactionList.tsx package.json pnpm-lock.yaml
git commit -m "feat(transactions): add virtualized transaction list"
```

---

### Task 6: Wire `Transactions.tsx` to ship page 1; remove old table

**Files:**
- Modify: `features/transactions/Transactions.tsx`
- Delete: `features/transactions/TransactionTable.tsx`

**Interfaces:**
- Consumes: `loadJournalTransactions` (Task 3); `PAGE_SIZE`, `pageTransactions` (Task 2); `TransactionList` (Task 5); existing `Filters`, `savedViewService`, `requireUser`, `Help`.
- Produces: the rendered `/transactions` page (page-1 payload + virtualized list).

- [ ] **Step 1: Rewrite `Transactions.tsx`**

Replace the whole file with:

```tsx
// features/transactions/Transactions.tsx
import 'server-only';
import Filters from './Filters';
import TransactionList from './TransactionList';
import { type TransactionFilters } from './applyTransactionFilters';
import { loadJournalTransactions } from './loadJournalTransactions';
import { PAGE_SIZE, pageTransactions } from './pageTransactions';
import Help from '@/components/Help';
import { requireUser } from '@/lib/auth/require-user';
import { savedViewService } from '@/lib/savedViews';

const Transactions = async ({
  searchParams,
}: {
  searchParams: Promise<TransactionFilters>;
}) => {
  const user = await requireUser();
  const params = await searchParams;
  const [all, existingViewNames] = await Promise.all([
    loadJournalTransactions(user.id),
    savedViewService.listNames(user.id),
  ]);
  const firstPage = pageTransactions(all, params, 0, PAGE_SIZE);
  const payees = [...new Set(all.map((t) => t.payee))].sort();
  const accounts = [
    ...new Set(all.flatMap((t) => t.postings.map((p) => p.account))),
  ].sort();

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center gap-2">
        <h1 className="text-2xl font-semibold">Transactions</h1>
        <Help label="About transactions">
          All edits and deletes from this list rewrite the source file in place.
        </Help>
      </header>
      <Filters
        payees={payees}
        accounts={accounts}
        start={params.start}
        end={params.end}
        existingViewNames={existingViewNames}
      />
      <TransactionList
        key={JSON.stringify(params)}
        initialRows={firstPage.rows}
        total={firstPage.total}
        initialNextOffset={firstPage.nextOffset}
        filters={params}
      />
    </div>
  );
};

export default Transactions;
```

(The inline `buildLoader`/`loadTransactions` are gone — they now live in `loadJournalTransactions.ts`. The `key={JSON.stringify(params)}` forces the list to remount and discard accumulated rows whenever a filter changes.)

- [ ] **Step 2: Delete the old table component**

Run: `git rm features/transactions/TransactionTable.tsx`
Expected: file removed. (Confirm nothing else imports it.)

- [ ] **Step 3: Confirm no dangling imports**

Run: `grep -rn "TransactionTable" features app lib`
Expected: no matches.

- [ ] **Step 4: Type-check, lint, and full test suite**

Run: `pnpm type-check && pnpm lint && pnpm test`
Expected: all PASS.

- [ ] **Step 5: Manual verification (the part automated tests can't cover)**

1. Run `pnpm dev`.
2. Open `/transactions` in a browser with the devtools device toolbar set to a phone viewport.
3. In the Network panel, confirm the initial document carries only ~50 rows (search the response for a known older payee that should NOT be on page 1 — it should be absent until you scroll).
4. Scroll the list. Confirm `loadTransactionPageAction` requests fire as you approach the tail, and new rows append.
5. In the Elements panel, confirm the number of rendered row `<div>`s stays bounded (tens, not the full total) no matter how far you scroll. **This is the crash fix.**
6. Change a filter (e.g. set a date range). Confirm the list resets to the top with the new result set.

- [ ] **Step 6: Commit**

```bash
git add features/transactions/Transactions.tsx
git commit -m "feat(transactions): ship page 1 only and virtualize the register"
```

---

## Self-Review

**Spec coverage:**
- Slim row projection (`TransactionRow`, `toTransactionRow`) → Task 1. ✓
- `loadTransactionPage` server action with `requireUser` + offset paging → Tasks 2–3. ✓
- Server component ships page 1 only + filter dropdown values → Task 6. ✓
- Client virtualized list with append-on-scroll sentinel → Task 5. ✓
- Filter reset to page 1 via remount key → Task 6, Step 1. ✓
- `@tanstack/react-virtual` added; no react-table / no shadcn data-table → Task 5 + Global Constraints. ✓
- div-grid rows instead of `<table>` → Task 4. ✓
- Export route untouched → not modified by any task. ✓
- Testing: `toTransactionRow` (Task 1), `pageTransactions`/`appendPage` (Task 2), row-item render (Task 4), manual mobile DOM-bound check (Task 6). ✓

**Placeholder scan:** No TBD/TODO; every code step shows complete code; every command shows expected output.

**Type consistency:** `TransactionRow`, `TransactionPage`, `PAGE_SIZE`, `pageTransactions`, `appendPage`, `loadTransactionPageAction`, `loadJournalTransactions`, `TransactionRowItem`, `TransactionList` are named identically across the tasks that define and consume them. `loadTransactionPageAction` input `{ filters, offset, limit }` matches its call site in Task 5.
