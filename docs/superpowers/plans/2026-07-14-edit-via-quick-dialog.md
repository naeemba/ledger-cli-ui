# Edit via Simplified Entry Dialog — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make "Edit transaction" open the same simplified header dialogs used to create one — detect the transaction's type, open the matching prefilled form, and fall back to a Raw editor for shapes the simple forms can't hold.

**Architecture:** A module-level trigger store lets any row open one globally-mounted `TransactionEditDialog`. The dialog loads the transaction via a new server action, runs the existing `detectType`, and routes to either a reused `QuickTypeForm` (extracted from `QuickEntryContent`) or the existing `RawLens`. Save goes through the existing `updateTransactionAction`, carrying `uid` + `expectedFingerprint` unchanged.

**Tech Stack:** Next.js (App Router), React (`useSyncExternalStore`, `useReducer`), TypeScript, Vitest, existing ledger-backed transaction adapters.

## Global Constraints

- **Ledger does the accounting math, never JS/TS.** This feature adds none — it reuses adapters (`compile`/`detect`) and `updateTransactionAction`; ledger validates on save. (CLAUDE.md)
- **No abbreviations in identifiers.** Spell names out (`transaction`, not `txn`). `uid` is allowed. (naming rules)
- **No self-reference** in commits/comments/docs — write as a human author; no Claude/Anthropic mentions, no co-author trailer.
- **Fingerprint is carried through unchanged** from `tx.fingerprint`; never re-hash a reconstruction (the concurrency guard compares this exact value).
- **The `/transactions/[uid]/edit` route stays untouched** as the fallback target.
- Tests use Vitest: `import { describe, expect, it } from 'vitest'`. Run with `pnpm test`.

---

### Task 1: Trigger store

**Files:**
- Create: `features/transactions/editTransactionStore.ts`
- Test: `features/transactions/editTransactionStore.test.ts`

**Interfaces:**
- Produces:
  - `openEditTransaction(uid: string): void`
  - `closeEditTransaction(): void`
  - `useEditTransactionUid(): string | null`

- [ ] **Step 1: Write the failing test**

```ts
// features/transactions/editTransactionStore.test.ts
import { describe, expect, it } from 'vitest';
import {
  openEditTransaction,
  closeEditTransaction,
  editTransactionStore,
} from './editTransactionStore';

describe('editTransactionStore', () => {
  it('notifies subscribers when the edit target changes', () => {
    let notified = 0;
    const unsubscribe = editTransactionStore.subscribe(() => {
      notified += 1;
    });
    expect(editTransactionStore.getSnapshot()).toBeNull();

    openEditTransaction('uid-1');
    expect(editTransactionStore.getSnapshot()).toBe('uid-1');
    expect(notified).toBe(1);

    closeEditTransaction();
    expect(editTransactionStore.getSnapshot()).toBeNull();
    expect(notified).toBe(2);

    unsubscribe();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run features/transactions/editTransactionStore.test.ts`
Expected: FAIL — cannot find module `./editTransactionStore`.

- [ ] **Step 3: Write minimal implementation**

```ts
// features/transactions/editTransactionStore.ts
'use client';

import { useSyncExternalStore } from 'react';

// A tiny module-level store so any row (in any surface) can open the one
// globally-mounted edit dialog, without a Context provider wrapping every list.
let current: string | null = null;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((listener) => listener());

export const editTransactionStore = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getSnapshot(): string | null {
    return current;
  },
};

export function openEditTransaction(uid: string): void {
  current = uid;
  emit();
}

export function closeEditTransaction(): void {
  current = null;
  emit();
}

export function useEditTransactionUid(): string | null {
  return useSyncExternalStore(
    editTransactionStore.subscribe,
    editTransactionStore.getSnapshot,
    () => null
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run features/transactions/editTransactionStore.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add features/transactions/editTransactionStore.ts features/transactions/editTransactionStore.test.ts
git commit -m "feat(transactions): add a store to open the shared edit dialog from any row"
```

---

### Task 2: Edit-surface routing helper

Pure logic that decides whether a loaded transaction opens a simplified form or the Raw editor. This is the correctness gate: splits/costs/undetectable shapes must go to Raw so the single-amount simple forms never silently drop postings.

**Files:**
- Create: `features/transactions/editSurface.ts`
- Test: `features/transactions/editSurface.test.ts`

**Interfaces:**
- Consumes: `detectType` (`./entry/types/registry`), `QUICK_ENTRY_SPECS` / `QuickEntrySpec` (`./quickEntrySpecs`), `HeaderFields` (`./entry/types/adapter`), `DraftState` (`./entry/draftReducer`).
- Produces:
  - `type EditSurface = { kind: 'type'; spec: QuickEntrySpec<HeaderFields>; fields: HeaderFields } | { kind: 'raw' }`
  - `pickEditSurface(draft: DraftState): EditSurface`

- [ ] **Step 1: Write the failing test**

```ts
// features/transactions/editSurface.test.ts
import { describe, expect, it } from 'vitest';
import { pickEditSurface } from './editSurface';
import { initDraft } from './entry/draftReducer';
import type { Posting } from '@/lib/transactions/model';

const draftOf = (postings: Posting[]) =>
  initDraft(
    { date: '2026-07-14', payee: 'Test', status: 'none', note: '', postings },
    'USD'
  );

describe('pickEditSurface', () => {
  it('routes a plain 2-posting expense to the expense form', () => {
    const surface = pickEditSurface(
      draftOf([
        { account: 'Expenses:Food', amount: '10', currency: 'USD' },
        { account: 'Assets:Cash', amount: '-10', currency: 'USD' },
      ])
    );
    expect(surface.kind).toBe('type');
    if (surface.kind === 'type') expect(surface.spec.kind).toBe('expense');
  });

  it('routes a split expense to raw (simple form would hide the split)', () => {
    const surface = pickEditSurface(
      draftOf([
        { account: 'Expenses:Food', amount: '10', currency: 'USD' },
        { account: 'Expenses:Tax', amount: '2', currency: 'USD' },
        { account: 'Assets:Cash', amount: '-12', currency: 'USD' },
      ])
    );
    expect(surface.kind).toBe('raw');
  });

  it('routes a posting with a cost annotation to raw', () => {
    const surface = pickEditSurface(
      draftOf([
        {
          account: 'Assets:Broker',
          amount: '1',
          currency: 'AAPL',
          cost: { amount: '100', currency: 'USD' },
        },
        { account: 'Assets:Cash', amount: '-100', currency: 'USD' },
      ])
    );
    expect(surface.kind).toBe('raw');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run features/transactions/editSurface.test.ts`
Expected: FAIL — cannot find module `./editSurface`.

- [ ] **Step 3: Write minimal implementation**

```ts
// features/transactions/editSurface.ts
import type { DraftState } from './entry/draftReducer';
import type { HeaderFields } from './entry/types/adapter';
import { detectType } from './entry/types/registry';
import { QUICK_ENTRY_SPECS, type QuickEntrySpec } from './quickEntrySpecs';

export type EditSurface =
  | { kind: 'type'; spec: QuickEntrySpec<HeaderFields>; fields: HeaderFields }
  | { kind: 'raw' };

// A simplified spec form renders a single amount/account pair. `detect` returns
// splits as `extraItems`, which those forms never show — so a detected shape
// with any split must fall through to Raw instead of round-tripping invisibly.
const hasSplits = (fields: unknown): boolean => {
  const extraItems = (fields as { extraItems?: unknown[] }).extraItems;
  return Array.isArray(extraItems) && extraItems.length > 0;
};

export function pickEditSurface(draft: DraftState): EditSurface {
  const detected = detectType(draft);
  if (!detected || hasSplits(detected.fields)) return { kind: 'raw' };
  const spec = QUICK_ENTRY_SPECS.find((entry) => entry.kind === detected.id);
  if (!spec) return { kind: 'raw' };
  return { kind: 'type', spec, fields: detected.fields as HeaderFields };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run features/transactions/editSurface.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add features/transactions/editSurface.ts features/transactions/editSurface.test.ts
git commit -m "feat(transactions): route detected simple shapes to a form, splits to raw"
```

---

### Task 3: `loadTransactionForEditAction` server action

**Files:**
- Create: `features/transactions/actions/loadTransactionForEdit.ts`
- Modify: `features/transactions/actions/index.ts:9` (add export)

**Interfaces:**
- Consumes: `requireUser`, `journalService`, `getAvailableCurrencies`, `getAccountSuggestions`, `getPayeeSuggestions`, `TransactionJSON`.
- Produces:
  - `type LoadTransactionForEditResult = { ok: true; draft: TransactionJSON; fingerprint: string; accounts: string[]; payees: string[]; defaultCurrency: string; currencies: string[] } | { ok: false }`
  - `loadTransactionForEditAction(uid: string): Promise<LoadTransactionForEditResult>`

- [ ] **Step 1: Write the implementation**

This mirrors `EditTransaction.tsx` exactly, returning the same values the page component computes. (No unit test: it is a thin `requireUser` + `journalService` orchestration like the sibling `loadTransactionPage.ts`, which has none; it is covered by the Task 7 end-to-end check.)

```ts
// features/transactions/actions/loadTransactionForEdit.ts
'use server';

import { requireUser } from '@/lib/auth/require-user';
import { journalService } from '@/lib/journal';
import { getAvailableCurrencies } from '@/lib/settings';
import type { TransactionJSON } from '@/lib/transactions/model';
import {
  getAccountSuggestions,
  getPayeeSuggestions,
} from '@/lib/transactions/suggestions';

export type LoadTransactionForEditResult =
  | {
      ok: true;
      draft: TransactionJSON;
      fingerprint: string;
      accounts: string[];
      payees: string[];
      defaultCurrency: string;
      currencies: string[];
    }
  | { ok: false };

export async function loadTransactionForEditAction(
  uid: string
): Promise<LoadTransactionForEditResult> {
  const user = await requireUser();
  const transaction = await journalService.findTransaction(user.id, uid);
  if (!transaction) return { ok: false };

  const [{ currencies, base: defaultCurrency }, accounts, payees] =
    await Promise.all([
      getAvailableCurrencies(),
      getAccountSuggestions(),
      getPayeeSuggestions(),
    ]);

  // Carry the parser's canonical fingerprint through unchanged — the concurrency
  // guard in editTransaction recomputes and compares this exact value.
  return {
    ok: true,
    draft: transaction.withDefaultCurrency(defaultCurrency).toWire('edit'),
    fingerprint: transaction.fingerprint ?? '',
    accounts,
    payees,
    defaultCurrency,
    currencies,
  };
}
```

- [ ] **Step 2: Add the export**

In `features/transactions/actions/index.ts`, after line 9 (`export { loadTransactionPageAction } ...`), add:

```ts
export {
  loadTransactionForEditAction,
  type LoadTransactionForEditResult,
} from './loadTransactionForEdit';
```

- [ ] **Step 3: Verify it type-checks**

Run: `pnpm exec tsc --noEmit`
Expected: no errors from the new file.

- [ ] **Step 4: Commit**

```bash
git add features/transactions/actions/loadTransactionForEdit.ts features/transactions/actions/index.ts
git commit -m "feat(transactions): add server action to load one transaction for editing"
```

---

### Task 4: Extract `QuickTypeForm`, reuse it in `QuickEntry`

Pull the type-form body out of `QuickEntryContent` so both create and edit reuse it. The save side becomes an injected `onSave(draft) => Promise<TransactionActionState>` so the same form serves create (`createTransactionAction`) and edit (`updateTransactionAction`).

**Files:**
- Create: `features/transactions/QuickTypeForm.tsx`
- Modify: `features/transactions/QuickEntry.tsx` (replace `QuickEntryContent` body with `QuickTypeForm`)

**Interfaces:**
- Consumes: `QuickEntrySpec` / `HeaderFields`, `Field` (`./entry/typeForms/fields`), `DraftState` (`./entry/draftReducer`), `TransactionActionState` (`./actions`), UI `Dialog*`/`Input`/`Label`/`Button`.
- Produces:
  - `type QuickTypeFormProps = { spec: QuickEntrySpec<HeaderFields>; accounts: string[]; defaultCurrency: string; initialFields?: HeaderFields; onSave: (draft: DraftState) => Promise<TransactionActionState>; onSwitchToRaw?: (draft: DraftState) => void; onDone: () => void }`
  - `QuickTypeForm(props: QuickTypeFormProps): React.JSX.Element` (returns a `<DialogContent>`)

- [ ] **Step 1: Create `QuickTypeForm.tsx`**

```tsx
// features/transactions/QuickTypeForm.tsx
'use client';

import { useState, useTransition } from 'react';
import type { TransactionActionState } from './actions';
import type { DraftState } from './entry/draftReducer';
import { Field } from './entry/typeForms/fields';
import type { HeaderFields } from './entry/types/adapter';
import type { QuickEntrySpec } from './quickEntrySpecs';
import { Button } from '@/components/ui/button';
import {
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export type QuickTypeFormProps = {
  spec: QuickEntrySpec<HeaderFields>;
  accounts: string[];
  defaultCurrency: string;
  // Edit seeds from detectType; create leaves it undefined and uses makeEmpty.
  initialFields?: HeaderFields;
  onSave: (draft: DraftState) => Promise<TransactionActionState>;
  // Edit only: hands the compiled draft to the Raw fallback.
  onSwitchToRaw?: (draft: DraftState) => void;
  onDone: () => void;
};

const firstFieldError = (state: TransactionActionState): string | undefined =>
  state.fieldErrors ? Object.values(state.fieldErrors)[0] : undefined;

/**
 * One simplified entry type's form. Owns field state and compiles via the spec's
 * adapter, then hands the draft to the injected `onSave` — so ledger stays the
 * authority on whether the entry balances, whether it is a create or an edit.
 */
export function QuickTypeForm({
  spec,
  accounts,
  defaultCurrency,
  initialFields,
  onSave,
  onSwitchToRaw,
  onDone,
}: QuickTypeFormProps) {
  const [fields, setFields] = useState<HeaderFields>(
    () => initialFields ?? spec.makeEmpty({ accounts, defaultCurrency })
  );
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  const update = (patch: Partial<HeaderFields>) =>
    setFields((previous) => ({ ...previous, ...patch }));

  const compile = (): DraftState => {
    const payee =
      fields.payee.trim() || spec.resolvePayee?.(fields) || spec.label;
    return spec.compile({ ...fields, payee }, { defaultCurrency });
  };

  const save = () => {
    const invalid = spec.validate(fields);
    if (invalid) return setError(invalid);
    startTransition(async () => {
      const result = await onSave(compile());
      if (result.ok) onDone();
      else
        setError(
          result.formError ?? firstFieldError(result) ?? 'Could not save.'
        );
    });
  };

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>
          {spec.icon} {spec.label}
        </DialogTitle>
      </DialogHeader>

      <div className="flex flex-col gap-4">
        <spec.Fields
          fields={fields}
          update={update}
          accounts={accounts}
          defaultCurrency={defaultCurrency}
        />

        <div className="grid grid-cols-2 gap-3">
          <Field label="Date">
            <Input
              type="date"
              value={fields.date}
              onChange={(event) => update({ date: event.target.value })}
            />
          </Field>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="quick-entry-payee">
              Description{' '}
              <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="quick-entry-payee"
              value={fields.payee}
              onChange={(event) => update({ payee: event.target.value })}
              placeholder="What was it for?"
            />
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      <DialogFooter showCloseButton>
        {onSwitchToRaw && (
          <Button
            type="button"
            variant="ghost"
            className="mr-auto"
            onClick={() => onSwitchToRaw(compile())}
          >
            Edit as raw
          </Button>
        )}
        <Button onClick={save} disabled={pending}>
          {pending ? 'Saving…' : 'Save'}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
```

- [ ] **Step 2: Rewrite `QuickEntry.tsx` to use `QuickTypeForm`**

Replace the whole file with this (drops the inline `QuickEntryContent`; the create save becomes an `onSave` wrapper):

```tsx
// features/transactions/QuickEntry.tsx
'use client';

import { ChevronDownIcon, PlusIcon } from 'lucide-react';
import { useState } from 'react';
import { createTransactionAction } from './actions';
import { serializeDraftJson } from './entry/draftReducer';
import type { HeaderFields } from './entry/types/adapter';
import { QuickTypeForm } from './QuickTypeForm';
import { QUICK_ENTRY_SPECS } from './quickEntrySpecs';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useRouter } from 'next/navigation';

type Props = { accounts: string[]; defaultCurrency: string };

/**
 * Split button in the app header: the primary click logs an expense; the caret
 * opens a menu for the other entry types. Mounted globally so it's reachable
 * from every page.
 */
export default function QuickEntry({ accounts, defaultCurrency }: Props) {
  const router = useRouter();
  const [active, setActive] = useState<string | null>(null);
  const [primary, ...rest] = QUICK_ENTRY_SPECS;
  const spec = QUICK_ENTRY_SPECS.find((entry) => entry.kind === active) ?? null;

  const onSave = async (draft: Parameters<typeof serializeDraftJson>[0]) => {
    const formData = new FormData();
    formData.set('draft', serializeDraftJson(draft, 'create'));
    const result = await createTransactionAction(null, formData);
    if (result.ok) router.refresh();
    return result;
  };

  return (
    <>
      <div className="inline-flex">
        <Button
          size="sm"
          variant="outline"
          className="h-8 rounded-r-none"
          onClick={() => setActive(primary.kind)}
        >
          <PlusIcon />
          <span className="hidden sm:inline">{primary.label}</span>
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                size="sm"
                variant="outline"
                className="h-8 rounded-l-none border-l-0 px-1.5"
                aria-label="More entry types"
              >
                <ChevronDownIcon />
              </Button>
            }
          />
          <DropdownMenuContent align="end">
            {rest.map((entry) => (
              <DropdownMenuItem
                key={entry.kind}
                onClick={() => setActive(entry.kind)}
              >
                <span className="mr-1">{entry.icon}</span>
                {entry.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Dialog
        open={spec !== null}
        onOpenChange={(next) => {
          if (!next) setActive(null);
        }}
      >
        {spec && (
          <QuickTypeForm
            key={spec.kind}
            spec={spec as QuickEntrySpecFor<HeaderFields>}
            accounts={accounts}
            defaultCurrency={defaultCurrency}
            onSave={onSave}
            onDone={() => setActive(null)}
          />
        )}
      </Dialog>
    </>
  );
}

type QuickEntrySpecFor<F extends HeaderFields> = Parameters<
  typeof QuickTypeForm
>[0]['spec'] &
  Record<never, F>;
```

Note: `QUICK_ENTRY_SPECS` is already erased to `readonly QuickEntrySpec<HeaderFields>[]`, so `spec` passes to `QuickTypeForm` directly; if `tsc` complains about the alias above, simplify by importing `QuickEntrySpec` and typing `spec` as `QuickEntrySpec<HeaderFields>` — drop the `QuickEntrySpecFor` helper. (Keep whichever compiles; the helper only exists to avoid an unused import.)

- [ ] **Step 3: Verify create still works — type-check + existing tests**

Run: `pnpm exec tsc --noEmit && pnpm exec vitest run features/transactions`
Expected: no type errors; existing QuickEntry/transaction tests still pass.

- [ ] **Step 4: Commit**

```bash
git add features/transactions/QuickTypeForm.tsx features/transactions/QuickEntry.tsx
git commit -m "refactor(transactions): extract QuickTypeForm so create and edit share it"
```

---

### Task 5: `TransactionEditDialog`

The globally-mounted dialog. On a non-null store uid it loads the transaction, reconstructs the draft, routes via `pickEditSurface`, and renders the simplified form or the Raw editor — both saving through `updateTransactionAction`.

**Files:**
- Create: `features/transactions/TransactionEditDialog.tsx`

**Interfaces:**
- Consumes: `useEditTransactionUid` / `closeEditTransaction` (Task 1), `pickEditSurface` (Task 2), `loadTransactionForEditAction` / `LoadTransactionForEditResult` (Task 3), `QuickTypeForm` (Task 4), `updateTransactionAction` / `TransactionActionState`, `initDraft` / `draftReducer` / `serializeDraftJson`, `RawLens`.
- Produces: `TransactionEditDialog(): React.JSX.Element` (default export) — takes no props; mounted once.

- [ ] **Step 1: Write the component**

```tsx
// features/transactions/TransactionEditDialog.tsx
'use client';

import { useEffect, useReducer, useState, useTransition } from 'react';
import {
  loadTransactionForEditAction,
  updateTransactionAction,
  type LoadTransactionForEditResult,
} from './actions';
import {
  closeEditTransaction,
  useEditTransactionUid,
} from './editTransactionStore';
import { pickEditSurface, type EditSurface } from './editSurface';
import {
  draftReducer,
  initDraft,
  serializeDraftJson,
  type DraftState,
} from './entry/draftReducer';
import { RawLens } from './entry/RawLens';
import { QuickTypeForm } from './QuickTypeForm';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useRouter } from 'next/navigation';

type Loaded = Extract<LoadTransactionForEditResult, { ok: true }>;

/**
 * One globally-mounted dialog that edits a transaction through the same
 * simplified forms used to create one. Opened from any row via the edit store;
 * routes detected simple shapes to QuickTypeForm and everything else to Raw.
 */
export default function TransactionEditDialog() {
  const uid = useEditTransactionUid();
  const router = useRouter();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [surface, setSurface] = useState<EditSurface | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!uid) {
      setLoaded(null);
      setSurface(null);
      setNotFound(false);
      return;
    }
    let cancelled = false;
    loadTransactionForEditAction(uid).then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setNotFound(true);
        return;
      }
      const draft = initDraft(result.draft, result.defaultCurrency);
      setLoaded(result);
      setSurface(pickEditSurface(draft));
    });
    return () => {
      cancelled = true;
    };
  }, [uid]);

  const onSave = async (draft: DraftState) => {
    if (!loaded || !uid) return { ok: false as const };
    const formData = new FormData();
    formData.set('draft', serializeDraftJson(draft, 'edit'));
    formData.set('uid', uid);
    formData.set('expectedFingerprint', loaded.fingerprint);
    const result = await updateTransactionAction(null, formData);
    if (result.ok) router.refresh();
    return result;
  };

  return (
    <Dialog
      open={uid !== null}
      onOpenChange={(next) => {
        if (!next) closeEditTransaction();
      }}
    >
      {uid && !loaded && !notFound && (
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Loading…</DialogTitle>
          </DialogHeader>
        </DialogContent>
      )}

      {notFound && (
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Transaction not found</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            It may have been deleted or re-imported. Reload the list.
          </p>
        </DialogContent>
      )}

      {loaded && surface?.kind === 'type' && (
        <QuickTypeForm
          key={uid ?? ''}
          spec={surface.spec}
          accounts={loaded.accounts}
          defaultCurrency={loaded.defaultCurrency}
          initialFields={surface.fields}
          onSave={onSave}
          onSwitchToRaw={(draft) => setSurface({ kind: 'raw', seed: draft })}
          onDone={closeEditTransaction}
        />
      )}

      {loaded && surface?.kind === 'raw' && (
        <RawEditBody
          key={uid ?? ''}
          loaded={loaded}
          seed={'seed' in surface ? surface.seed : undefined}
          onSave={onSave}
          onDone={closeEditTransaction}
        />
      )}
    </Dialog>
  );
}

function RawEditBody({
  loaded,
  seed,
  onSave,
  onDone,
}: {
  loaded: Loaded;
  seed?: DraftState;
  onSave: (draft: DraftState) => Promise<{ ok: boolean; formError?: string }>;
  onDone: () => void;
}) {
  const [draft, dispatch] = useReducer(
    draftReducer,
    undefined,
    () => seed ?? initDraft(loaded.draft, loaded.defaultCurrency)
  );
  const [rawError, setRawError] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const save = () =>
    startTransition(async () => {
      const result = await onSave(draft);
      if (result.ok) onDone();
      else setError(result.formError ?? 'Could not save.');
    });

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>✏️ Edit transaction</DialogTitle>
      </DialogHeader>
      <RawLens
        draft={draft}
        dispatch={dispatch}
        onError={setRawError}
        accounts={loaded.accounts}
        payees={loaded.payees}
        commodities={loaded.currencies}
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <DialogFooter showCloseButton>
        <Button onClick={save} disabled={pending || rawError !== null}>
          {pending ? 'Saving…' : 'Save changes'}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
```

Note: `EditSurface` gains an optional `seed` on the raw variant here via the `{ kind: 'raw', seed: draft }` construction. Update `editSurface.ts`'s type to:
`| { kind: 'raw'; seed?: DraftState }` and import `DraftState` there. (`pickEditSurface` returns `{ kind: 'raw' }`, which still satisfies the optional `seed`.)

- [ ] **Step 2: Update the `EditSurface` type in `editSurface.ts`**

Change the union's raw arm and add the import:

```ts
import type { DraftState } from './entry/draftReducer';
// ...
export type EditSurface =
  | { kind: 'type'; spec: QuickEntrySpec<HeaderFields>; fields: HeaderFields }
  | { kind: 'raw'; seed?: DraftState };
```

- [ ] **Step 3: Type-check**

Run: `pnpm exec tsc --noEmit`
Expected: no errors. Re-run `pnpm exec vitest run features/transactions/editSurface.test.ts` — still PASS (the optional `seed` doesn't change `pickEditSurface`'s output).

- [ ] **Step 4: Commit**

```bash
git add features/transactions/TransactionEditDialog.tsx features/transactions/editSurface.ts
git commit -m "feat(transactions): edit dialog that routes to the simple form or raw"
```

---

### Task 6: Wire the triggers and mount the dialog

Point both row edit affordances at the store and mount the dialog globally.

**Files:**
- Create: `features/transactions/row/EditPayeeTrigger.tsx`
- Modify: `features/transactions/row/TransactionRow.tsx:23-30` (payee node)
- Modify: `features/transactions/RowActions.tsx:44-49` (Edit item) and remove the now-unused `useRouter` push for edit
- Modify: `features/transactions/QuickEntrySlot.tsx` (mount `TransactionEditDialog`)

**Interfaces:**
- Consumes: `openEditTransaction` (Task 1), `TransactionEditDialog` (Task 5).

- [ ] **Step 1: Create the payee trigger (client)**

`TransactionRow` is a server component; the payee needs a client click handler, so extract a tiny client button styled like the current link.

```tsx
// features/transactions/row/EditPayeeTrigger.tsx
'use client';

import { openEditTransaction } from '../editTransactionStore';

// The payee text opens the shared edit dialog in place (dialog is the primary
// edit path). Styled to match the former Link so the row looks unchanged.
export default function EditPayeeTrigger({
  uid,
  payee,
}: {
  uid: string;
  payee: string;
}) {
  return (
    <button
      type="button"
      onClick={() => openEditTransaction(uid)}
      className="text-left hover:underline"
    >
      {payee}
    </button>
  );
}
```

- [ ] **Step 2: Use it in `TransactionRow.tsx`**

Replace the `payeeNode` function (lines 23-30) with:

```tsx
const payeeNode = (view: TransactionRowView) =>
  view.uid ? (
    <EditPayeeTrigger uid={view.uid} payee={view.payee} />
  ) : (
    <span>{view.payee}</span>
  );
```

And update the imports at the top of the file — remove the now-unused `Link` import if it is used nowhere else (it is still used by `descriptor` for the account link, so KEEP `Link`), and add:

```tsx
import EditPayeeTrigger from './EditPayeeTrigger';
```

- [ ] **Step 3: Point `RowActions` Edit at the store**

In `features/transactions/RowActions.tsx`:
- Add import: `import { openEditTransaction } from './editTransactionStore';`
- Replace the Edit item's onClick (line 45): `onClick={() => openEditTransaction(uid)}`
- `useRouter` is still used by `onDelete` (`router.refresh()`), so keep it.

- [ ] **Step 4: Mount the dialog globally**

In `features/transactions/QuickEntrySlot.tsx`, render the edit dialog alongside `QuickEntry`:

```tsx
import QuickEntry from './QuickEntry';
import TransactionEditDialog from './TransactionEditDialog';
import { getAvailableCurrencies } from '@/lib/settings';
import { getAccountSuggestions } from '@/lib/transactions/suggestions';

export default async function QuickEntrySlot() {
  const [accounts, { base }] = await Promise.all([
    getAccountSuggestions(),
    getAvailableCurrencies(),
  ]);
  return (
    <>
      <QuickEntry accounts={accounts} defaultCurrency={base} />
      <TransactionEditDialog />
    </>
  );
}
```

- [ ] **Step 5: Type-check and run the transaction tests**

Run: `pnpm exec tsc --noEmit && pnpm exec vitest run features/transactions`
Expected: no type errors; all pass.

- [ ] **Step 6: Commit**

```bash
git add features/transactions/row/EditPayeeTrigger.tsx features/transactions/row/TransactionRow.tsx features/transactions/RowActions.tsx features/transactions/QuickEntrySlot.tsx
git commit -m "feat(transactions): open the edit dialog from the row menu and payee"
```

---

### Task 7: End-to-end verification in the running app

**Files:** none (manual/driven verification).

- [ ] **Step 1: Build and lint**

Run: `pnpm exec tsc --noEmit && pnpm lint && pnpm exec vitest run`
Expected: clean.

- [ ] **Step 2: Drive the app (use the `verify` skill or the browser tools)**

Start the dev server, sign in, open `/transactions`, then confirm:
1. Clicking a simple expense's **payee** opens the dialog on the **Expense** form, prefilled with its amount/category/paid-from.
2. Clicking **⋮ → Edit** on the same row opens the same dialog.
3. Editing the amount and pressing **Save** closes the dialog and the list reflects the new amount (the journal block was rewritten in place, not appended).
4. A **split** transaction (3+ postings) opens the **Raw** editor instead of a simple form; saving a valid edit works.
5. The header **create** split-button still creates a new expense (Task 4 regression check).

- [ ] **Step 3: Commit any fixes, then stop**

Only commit if Step 2 surfaced a fix. Otherwise the feature is complete.

---

## Self-Review

**Spec coverage:**
- Trigger store → Task 1. Routing gate (empty-extraItems) → Task 2. On-demand loader with unchanged fingerprint → Task 3. Simplified-form reuse via `QuickTypeForm` → Task 4. Detect→route→simple/raw + update save + one-way raw escape → Task 5. Both triggers (payee + ⋮ Edit) open dialog, global mount → Task 6. Fallback route left untouched → confirmed (no task modifies it). Tests (routing gate, round-trip via detect/compile is exercised by the gate test + e2e, edit save e2e) → Tasks 2 and 7.
- Deliberate simplifications (debt-as-transfer, one-way raw escape) are inherent in the design — no task needs to "add" them; `pickEditSurface` naturally selects Transfer for debt, and Task 5's `onSwitchToRaw` is one-way.

**Placeholder scan:** none — every code step is complete.

**Type consistency:** `openEditTransaction`/`closeEditTransaction`/`useEditTransactionUid` (Task 1) used verbatim in Tasks 5–6. `pickEditSurface`/`EditSurface` (Task 2) match Task 5 usage, including the `seed?` addition made explicit in Task 5 Step 2. `LoadTransactionForEditResult` (Task 3) is narrowed to `Loaded` in Task 5. `QuickTypeFormProps` (Task 4) matches both call sites. `onSave` returns `TransactionActionState` everywhere.
