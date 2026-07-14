# Unified Transaction Row Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render transaction rows with one shared component carrying consistent edit/delete actions across the main Transactions list, the account register, Dashboard recent, and Reconcile.

**Architecture:** Every surface maps its source data into a common `TransactionRowView`. A shared client `TransactionRow` component renders the view identically and mounts a generalized `RowActions` when the row has a `uid`. Register-derived surfaces get the uid by adding `%(note)` to their `ledger register` format and extracting it with a note-specific regex — no journal-format change. Delete works from a uid alone via a server action that resolves the per-transaction fingerprint server-side.

**Tech Stack:** Next.js (app router, RSC + client components), TypeScript, ledger CLI, vitest, Tailwind.

## Global Constraints

- **Ledger does all accounting math** (CLAUDE.md hard rule): running totals/amounts come from ledger output, never recomputed in JS.
- **No abbreviations** in identifiers (project rule): `transaction` not `txn`, etc.
- **No self-reference** in commits/code/comments (no "Claude"/"Anthropic"); no Co-Authored-By trailer.
- **uid character class** is Crockford ULID: `[0-9A-HJKMNP-TV-Z]{26}`.
- Delete authority is the **per-transaction** fingerprint (`ParsedTransaction.fingerprint`), compared in `JournalService.performDelete` (`lib/journal/service.ts:490`). The journal-wide fingerprint will NOT match — do not use it.
- Run `pnpm exec tsc --noEmit` and `pnpm exec vitest run <touched paths>` before each commit.

---

## File Structure

- `lib/journal/uid.ts` — add `uidFromNote()` (extract uid from ledger `%(note)` text).
- `features/transactions/actions/deleteTransactionByUid.ts` — new server action; resolves the per-transaction fingerprint and delegates to `deleteTransactionAction`.
- `features/transactions/row/rowView.ts` — `TransactionRowView` type + `transactionRowToView()` adapter (main list).
- `features/transactions/row/registerRows.ts` — parse account-register ledger output → `TransactionRowView[]`.
- `features/transactions/row/TransactionRow.tsx` — shared client row component (folds today's `TransactionRowItem`).
- `features/transactions/RowActions.tsx` — generalize to `{ uid, templateDraft? }`.
- `app/accounts/[account]/AccountRegister.tsx` — new client wrapper rendering shared rows.
- `app/accounts/[account]/page.tsx` — switch to the new format + client wrapper.
- `features/dashboard/Dashboard.utils.ts`, `features/dashboard/Dashboard.tsx` — add uid, render shared row.
- `features/reconcile/Reconcile.utils.ts`, `features/reconcile/Reconcile.tsx` — add uid, render shared row.

---

## Task 1: `uidFromNote` helper

**Files:**
- Modify: `lib/journal/uid.ts`
- Test: `lib/journal/uid.test.ts` (create if absent)

**Interfaces:**
- Produces: `uidFromNote(note: string): string | null`

Ledger's `%(note)` emits the comment text with the leading `;` stripped (e.g. `" :uid: 01ABC…"`), so the line-anchored `UID_LINE_REGEX` does not match — a substring regex is needed.

- [ ] **Step 1: Write the failing test**

Create/append `lib/journal/uid.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { uidFromNote } from './uid';

describe('uidFromNote', () => {
  it('extracts a uid from ledger %(note) text (no leading semicolon)', () => {
    expect(uidFromNote(' :uid: 01HZY0Z9QK8G7F6E5D4C3B2A1Z')).toBe(
      '01HZY0Z9QK8G7F6E5D4C3B2A1Z'
    );
  });

  it('finds the uid among other note text', () => {
    expect(
      uidFromNote('groceries :uid: 01HZY0Z9QK8G7F6E5D4C3B2A1Z shared')
    ).toBe('01HZY0Z9QK8G7F6E5D4C3B2A1Z');
  });

  it('returns null when no uid is present', () => {
    expect(uidFromNote('just a note')).toBeNull();
    expect(uidFromNote('')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run lib/journal/uid.test.ts`
Expected: FAIL — `uidFromNote is not a function`.

- [ ] **Step 3: Implement**

Append to `lib/journal/uid.ts`:

```ts
// Extract the uid from ledger `%(note)` output. Unlike UID_LINE_REGEX (which
// anchors a full `; :uid: …` journal line), `%(note)` drops the leading `;`, so
// we match the `:uid:` tag anywhere in the note text.
export const UID_TAG_REGEX = /:uid:\s*([0-9A-HJKMNP-TV-Z]{26})/;

export const uidFromNote = (note: string): string | null =>
  note.match(UID_TAG_REGEX)?.[1] ?? null;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run lib/journal/uid.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/journal/uid.ts lib/journal/uid.test.ts
git commit -m "feat(journal): extract uid from ledger note text"
```

---

## Task 2: `deleteTransactionByUid` server action

**Files:**
- Create: `features/transactions/actions/deleteTransactionByUid.ts`
- Modify: `features/transactions/actions/index.ts`
- Test: `features/transactions/actions/deleteTransactionByUid.test.ts`

**Interfaces:**
- Consumes: `deleteTransactionAction(uid, expectedFingerprint)` from `./deleteTransaction`; `journalService.findTransaction(userId, uid)`.
- Produces: `deleteTransactionByUid(uid: string): Promise<DeleteTransactionResult>`

The row surfaces have a uid but no per-transaction fingerprint. This action looks the transaction up server-side, reads its stamped `fingerprint`, and delegates to the existing audited delete — so callers never handle a fingerprint.

- [ ] **Step 1: Write the failing test**

Create `features/transactions/actions/deleteTransactionByUid.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from 'vitest';

const requireUser = vi.fn(async () => ({ id: 'user-1' }));
const findTransaction = vi.fn();
const deleteTransactionAction = vi.fn();

vi.mock('@/lib/auth/require-user', () => ({ requireUser }));
vi.mock('@/lib/journal', () => ({
  journalService: { findTransaction },
}));
vi.mock('./deleteTransaction', () => ({ deleteTransactionAction }));

import { deleteTransactionByUid } from './deleteTransactionByUid';

beforeEach(() => {
  requireUser.mockClear();
  findTransaction.mockReset();
  deleteTransactionAction.mockReset();
});

describe('deleteTransactionByUid', () => {
  it('resolves the per-transaction fingerprint and delegates', async () => {
    findTransaction.mockResolvedValue({ uid: 'u1', fingerprint: 'fp-1' });
    deleteTransactionAction.mockResolvedValue({ ok: true });

    const result = await deleteTransactionByUid('u1');

    expect(findTransaction).toHaveBeenCalledWith('user-1', 'u1');
    expect(deleteTransactionAction).toHaveBeenCalledWith('u1', 'fp-1');
    expect(result).toEqual({ ok: true });
  });

  it('returns not-found when the transaction is gone', async () => {
    findTransaction.mockResolvedValue(null);
    const result = await deleteTransactionByUid('missing');
    expect(deleteTransactionAction).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: false, message: 'Transaction not found.' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run features/transactions/actions/deleteTransactionByUid.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the action**

Create `features/transactions/actions/deleteTransactionByUid.ts`:

```ts
'use server';

import { deleteTransactionAction } from './deleteTransaction';
import type { DeleteTransactionResult } from './deleteTransaction';
import { requireUser } from '@/lib/auth/require-user';
import { journalService } from '@/lib/journal';

/**
 * Delete a transaction knowing only its uid — for row surfaces (account
 * register, dashboard, reconcile) that don't carry a fingerprint. Looks the
 * transaction up server-side, reads the parser's stamped per-transaction
 * fingerprint (the value performDelete compares against), and hands off to the
 * existing audited delete path.
 */
export async function deleteTransactionByUid(
  uid: string
): Promise<DeleteTransactionResult> {
  const user = await requireUser();
  const tx = await journalService.findTransaction(user.id, uid);
  if (!tx) return { ok: false, message: 'Transaction not found.' };
  return deleteTransactionAction(uid, tx.fingerprint);
}
```

- [ ] **Step 4: Export it**

In `features/transactions/actions/index.ts`, add after the `deleteTransactionAction` export block:

```ts
export { deleteTransactionByUid } from './deleteTransactionByUid';
```

- [ ] **Step 5: Run test + typecheck**

Run: `pnpm exec vitest run features/transactions/actions/deleteTransactionByUid.test.ts && pnpm exec tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add features/transactions/actions/deleteTransactionByUid.ts features/transactions/actions/deleteTransactionByUid.test.ts features/transactions/actions/index.ts
git commit -m "feat(transactions): add deleteTransactionByUid resolving fingerprint server-side"
```

---

## Task 3: `TransactionRowView` type + main-list adapter

**Files:**
- Create: `features/transactions/row/rowView.ts`
- Test: `features/transactions/row/rowView.test.ts`

**Interfaces:**
- Consumes: `TransactionRow` from `@/lib/transactions/model`; `Transaction` (has `accountsSummary()`, `magnitudesByCurrency(): [string, number][]`, `toTemplate(): TemplateDraft`).
- Produces:
  - `type TransactionRowView` (fields below).
  - `transactionRowToView(row: TransactionRow): TransactionRowView`.

`amount` and `runningTotal` are newline-separated rendered tokens (one per commodity) so the shared component renders every surface's money the same way (`split('\n')` → `formatAmount`).

- [ ] **Step 1: Write the failing test**

Create `features/transactions/row/rowView.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { transactionRowToView } from './rowView';
import type { TransactionRow } from '@/lib/transactions/model';

const row: TransactionRow = {
  uid: 'u1',
  file: 'main.ledger',
  startLine: 1,
  date: '2026-01-15',
  payee: 'Coffee Shop',
  status: 'cleared',
  note: '',
  fingerprint: 'fp',
  postings: [
    { account: 'Expenses:Coffee', amount: '5.00', currency: 'USD' },
    { account: 'Assets:Checking', amount: '-5.00', currency: 'USD' },
  ],
};

describe('transactionRowToView', () => {
  it('maps core fields, accounts summary, amount, uid, and a template draft', () => {
    const view = transactionRowToView(row);
    expect(view.date).toBe('2026-01-15');
    expect(view.payee).toBe('Coffee Shop');
    expect(view.status).toBe('cleared');
    expect(view.uid).toBe('u1');
    expect(view.accountsSummary).toContain('Expenses:Coffee');
    expect(view.amount).toContain('USD');
    expect(view.templateDraft).toBeDefined();
    expect(view.templateDraft?.payee).toBe('Coffee Shop');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run features/transactions/row/rowView.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `features/transactions/row/rowView.ts`:

```ts
import type { TransactionRow, TransactionStatus } from '@/lib/transactions/model';
import { Transaction } from '@/lib/transactions/model';
import type { TemplateDraft } from '@/lib/templates/schema';

export type TransactionRowView = {
  // Core — rendered identically on every surface.
  date: string; // ISO 'YYYY-MM-DD'
  payee: string;
  amount: string; // one or more '\n'-separated tokens, e.g. "USD -5.00"
  status?: TransactionStatus;
  uid?: string;

  // Optional extras — each rendered in a consistent slot when present.
  accountsSummary?: string; // main list: "Expenses:Coffee → Assets:Checking"
  account?: string; // dashboard / reconcile single-account context
  runningTotal?: string; // account register (same '\n' shape as amount)
  age?: number; // reconcile (days)

  // Save-as-template needs full postings; only the main list supplies this.
  templateDraft?: TemplateDraft;
};

// Multi-currency magnitude tokens, one per line, matching the register/amount
// rendering used across surfaces.
const amountLines = (tx: Transaction): string =>
  tx
    .magnitudesByCurrency()
    .map(([currency, magnitude]) => `${currency} ${magnitude.toFixed(2)}`)
    .join('\n');

export const transactionRowToView = (
  row: TransactionRow
): TransactionRowView => {
  const tx = Transaction.from(row);
  return {
    date: row.date,
    payee: row.payee,
    status: row.status,
    uid: row.uid,
    accountsSummary: tx.accountsSummary(),
    amount: amountLines(tx),
    templateDraft: tx.toTemplate(),
  };
};
```

(`TransactionStatus`, `accountsSummary()`, `magnitudesByCurrency(): Array<[string, number]>`, and `toTemplate(): TemplateDraft` are all defined in `lib/transactions/model.ts` — verified.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run features/transactions/row/rowView.test.ts && pnpm exec tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add features/transactions/row/rowView.ts features/transactions/row/rowView.test.ts
git commit -m "feat(transactions): add TransactionRowView + main-list adapter"
```

---

## Task 4: Account-register adapter

**Files:**
- Create: `features/transactions/row/registerRows.ts`
- Test: `features/transactions/row/registerRows.test.ts`

**Interfaces:**
- Consumes: `uidFromNote` (Task 1); `TransactionRowView` (Task 3).
- Produces:
  - `REGISTER_FORMAT = 'NNN%D|%P|%t|%T|%(note)'` (string).
  - `parseAccountRegister(stdout: string): TransactionRowView[]` — ledger order preserved (caller reverses if needed).

Format field order: date `%D`, payee `%P`, amount `%t`, running total `%T` (may be multi-line/multi-commodity — no `|`), note `%(note)` (may itself contain `|`, so it is the rejoined remainder).

- [ ] **Step 1: Write the failing test**

Create `features/transactions/row/registerRows.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseAccountRegister } from './registerRows';

describe('parseAccountRegister', () => {
  it('parses date/payee/amount/total and extracts the uid from the note', () => {
    const stdout =
      'NNN2026/01/01|Coffee|$ -5.00|$ -5.00| :uid: 01HZY0Z9QK8G7F6E5D4C3B2A1Z';
    const [row] = parseAccountRegister(stdout);
    expect(row.date).toBe('2026/01/01');
    expect(row.payee).toBe('Coffee');
    expect(row.amount).toBe('$ -5.00');
    expect(row.runningTotal).toBe('$ -5.00');
    expect(row.uid).toBe('01HZY0Z9QK8G7F6E5D4C3B2A1Z');
  });

  it('has no uid when the note lacks one (actions disabled downstream)', () => {
    const stdout = 'NNN2026/01/02|Book|$ -20.00|$ -25.00|';
    const [row] = parseAccountRegister(stdout);
    expect(row.uid).toBeUndefined();
  });

  it('keeps a multi-commodity running total intact and preserves a note pipe', () => {
    const stdout =
      'NNN2026/03/01|Split|KIRT 100|$ -5.00\nKIRT 100|a|b :uid: 01HZY0Z9QK8G7F6E5D4C3B2A1Z';
    const [row] = parseAccountRegister(stdout);
    expect(row.runningTotal).toBe('$ -5.00\nKIRT 100');
    expect(row.uid).toBe('01HZY0Z9QK8G7F6E5D4C3B2A1Z');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run features/transactions/row/registerRows.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `features/transactions/row/registerRows.ts`:

```ts
import type { TransactionRowView } from './rowView';
import { uidFromNote } from '@/lib/journal/uid';

// Row separator `NNN`; fields joined by `|`. `%T` (total) may span multiple
// commodities (embedded newlines, no `|`); `%(note)` may itself contain `|`, so
// it is taken as the rejoined remainder after the four fixed leading fields.
export const REGISTER_FORMAT = 'NNN%D|%P|%t|%T|%(note)';

export const parseAccountRegister = (
  stdout: string
): TransactionRowView[] =>
  stdout
    .split('NNN')
    .filter(Boolean)
    .map((chunk) => {
      const cols = chunk.split('|');
      const date = (cols[0] ?? '').trim();
      const payee = (cols[1] ?? '').trim();
      const amount = (cols[2] ?? '').trim();
      const runningTotal = (cols[3] ?? '').trim();
      const note = cols.slice(4).join('|');
      const uid = uidFromNote(note) ?? undefined;
      return { date, payee, amount, runningTotal, uid };
    });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run features/transactions/row/registerRows.test.ts && pnpm exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add features/transactions/row/registerRows.ts features/transactions/row/registerRows.test.ts
git commit -m "feat(transactions): parse account register rows into the shared view"
```

---

## Task 5: Generalize `RowActions`

**Files:**
- Modify: `features/transactions/RowActions.tsx`
- Test: none new (behavior covered by Task 2 + manual); keep it compiling.

**Interfaces:**
- Consumes: `deleteTransactionByUid` (Task 2); `SaveAsTemplateDialog`; `TemplateDraft`.
- Produces: `RowActions({ uid, templateDraft }: { uid: string; templateDraft?: TemplateDraft })`.

Currently `RowActions` takes a full `TransactionRow` and computes `templateDraft` internally, and delete uses `t.fingerprint`. New contract: uid-driven delete (fingerprint resolved server-side), and save-as-template only when a `templateDraft` is passed.

- [ ] **Step 1: Rewrite `RowActions.tsx`**

Replace the file with:

```tsx
'use client';

import { MoreHorizontal, Pencil, Trash2, BookmarkPlus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { deleteTransactionByUid } from './actions';
import ConfirmDialog from '@/components/ConfirmDialog';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SaveAsTemplateDialog } from '@/features/templates/SaveAsTemplateButton';
import type { TemplateDraft } from '@/lib/templates/schema';
import { useRouter } from 'next/navigation';

type Props = { uid: string; templateDraft?: TemplateDraft };

const RowActions = ({ uid, templateDraft }: Props) => {
  const router = useRouter();
  const [saveOpen, setSaveOpen] = useState(false);

  const onDelete = async () => {
    const res = await deleteTransactionByUid(uid);
    if (res.ok) toast.success('Transaction deleted');
    else toast.error(res.message);
    router.refresh();
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="ghost" size="icon-sm">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          }
        />
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onClick={() => router.push(`/transactions/${uid}/edit`)}
          >
            <Pencil className="h-4 w-4" />
            Edit
          </DropdownMenuItem>
          {templateDraft && (
            <DropdownMenuItem onClick={() => setSaveOpen(true)}>
              <BookmarkPlus className="h-4 w-4" />
              Save as template
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <ConfirmDialog
            title="Delete transaction?"
            description="This will permanently remove the transaction from the journal."
            confirmLabel="Delete"
            variant="destructive"
            onConfirm={onDelete}
          >
            <DropdownMenuItem variant="destructive" closeOnClick={false}>
              <Trash2 className="h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </ConfirmDialog>
        </DropdownMenuContent>
      </DropdownMenu>
      {templateDraft && (
        <SaveAsTemplateDialog
          open={saveOpen}
          onOpenChange={setSaveOpen}
          draft={templateDraft}
        />
      )}
    </>
  );
};

export default RowActions;
```

- [ ] **Step 2: Typecheck (expect a break in `TransactionRowItem` — fixed in Task 6)**

Run: `pnpm exec tsc --noEmit`
Expected: errors only in `TransactionRowItem.tsx` (old `<RowActions transaction={t} />` call). That is fixed next task; do not commit yet if it breaks other files — verify the only breakage is the old caller.

- [ ] **Step 3: Commit with its consumer (deferred)**

Do NOT commit alone — commit together with Task 6 so the tree stays green.

---

## Task 6: Shared `TransactionRow` component + rewire the main list

**Files:**
- Create: `features/transactions/row/TransactionRow.tsx`
- Modify: `features/transactions/TransactionList.tsx` (swap `TransactionRowItem` → adapter + `TransactionRow`)
- Delete: `features/transactions/TransactionRowItem.tsx`

**Interfaces:**
- Consumes: `TransactionRowView` (Task 3); `RowActions` (Task 5); `formatAmount`, `formatDateWithLocale`.
- Produces: `TransactionRow({ view }: { view: TransactionRowView })` (default export).

- [ ] **Step 1: Create the shared component**

Create `features/transactions/row/TransactionRow.tsx` (folds the mobile-card + desktop-grid layout from the old `TransactionRowItem`, driven by the view; the desktop grid adds an optional running-total column):

```tsx
import RowActions from '../RowActions';
import type { TransactionRowView } from './rowView';
import formatAmount from '@/utils/formatAmount';
import { Format, formatDateWithLocale } from '@/utils/formatDateCore';
import Link from 'next/link';

const statusBadge = (status: TransactionRowView['status']) => {
  if (status === 'cleared') return <span className="text-positive">✓</span>;
  if (status === 'pending') return <span className="text-warning">!</span>;
  return null;
};

// One formatted line per '\n'-separated commodity token.
const money = (value?: string) =>
  value
    ? value.split('\n').map((line, i) => (
        <span key={i} className="block">
          {formatAmount(line, true)}
        </span>
      ))
    : null;

const payeeNode = (view: TransactionRowView) =>
  view.uid ? (
    <Link href={`/transactions/${view.uid}/edit`} className="hover:underline">
      {view.payee}
    </Link>
  ) : (
    <span>{view.payee}</span>
  );

const actionsNode = (view: TransactionRowView) =>
  view.uid ? (
    <RowActions uid={view.uid} templateDraft={view.templateDraft} />
  ) : null;

// The middle descriptor: accounts summary (main list) or single account
// (dashboard/reconcile); empty on the account register.
const descriptor = (view: TransactionRowView) =>
  view.accountsSummary ?? view.account ?? '';

const TransactionRow = ({ view }: { view: TransactionRowView }) => (
  <>
    {/* Mobile: stacked card. */}
    <div className="rounded-lg border border-border p-3 text-sm md:hidden">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 font-medium break-words">
            {statusBadge(view.status)}
            {payeeNode(view)}
          </div>
          <div className="mt-0.5 text-xs tabular-nums text-muted-foreground">
            {formatDateWithLocale(view.date, Format.DATE)}
            {view.age !== undefined ? ` · ${view.age}d` : ''}
          </div>
        </div>
        <div className="shrink-0">{actionsNode(view)}</div>
      </div>
      <div className="mt-2 flex items-end justify-between gap-3">
        <span className="min-w-0 break-words text-xs text-muted-foreground">
          {descriptor(view)}
        </span>
        <span className="shrink-0 text-right tabular-nums">
          {money(view.amount)}
          {view.runningTotal && (
            <span className="mt-1 block text-xs text-muted-foreground">
              {money(view.runningTotal)}
            </span>
          )}
        </span>
      </div>
    </div>

    {/* Desktop: grid row. Columns: date | status | payee | descriptor |
        amount | total | actions. Total/age collapse to empty when absent. */}
    <div className="hidden grid-cols-[7rem_1.5rem_1fr_1fr_8rem_8rem_6rem] items-center gap-2 border-t border-border py-2 text-sm md:grid">
      <span className="whitespace-nowrap tabular-nums">
        {formatDateWithLocale(view.date, Format.DATE)}
      </span>
      <span>{statusBadge(view.status)}</span>
      <span className="min-w-0 truncate">{payeeNode(view)}</span>
      <span className="min-w-0 truncate text-muted-foreground">
        {descriptor(view)}
      </span>
      <span className="text-right whitespace-nowrap tabular-nums">
        {money(view.amount)}
      </span>
      <span className="text-right whitespace-nowrap tabular-nums text-muted-foreground">
        {money(view.runningTotal)}
      </span>
      <span className="text-right">{actionsNode(view)}</span>
    </div>
  </>
);

export default TransactionRow;
```

Note: the old `TransactionRowItem` rendered a "no uid" hint instead of null actions; that hint moves away (rows without uid simply show no menu). If the main list must keep the hint, add it back inside `actionsNode`.

- [ ] **Step 2: Rewire the main list**

In `features/transactions/TransactionList.tsx`: replace the import and render of `TransactionRowItem` with the adapter + shared row. Find the current usage (`grep -n "TransactionRowItem" features/transactions/TransactionList.tsx`), then:

- Replace `import TransactionRowItem from './TransactionRowItem';` with:
  ```tsx
  import TransactionRow from './row/TransactionRow';
  import { transactionRowToView } from './row/rowView';
  ```
- Replace the row render (e.g. `<TransactionRowItem row={row} />`) with:
  ```tsx
  <TransactionRow view={transactionRowToView(row)} />
  ```

If `TransactionList` also imported the desktop header columns, update the header grid template to the 7-column version (add the Total column header, or leave the header as-is if it renders headers separately — match column count).

- [ ] **Step 3: Delete the old component**

```bash
git rm features/transactions/TransactionRowItem.tsx
```

- [ ] **Step 4: Typecheck + existing tests**

Run: `pnpm exec tsc --noEmit && pnpm exec vitest run features/transactions`
Expected: no type errors; existing transaction tests pass.

- [ ] **Step 5: Verify the main list renders**

Run the app and open `/transactions`; confirm rows render with status/payee/accounts/amount and the actions menu (edit/delete/save-as-template) still work. (Use the `/run` skill or `pnpm dev`.)

- [ ] **Step 6: Commit (Tasks 5 + 6 together)**

```bash
git add features/transactions/RowActions.tsx features/transactions/row/TransactionRow.tsx features/transactions/TransactionList.tsx
git rm features/transactions/TransactionRowItem.tsx
git commit -m "feat(transactions): shared TransactionRow component + uid-driven actions"
```

---

## Task 7: Account register uses the shared row + actions

**Files:**
- Create: `app/accounts/[account]/AccountRegister.tsx` (client)
- Modify: `app/accounts/[account]/page.tsx`

**Interfaces:**
- Consumes: `parseAccountRegister`, `REGISTER_FORMAT` (Task 4); `TransactionRow` (Task 6).
- Produces: `AccountRegister({ views }: { views: TransactionRowView[] })`.

- [ ] **Step 1: Create the client wrapper**

Create `app/accounts/[account]/AccountRegister.tsx`:

```tsx
'use client';

import TransactionRow from '@/features/transactions/row/TransactionRow';
import type { TransactionRowView } from '@/features/transactions/row/rowView';

const AccountRegister = ({ views }: { views: TransactionRowView[] }) => {
  if (views.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground shadow-sm">
        No transactions
      </div>
    );
  }
  return (
    <div className="flex flex-col">
      {views.map((view, i) => (
        <TransactionRow key={view.uid ?? i} view={view} />
      ))}
    </div>
  );
};

export default AccountRegister;
```

- [ ] **Step 2: Switch the page to the new format + wrapper**

In `app/accounts/[account]/page.tsx`:

- Replace the register `runLedger` call and the manual `rows` parsing with:
  ```tsx
  import AccountRegister from './AccountRegister';
  import {
    REGISTER_FORMAT,
    parseAccountRegister,
  } from '@/features/transactions/row/registerRows';
  // ...
  const stdout = await runLedger(
    ['register', account, '--format', REGISTER_FORMAT],
    { sortByDate: false }
  );
  const views = parseAccountRegister(stdout).reverse(); // newest first, as before
  ```
- Replace the whole `<ul className="… md:hidden">…</ul>` mobile block AND the `<div className="hidden … md:block">…table…</div>` desktop block with:
  ```tsx
  <AccountRegister views={views} />
  ```
  (The shared row already handles mobile/desktop.)

- [ ] **Step 3: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Verify in the app**

Open `/accounts/Assets:Checking` (or any account): rows should match the main list's look, show the running Total column on desktop, and expose edit/delete on rows whose transaction has a uid. Delete a test transaction and confirm it disappears after refresh.

- [ ] **Step 5: Commit**

```bash
git add app/accounts/[account]/AccountRegister.tsx app/accounts/[account]/page.tsx
git commit -m "feat(accounts): account register uses the shared transaction row + actions"
```

---

## Task 8: Dashboard recent + Reconcile use the shared row + actions

**Files:**
- Modify: `features/dashboard/Dashboard.utils.ts`, `features/dashboard/Dashboard.tsx`
- Modify: `features/reconcile/Reconcile.utils.ts`, `features/reconcile/Reconcile.tsx`
- Test: extend `features/reconcile/Reconcile.utils.test.ts` (or create) + dashboard utils test if present.

**Interfaces:**
- Consumes: `uidFromNote` (Task 1); `TransactionRowView` (Task 3); `TransactionRow` (Task 6).

- [ ] **Step 1: Dashboard — add uid to the parser (failing test first)**

Add to `features/dashboard/Dashboard.utils.test.ts` (create if absent):

```ts
import { describe, expect, it } from 'vitest';
import { parseRecentPostings } from './Dashboard.utils';

describe('parseRecentPostings', () => {
  it('extracts date/payee/account/amount and uid from the note', () => {
    const stdout =
      'NNN2026/01/01|Coffee|Assets:Checking|$ -5.00| :uid: 01HZY0Z9QK8G7F6E5D4C3B2A1Z\n';
    const [row] = parseRecentPostings(stdout);
    expect(row).toEqual({
      date: '2026/01/01',
      payee: 'Coffee',
      account: 'Assets:Checking',
      amount: '$ -5.00',
      uid: '01HZY0Z9QK8G7F6E5D4C3B2A1Z',
    });
  });
});
```

Run: `pnpm exec vitest run features/dashboard/Dashboard.utils.test.ts` → FAIL.

- [ ] **Step 2: Dashboard — implement**

In `features/dashboard/Dashboard.utils.ts`:
- Add `uid?: string` to `RecentPosting`.
- Change the format to `'NNN%D|%P|%A|%t|%(note)\n'`.
- Extract a pure `parseRecentPostings(stdout: string): RecentPosting[]` (so it's testable) and call it from `getRecentTransactions`:

```ts
import { uidFromNote } from '@/lib/journal/uid';

export type RecentPosting = {
  date: string;
  payee: string;
  account: string;
  amount: string;
  uid?: string;
};

export const parseRecentPostings = (stdout: string): RecentPosting[] =>
  stdout
    .split('NNN')
    .map((line) => line.split('|'))
    .filter((cols) => cols.length >= 4 && cols[0].trim())
    .map((cols) => ({
      date: cols[0].trim(),
      payee: cols[1].trim(),
      account: cols[2].trim(),
      amount: cols[3].trim(),
      uid: uidFromNote(cols.slice(4).join('|')) ?? undefined,
    }));

export const getRecentTransactions = async (
  limit: number
): Promise<RecentPosting[]> => {
  const stdout = await runLedger([
    'reg',
    '--head',
    String(limit),
    '--format',
    'NNN%D|%P|%A|%t|%(note)\n',
  ]);
  return parseRecentPostings(stdout);
};
```

Run: `pnpm exec vitest run features/dashboard/Dashboard.utils.test.ts` → PASS.

- [ ] **Step 3: Dashboard — render shared rows**

In `features/dashboard/Dashboard.tsx`, replace the recent-transactions `<table>` block with a map over `TransactionRow`, mapping each `RecentPosting` to a view inline:

```tsx
import TransactionRow from '@/features/transactions/row/TransactionRow';
// ...
<div className="flex flex-col">
  {recent.map((posting, i) => (
    <TransactionRow
      key={posting.uid ?? i}
      view={{
        date: posting.date,
        payee: posting.payee,
        amount: posting.amount,
        account: posting.account,
        uid: posting.uid,
      }}
    />
  ))}
</div>
```

(Keep the section heading/container; only the table body becomes rows.)

- [ ] **Step 4: Reconcile — add uid (failing test)**

Add to `features/reconcile/Reconcile.utils.test.ts` a case asserting `parseReconcileRows` fills `uid` from a 5th `%(note)` column, mirroring Step 1's shape (`uid: '01HZY0…'`). Run → FAIL.

- [ ] **Step 5: Reconcile — implement**

In `features/reconcile/Reconcile.utils.ts`:
- Add `uid?: string` to `ReconcileRow`.
- In the parser, stop truncating to 4 columns: keep the note as `cols.slice(4).join('|')`, set `uid: uidFromNote(note) ?? undefined`.
- Update the caller's ledger `--format` (in `Reconcile.tsx`) to `NNN%D|%P|%A|%t|%(note)\n`.

```ts
import { uidFromNote } from '@/lib/journal/uid';
// inside .map(...):
.map((cols) => {
  const [date, payee, account, amount] = cols.map((s) => s.trim());
  const days = Math.floor((now - new Date(date).getTime()) / 86_400_000);
  const uid = uidFromNote(cols.slice(4).join('|')) ?? undefined;
  return { date, payee, account, amount, days, uid };
});
```

Run: `pnpm exec vitest run features/reconcile` → PASS.

- [ ] **Step 6: Reconcile — render shared rows**

In `features/reconcile/Reconcile.tsx`, replace the `<table>` body with a map over `TransactionRow`, mapping each `ReconcileRow` to a view with `account` and `age: row.days`:

```tsx
import TransactionRow from '@/features/transactions/row/TransactionRow';
// ...
{rows.map((row, i) => (
  <TransactionRow
    key={row.uid ?? i}
    view={{
      date: row.date,
      payee: row.payee,
      amount: row.amount,
      account: row.account,
      age: row.days,
      uid: row.uid,
    }}
  />
))}
```

- [ ] **Step 7: Typecheck + tests + app check**

Run: `pnpm exec tsc --noEmit && pnpm exec vitest run features/dashboard features/reconcile`
Then open `/dashboard` and `/reconcile` and confirm rows render consistently with working edit/delete where a uid exists.

- [ ] **Step 8: Commit**

```bash
git add features/dashboard features/reconcile
git commit -m "feat: dashboard recent + reconcile use the shared transaction row"
```

---

## Final verification

- [ ] Run `pnpm exec tsc --noEmit` — clean.
- [ ] Run `pnpm exec vitest run` — all green.
- [ ] Manually verify all four surfaces (`/transactions`, `/accounts/<a>`, `/dashboard`, `/reconcile`): identical row look, edit/delete work everywhere a uid exists, save-as-template appears only on the main list, running Total shows on the account register, age shows on reconcile.
- [ ] Confirm aggregate pages (`/payees`, `/balance`, `/debts`, `/monthly`) are unchanged.

## Self-review notes (addressed)

- **Delete fingerprint:** uses the per-transaction fingerprint via `findTransaction` (Task 2), matching `performDelete`'s comparison — the journal-wide fingerprint would never match.
- **uid extraction:** note-specific `uidFromNote` (Task 1), because `%(note)` drops the leading `;` that `UID_LINE_REGEX` anchors on.
- **Pipe/newline safety:** register/dashboard/reconcile parsers take the note as the rejoined remainder after fixed leading fields, so a `|` in a note and multi-line `%T` totals don't misalign columns.
- **Legacy rows without uid:** render normally, actions hidden.
- **Out of scope:** Payees/Balance/Debts/Monthly untouched.
