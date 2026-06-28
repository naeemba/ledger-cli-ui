# Layered Transaction Entry — Phase 1: Lens Scaffold — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the transaction new/edit page into a tabbed shell that owns one shared draft, with today's form relocated into a "Form" tab — a pure refactor that adds no new user-facing entry logic but establishes the architecture later phases build on.

**Architecture:** Lift the in-progress transaction draft out of `TransactionForm` into a pure `draftReducer` owned by a new shell component, `TransactionEntry`. The shell renders a custom controlled `TabBar` (one tab, "Form", for now), holds the `<form>` + submit buttons + `useActionState`, and serializes the shared draft into the hidden `draft` input. The existing posting UI becomes a controlled presentational `FormLens` driven by the shared draft. `NewTransaction`/`EditTransaction` render `TransactionEntry` instead of `TransactionForm`.

**Tech Stack:** Next.js (app router, server actions), React 19 (`useActionState`, `useReducer`), TypeScript, Zod, Vitest (`node` env + `renderToStaticMarkup`), pnpm, Tailwind.

## Global Constraints

- **Source of truth is the ledger file.** This phase changes only the UI layer; no change to server actions, parser, or stored format.
- **Type is never stored.** N/A this phase (no type logic yet) but do not add any type/category field to the draft or postings.
- **Follow the existing test pattern.** Vitest `node` environment with `renderToStaticMarkup` from `react-dom/server`. Do NOT add `@testing-library/react` or `jsdom`. Interactive behavior (tab switching) is verified by a manual run step, not automated clicks.
- **Draft shape is the existing one:** `date · payee · status · note · uid? · postings[]` where a posting is `{ account: string; amount: string; currency: string }` and `status` is `'cleared' | 'pending' | 'none'`.
- **Package manager is pnpm.** Run a single test file with `pnpm vitest run <path>`; the full suite with `pnpm test`; type-check with `pnpm type-check`.
- **No attribution lines** in commit messages (no "Generated with" / `Co-Authored-By` trailers).

---

## File Structure

- `features/transactions/entry/draftReducer.ts` — **new.** Pure reducer + action creators + `DraftState` type + `serializeDraftJson`. The single source of draft-mutation logic. Fully unit-tested.
- `features/transactions/entry/TabBar.tsx` — **new.** Presentational controlled tab bar (buttons + active styling, `role="tablist"`). Knows nothing about transactions.
- `features/transactions/entry/FormLens.tsx` — **new.** The existing posting UI, relocated as a controlled component driven by `DraftState` + change callbacks.
- `features/transactions/entry/TransactionEntry.tsx` — **new.** Client shell: owns `useReducer(draftReducer)`, `useActionState`, active-tab state, the `<form>`, hidden `draft` input, submit buttons, success effects. Renders `TabBar` + the active lens.
- `features/transactions/TransactionForm.tsx` — **delete** at the end of the phase once its logic has moved into `FormLens` + `TransactionEntry`.
- `features/transactions/NewTransaction.tsx:72-79` — **modify** to render `TransactionEntry`.
- `features/transactions/EditTransaction.tsx:41-50` — **modify** to render `TransactionEntry`.

Reference (current state, from research):
- `TransactionForm` props: `{ accounts: string[]; payees: string[]; defaultCurrency: string; mode?: 'create' | 'edit'; initialDraft?: Omit<TransactionDraft,'date'> & { date?: string }; uid?: string; expectedFingerprint?: string; submitAction: SubmitAction; templateMissing?: boolean }`.
- `SubmitAction = (prev: TransactionActionState | null, formData: FormData) => Promise<TransactionActionState>`.
- Current submit serializes `{ date, payee, status, note|undefined, uid|undefined, postings[] }` to JSON in a hidden input named `draft` (`TransactionForm.tsx:186-202`).
- Serializer `formatTransaction(draft: TransactionDraft): string` exists at `lib/transactions/schema.ts:146`.

---

## Task 1: Pure draft reducer

**Files:**
- Create: `features/transactions/entry/draftReducer.ts`
- Test: `features/transactions/entry/draftReducer.test.ts`

**Interfaces:**
- Produces:
  - `type DraftPosting = { account: string; amount: string; currency: string }`
  - `type DraftState = { date: string; payee: string; status: 'cleared'|'pending'|'none'; note: string; uid?: string; postings: DraftPosting[] }`
  - `type DraftAction =` (discriminated union, see Step 3)
  - `function draftReducer(state: DraftState, action: DraftAction): DraftState`
  - `function emptyPostings(currency: string): DraftPosting[]` — returns two blank postings.
  - `function initDraft(input: { date: string } & Partial<DraftState>, defaultCurrency: string): DraftState`
  - `function serializeDraftJson(state: DraftState, mode: 'create' | 'edit'): string` — produces the exact JSON shape the server action expects (matches `TransactionForm.tsx:186-197`).

- [ ] **Step 1: Write failing tests**

```ts
// features/transactions/entry/draftReducer.test.ts
import { describe, it, expect } from 'vitest';
import {
  draftReducer,
  emptyPostings,
  initDraft,
  serializeDraftJson,
  type DraftState,
} from './draftReducer';

const base: DraftState = {
  date: '2026-06-29',
  payee: '',
  status: 'none',
  note: '',
  postings: [
    { account: '', amount: '', currency: 'USD' },
    { account: '', amount: '', currency: 'USD' },
  ],
};

describe('emptyPostings', () => {
  it('returns two blank postings in the given currency', () => {
    expect(emptyPostings('EUR')).toEqual([
      { account: '', amount: '', currency: 'EUR' },
      { account: '', amount: '', currency: 'EUR' },
    ]);
  });
});

describe('initDraft', () => {
  it('fills two blank postings when none provided', () => {
    const d = initDraft({ date: '2026-06-29' }, 'USD');
    expect(d.postings).toHaveLength(2);
    expect(d.status).toBe('none');
    expect(d.note).toBe('');
  });
  it('keeps provided postings and fields', () => {
    const d = initDraft(
      { date: '2026-06-29', payee: 'Acme', status: 'cleared',
        postings: [{ account: 'Assets:Cash', amount: '5', currency: 'USD' }] },
      'USD'
    );
    expect(d.payee).toBe('Acme');
    expect(d.status).toBe('cleared');
    expect(d.postings).toEqual([{ account: 'Assets:Cash', amount: '5', currency: 'USD' }]);
  });
});

describe('draftReducer', () => {
  it('setField updates a scalar field', () => {
    const s = draftReducer(base, { type: 'setField', field: 'payee', value: 'Whole Foods' });
    expect(s.payee).toBe('Whole Foods');
    expect(s).not.toBe(base); // immutable
  });
  it('setPosting updates one posting by index', () => {
    const s = draftReducer(base, { type: 'setPosting', index: 0, patch: { account: 'Expenses:Food' } });
    expect(s.postings[0].account).toBe('Expenses:Food');
    expect(s.postings[1]).toEqual(base.postings[1]);
  });
  it('addPosting appends a blank posting in the given currency', () => {
    const s = draftReducer(base, { type: 'addPosting', currency: 'USD' });
    expect(s.postings).toHaveLength(3);
    expect(s.postings[2]).toEqual({ account: '', amount: '', currency: 'USD' });
  });
  it('removePosting drops the posting at index but never below two', () => {
    const three = draftReducer(base, { type: 'addPosting', currency: 'USD' });
    const s = draftReducer(three, { type: 'removePosting', index: 2 });
    expect(s.postings).toHaveLength(2);
    const stillTwo = draftReducer(base, { type: 'removePosting', index: 0 });
    expect(stillTwo.postings).toHaveLength(2);
  });
  it('replaceAll swaps the entire draft', () => {
    const next: DraftState = { ...base, payee: 'X' };
    expect(draftReducer(base, { type: 'replaceAll', state: next })).toBe(next);
  });
});

describe('serializeDraftJson', () => {
  it('trims fields and omits empty note/uid in create mode', () => {
    const json = JSON.parse(serializeDraftJson(
      { ...base, payee: '  Acme  ', note: '   ',
        postings: [{ account: ' Assets:Cash ', amount: ' 5 ', currency: ' USD ' }] },
      'create'
    ));
    expect(json).toEqual({
      date: '2026-06-29', payee: 'Acme', status: 'none',
      note: undefined, uid: undefined,
      postings: [{ account: 'Assets:Cash', amount: '5', currency: 'USD' }],
    });
  });
  it('includes uid in edit mode', () => {
    const json = JSON.parse(serializeDraftJson({ ...base, uid: 'ULID123' }, 'edit'));
    expect(json.uid).toBe('ULID123');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run features/transactions/entry/draftReducer.test.ts`
Expected: FAIL — cannot resolve `./draftReducer`.

- [ ] **Step 3: Implement the reducer**

```ts
// features/transactions/entry/draftReducer.ts
export type DraftPosting = { account: string; amount: string; currency: string };

export type DraftStatus = 'cleared' | 'pending' | 'none';

export type DraftState = {
  date: string;
  payee: string;
  status: DraftStatus;
  note: string;
  uid?: string;
  postings: DraftPosting[];
};

export type DraftAction =
  | { type: 'setField'; field: 'date' | 'payee' | 'status' | 'note'; value: string }
  | { type: 'setPosting'; index: number; patch: Partial<DraftPosting> }
  | { type: 'addPosting'; currency: string }
  | { type: 'removePosting'; index: number }
  | { type: 'replaceAll'; state: DraftState };

export const emptyPostings = (currency: string): DraftPosting[] => [
  { account: '', amount: '', currency },
  { account: '', amount: '', currency },
];

export const initDraft = (
  input: { date: string } & Partial<DraftState>,
  defaultCurrency: string
): DraftState => ({
  date: input.date,
  payee: input.payee ?? '',
  status: input.status ?? 'none',
  note: input.note ?? '',
  uid: input.uid,
  postings: input.postings ?? emptyPostings(defaultCurrency),
});

export const draftReducer = (state: DraftState, action: DraftAction): DraftState => {
  switch (action.type) {
    case 'setField':
      return { ...state, [action.field]: action.value };
    case 'setPosting':
      return {
        ...state,
        postings: state.postings.map((p, i) =>
          i === action.index ? { ...p, ...action.patch } : p
        ),
      };
    case 'addPosting':
      return {
        ...state,
        postings: [...state.postings, { account: '', amount: '', currency: action.currency }],
      };
    case 'removePosting':
      if (state.postings.length <= 2) return state;
      return { ...state, postings: state.postings.filter((_, i) => i !== action.index) };
    case 'replaceAll':
      return action.state;
    default:
      return state;
  }
};

export const serializeDraftJson = (state: DraftState, mode: 'create' | 'edit'): string =>
  JSON.stringify({
    date: state.date,
    payee: state.payee.trim(),
    status: state.status,
    note: state.note.trim() || undefined,
    uid: mode === 'edit' ? state.uid : undefined,
    postings: state.postings.map((p) => ({
      account: p.account.trim(),
      amount: p.amount.trim(),
      currency: p.currency.trim(),
    })),
  });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run features/transactions/entry/draftReducer.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add features/transactions/entry/draftReducer.ts features/transactions/entry/draftReducer.test.ts
git commit -m "feat(transactions): pure draft reducer for layered entry"
```

---

## Task 2: TabBar presentational component

**Files:**
- Create: `features/transactions/entry/TabBar.tsx`
- Test: `features/transactions/entry/TabBar.test.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `type TabItem = { id: string; label: string; disabled?: boolean }`
  - `function TabBar(props: { tabs: TabItem[]; active: string; onSelect: (id: string) => void }): JSX.Element`

- [ ] **Step 1: Write failing tests**

```tsx
// features/transactions/entry/TabBar.test.tsx
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { TabBar } from './TabBar';

const html = (node: React.ReactNode) => renderToStaticMarkup(node);

describe('TabBar', () => {
  const tabs = [
    { id: 'form', label: 'Form' },
    { id: 'raw', label: 'Raw', disabled: true },
  ];
  it('renders every tab label', () => {
    const out = html(<TabBar tabs={tabs} active="form" onSelect={() => {}} />);
    expect(out).toContain('Form');
    expect(out).toContain('Raw');
  });
  it('marks the active tab with aria-selected="true"', () => {
    const out = html(<TabBar tabs={tabs} active="form" onSelect={() => {}} />);
    expect(out).toMatch(/aria-selected="true"[^>]*>Form|Form<\/button>/);
    expect(out).toContain('aria-selected="true"');
  });
  it('disables tabs marked disabled', () => {
    const out = html(<TabBar tabs={tabs} active="form" onSelect={() => {}} />);
    expect(out).toContain('disabled');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run features/transactions/entry/TabBar.test.tsx`
Expected: FAIL — cannot resolve `./TabBar`.

- [ ] **Step 3: Implement TabBar**

```tsx
// features/transactions/entry/TabBar.tsx
'use client';

export type TabItem = { id: string; label: string; disabled?: boolean };

export function TabBar({
  tabs,
  active,
  onSelect,
}: {
  tabs: TabItem[];
  active: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div role="tablist" className="flex gap-1 border-b border-border">
      {tabs.map((tab) => {
        const selected = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={selected}
            disabled={tab.disabled}
            onClick={() => onSelect(tab.id)}
            className={[
              'rounded-t-md border border-b-0 px-4 py-2 text-sm font-medium',
              selected ? 'bg-accent text-accent-foreground' : 'border-transparent opacity-60',
              tab.disabled ? 'cursor-not-allowed opacity-40' : 'cursor-pointer',
            ].join(' ')}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run features/transactions/entry/TabBar.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add features/transactions/entry/TabBar.tsx features/transactions/entry/TabBar.test.tsx
git commit -m "feat(transactions): controlled TabBar for entry lenses"
```

---

## Task 3: FormLens (relocate the existing posting UI as a controlled component)

**Files:**
- Create: `features/transactions/entry/FormLens.tsx`
- Modify (read for relocation): `features/transactions/TransactionForm.tsx` (the render JSX block beginning at the posting fields)
- Test: `features/transactions/entry/FormLens.test.tsx`

**Interfaces:**
- Consumes: `DraftState`, `DraftAction` from Task 1.
- Produces:
  - `function FormLens(props: { draft: DraftState; dispatch: (a: DraftAction) => void; accounts: string[]; payees: string[]; defaultCurrency: string }): JSX.Element`

**What to relocate:** `TransactionForm.tsx` currently renders the date input, payee combobox, status toggle group, note field, posting rows (`PostingRow`), the balance indicator, and the add-posting button against its local `useState` values (`date`, `payee`, `status`, `note`, `postings`) and setters. Move that JSX verbatim into `FormLens`, replacing every local-state read/write as follows:
- `date` → `draft.date`; `setDate(v)` → `dispatch({ type: 'setField', field: 'date', value: v })`
- `payee` → `draft.payee`; `setPayee(v)` → `dispatch({ type: 'setField', field: 'payee', value: v })`
- `status` → `draft.status`; `setStatus(v)` → `dispatch({ type: 'setField', field: 'status', value: v })`
- `note` → `draft.note`; `setNote(v)` → `dispatch({ type: 'setField', field: 'note', value: v })`
- per-row updates → `dispatch({ type: 'setPosting', index, patch })`
- add row → `dispatch({ type: 'addPosting', currency: defaultCurrency })`
- remove row → `dispatch({ type: 'removePosting', index })`
Keep importing the existing `PostingRow`, `AmountInput`, `BalanceIndicator`, status toggle, and combobox components unchanged. Do NOT move the `<form>`, hidden `draft` input, submit buttons, or `useActionState` — those move to the shell in Task 4.

- [ ] **Step 1: Write a failing smoke test**

```tsx
// features/transactions/entry/FormLens.test.tsx
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { FormLens } from './FormLens';
import { initDraft } from './draftReducer';

const html = (node: React.ReactNode) => renderToStaticMarkup(node);

describe('FormLens', () => {
  const draft = initDraft(
    { date: '2026-06-29', payee: 'Whole Foods',
      postings: [
        { account: 'Expenses:Groceries', amount: '42.50', currency: 'USD' },
        { account: 'Assets:Checking', amount: '-42.50', currency: 'USD' },
      ] },
    'USD'
  );
  it('renders the payee value and posting accounts', () => {
    const out = html(
      <FormLens draft={draft} dispatch={() => {}} accounts={['Assets:Checking']} payees={['Whole Foods']} defaultCurrency="USD" />
    );
    expect(out).toContain('Whole Foods');
    expect(out).toContain('Expenses:Groceries');
    expect(out).toContain('Assets:Checking');
  });
  it('renders the date value', () => {
    const out = html(
      <FormLens draft={draft} dispatch={() => {}} accounts={[]} payees={[]} defaultCurrency="USD" />
    );
    expect(out).toContain('2026-06-29');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run features/transactions/entry/FormLens.test.tsx`
Expected: FAIL — cannot resolve `./FormLens`.

- [ ] **Step 3: Implement FormLens**

Create `features/transactions/entry/FormLens.tsx` as a `'use client'` component with the signature in **Interfaces** above. Relocate the posting-UI JSX from `TransactionForm.tsx` per the substitution rules in **What to relocate**. Adjust the relative import paths for `PostingRow`/`AmountInput`/`BalanceIndicator`/combobox/toggle components (they move from `features/transactions/` to `features/transactions/entry/`, so a leading `../` is needed). The component takes `{ draft, dispatch, accounts, payees, defaultCurrency }` and contains **no** `<form>`, submit button, or `useActionState`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run features/transactions/entry/FormLens.test.tsx`
Expected: PASS.

- [ ] **Step 5: Type-check**

Run: `pnpm type-check`
Expected: PASS (no errors). Fix any import-path errors surfaced by the move.

- [ ] **Step 6: Commit**

```bash
git add features/transactions/entry/FormLens.tsx features/transactions/entry/FormLens.test.tsx
git commit -m "feat(transactions): extract controlled FormLens from TransactionForm"
```

---

## Task 4: TransactionEntry shell

**Files:**
- Create: `features/transactions/entry/TransactionEntry.tsx`
- Test: `features/transactions/entry/TransactionEntry.test.tsx`

**Interfaces:**
- Consumes: `draftReducer`, `initDraft`, `serializeDraftJson`, `DraftState` (Task 1); `TabBar` (Task 2); `FormLens` (Task 3); the existing `SubmitAction`/`TransactionActionState` types and success-effect logic currently in `TransactionForm.tsx`.
- Produces:
  - `function TransactionEntry(props: TransactionEntryProps): JSX.Element` where `TransactionEntryProps` mirrors the current `TransactionForm` props exactly: `{ accounts: string[]; payees: string[]; defaultCurrency: string; mode?: 'create' | 'edit'; initialDraft?: Omit<TransactionDraft,'date'> & { date?: string }; uid?: string; expectedFingerprint?: string; submitAction: SubmitAction; templateMissing?: boolean }`.

**Shell responsibilities (moved from TransactionForm):** compute `todayISO` for the default date; `const [draft, dispatch] = useReducer(draftReducer, undefined, () => initDraft({ ...initialDraft, date: initialDraft?.date ?? todayISO }, defaultCurrency))`; `const [active, setActive] = useState('form')`; `useActionState(submitAction, initialState)`; the existing success/redirect effects (`TransactionForm.tsx:113-135`); render the `<Card>` → `<form action={formAction}>` containing: the hidden `<input type="hidden" name="draft" value={serializeDraftJson(draft, mode === 'edit' ? 'edit' : 'create')} />`, the optional hidden `expectedFingerprint` input (if present, as today), the `<TabBar tabs={[{id:'form',label:'Form'}]} active={active} onSelect={setActive} />`, the active panel (only `form` for now → `<FormLens draft={draft} dispatch={dispatch} ... />`), the submit buttons ("Add transaction" / "Save & add another" / "Save changes" per mode, copied from current `TransactionForm`), the `templateMissing` notice, and the error/status messaging from `state`.

- [ ] **Step 1: Write failing smoke tests**

```tsx
// features/transactions/entry/TransactionEntry.test.tsx
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { TransactionEntry } from './TransactionEntry';

const html = (node: React.ReactNode) => renderToStaticMarkup(node);
const noopAction = async () => ({ ok: true }) as never;

describe('TransactionEntry', () => {
  const common = {
    accounts: ['Assets:Checking'],
    payees: ['Whole Foods'],
    defaultCurrency: 'USD',
    submitAction: noopAction,
  };
  it('renders the Form tab', () => {
    const out = html(<TransactionEntry {...common} initialDraft={{ payee: 'Whole Foods', status: 'none', postings: [
      { account: 'Expenses:Groceries', amount: '42.50', currency: 'USD' },
      { account: 'Assets:Checking', amount: '-42.50', currency: 'USD' },
    ] }} />);
    expect(out).toContain('Form');
    expect(out).toContain('Expenses:Groceries');
  });
  it('embeds a hidden draft input with serialized JSON', () => {
    const out = html(<TransactionEntry {...common} initialDraft={{ date: '2026-06-29', payee: 'Acme', status: 'none', postings: [
      { account: 'Income:Salary', amount: '-100', currency: 'USD' },
      { account: 'Assets:Checking', amount: '100', currency: 'USD' },
    ] }} />);
    expect(out).toContain('name="draft"');
    expect(out).toContain('Income:Salary');
    expect(out).toContain('2026-06-29');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run features/transactions/entry/TransactionEntry.test.tsx`
Expected: FAIL — cannot resolve `./TransactionEntry`.

- [ ] **Step 3: Implement the shell**

Create `features/transactions/entry/TransactionEntry.tsx` (`'use client'`) per **Shell responsibilities**. Reuse — do not reinvent — the `todayISO` computation, `initialState`, success effects, submit-button markup, and `templateMissing`/error messaging exactly as they appear in the current `TransactionForm.tsx`; only the state source changes (reducer instead of the five `useState`s) and the posting UI is now `<FormLens>`. Import `SubmitAction`/`TransactionActionState`/`TransactionDraft` from their current modules.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run features/transactions/entry/TransactionEntry.test.tsx`
Expected: PASS.

- [ ] **Step 5: Type-check**

Run: `pnpm type-check`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add features/transactions/entry/TransactionEntry.tsx features/transactions/entry/TransactionEntry.test.tsx
git commit -m "feat(transactions): tabbed TransactionEntry shell over shared draft"
```

---

## Task 5: Wire pages to TransactionEntry and remove TransactionForm

**Files:**
- Modify: `features/transactions/NewTransaction.tsx:72-79`
- Modify: `features/transactions/EditTransaction.tsx:41-50`
- Delete: `features/transactions/TransactionForm.tsx`
- Delete: `features/transactions/TransactionForm.test.tsx` (if present — replaced by the entry/* tests)

**Interfaces:**
- Consumes: `TransactionEntry` (Task 4).

- [ ] **Step 1: Swap the renders**

In `NewTransaction.tsx`, replace the `<TransactionForm ... />` element (lines 72-79) with `<TransactionEntry ... />`, keeping every prop identical. Update the import from `./TransactionForm` to `./entry/TransactionEntry`.

In `EditTransaction.tsx`, replace `<TransactionForm ... />` (lines 41-50) with `<TransactionEntry ... />`, keeping props (`mode="edit"`, `initialDraft`, `uid`, `expectedFingerprint`, `submitAction`, `accounts`, `payees`, `defaultCurrency`) identical. Update the import.

- [ ] **Step 2: Delete the dead component**

```bash
git rm features/transactions/TransactionForm.tsx
git rm features/transactions/TransactionForm.test.tsx 2>/dev/null || true
```

- [ ] **Step 3: Type-check and grep for stragglers**

Run: `pnpm type-check`
Expected: PASS.
Run: `git grep -n "TransactionForm"`
Expected: no remaining references (empty output).

- [ ] **Step 4: Full test suite**

Run: `pnpm test`
Expected: PASS — all suites green.

- [ ] **Step 5: Commit**

```bash
git add features/transactions/NewTransaction.tsx features/transactions/EditTransaction.tsx
git commit -m "refactor(transactions): render TransactionEntry, drop TransactionForm"
```

---

## Task 6: Manual verification (interactive behavior not covered by static tests)

**Files:** none (verification only).

- [ ] **Step 1: Start the app**

Run: `pnpm dev`
Open `http://localhost:3000/transactions/new`.

- [ ] **Step 2: Verify create flow unchanged**

Confirm: the page shows a single "Form" tab with the posting UI beneath it; date defaults to today; entering payee, two postings (e.g. `Expenses:Groceries 42.50` and `Assets:Checking` blank) shows the balance indicator; "Add transaction" saves and redirects exactly as before; "Save & add another" resets in place.

- [ ] **Step 3: Verify edit flow unchanged**

Open an existing transaction's edit page (`/transactions/<uid>/edit`). Confirm the form is prefilled, "Save changes" persists, and the concurrent-edit fingerprint still guards (no regression).

- [ ] **Step 4: Verify template prefill**

From `/transactions/new`, pick a template (if any exist) and confirm the Form tab prefills from it.

- [ ] **Step 5: Record the result**

If all pass, the phase is complete. If anything regressed, fix under TDD before closing the phase. No commit needed for a clean verification.

---

## Self-Review

- **Spec coverage (Phase 1 scope):** tabbed shell over one shared draft → Tasks 1+4; today's form relocated into a Form tab → Tasks 3+5; pure refactor / no new entry logic → no new lens behavior added, only Form tab present; foundation for later lenses (shared draft + reducer + TabBar) → Tasks 1+2+4. Raw/Type lenses, settings, and account classification are intentionally out of this phase (later plans).
- **Placeholder scan:** none — every code step shows real code or an exact relocation rule with explicit substitutions; the one relocation task references concrete current symbols and line ranges rather than re-pasting unseen JSX.
- **Type consistency:** `DraftState`/`DraftPosting`/`DraftAction` defined in Task 1 are consumed unchanged in Tasks 3–4; `serializeDraftJson(state, mode)` signature is fixed in Task 1 and called in Task 4; `TransactionEntryProps` mirrors the documented current `TransactionForm` props so Task 5's prop pass-through type-checks.
- **Testing-infra limitation acknowledged:** tab *switching* and dispatch wiring are exercised manually (Task 6) because the repo has no jsdom/testing-library; all pure logic (reducer/serialization) is fully unit-tested (Task 1).
