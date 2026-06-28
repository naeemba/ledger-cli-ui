# Layered Transaction Entry — Phase 2: Raw Lens — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Raw" tab to the transaction entry shell where the user reads and edits the transaction as ledger text, kept in sync with the one shared draft via the existing parser (text → draft) and `formatTransaction` (draft → text), with inline parse errors that never clobber the draft.

**Architecture:** A pure `parsedBlockToDraft(block, prev?)` maps the parser's `ParsedBlock` onto the canonical `DraftState` (preserving the prior `uid` when the raw text omits it — protecting the edit-mode concurrency guard). `RawLens` is a `'use client'` controlled `<textarea>` seeded once on mount from `formatTransaction(draft)`; each keystroke re-parses via `parseBlock`, dispatching `replaceAll` only on a successful parse and reporting a parse error upward otherwise. The shell registers the `raw` tab, renders `RawLens` when active, and gates submit while the raw text is unparseable. Because lenses are conditionally mounted (Raw mounts only while its tab is active and no other lens is mounted then), the sync is one-directional within RawLens's lifetime — seed-on-mount, push-up-on-valid-edit — which sidesteps cursor-jump/partial-parse thrash without a draft→text effect.

**Tech Stack:** Next.js (app router, server actions), React 19 (`useReducer`, `useState`, `useEffect`), TypeScript, Zod, Vitest (`node` env + `renderToStaticMarkup`), pnpm, Tailwind.

## Global Constraints

- **Source of truth is the ledger file.** Phase 2 changes only the UI/entry layer; no change to server actions, the parser, or the stored format.
- **Type is never stored.** No type/category field is added to the draft or postings (that is Phase 3+).
- **Lossless lens.** The Raw tab is always enabled — it represents arbitrary postings. Form ↔ Raw conversion must round-trip.
- **Reuse, do not reinvent.** Text → draft uses the existing `parseBlock` (`lib/journal/parser.ts:75`). Draft → text uses the existing `formatTransaction` (`lib/transactions/schema.ts:146`). Do not write a new parser or formatter.
- **Follow the existing test pattern.** Vitest `node` environment with `renderToStaticMarkup` from `react-dom/server`. Do NOT add `@testing-library/react` or `jsdom`. Interactive behavior (typing, tab switching, live re-parse) is verified by a manual run step, not automated clicks.
- **Draft shape is the existing one:** `date · payee · status · note · uid? · postings[]` where a posting is `{ account: string; amount: string; currency: string }` and `status` is `'cleared' | 'pending' | 'none'`.
- **Package manager is pnpm.** Run a single test file with `pnpm vitest run <path>`; the full suite with `pnpm test`; type-check with `pnpm type-check`; lint with `pnpm lint`.
- **No attribution lines** in commit messages (no "Generated with" / `Co-Authored-By` trailers); no mention of AI tooling anywhere in the project or its history.

---

## File Structure

- `features/transactions/entry/parsedBlockToDraft.ts` — **new.** Pure mapping `ParsedBlock → DraftState`. The testable core of the Raw lens. No React, no I/O.
- `features/transactions/entry/RawLens.tsx` — **new.** `'use client'` controlled `<textarea>` + inline error. Seeds from `formatTransaction(draft)` on mount; dispatches `replaceAll` on valid parse; reports parse errors via `onError`.
- `features/transactions/entry/TransactionEntry.tsx` — **modify.** Register `{ id: 'raw', label: 'Raw' }` in `TABS`; render `RawLens` when `active === 'raw'`; hold `rawError` state; gate `canSubmit` while the raw tab shows a parse error. Import the now-shared `SubmitAction` type.
- `features/transactions/actions/types.ts` — **modify.** Home the `SubmitAction` type here (carried cleanup from the Phase 1 review — Phase 2 is the next phase to touch `TransactionEntry.tsx`, which currently re-declares it locally).
- `features/transactions/actions/index.ts` — **modify.** Re-export `SubmitAction`.
- Tests: `features/transactions/entry/parsedBlockToDraft.test.ts` (new), `features/transactions/entry/RawLens.test.tsx` (new), `features/transactions/entry/TransactionEntry.test.tsx` (modify — add a Raw-tab assertion).

Reference (current state, from research):
- `parseBlock(block: string): ParsedBlock | null` (`lib/journal/parser.ts:75`); returns `null` when the first line is not a valid header.
- `ParsedBlock = { uid: string | null; date: string; status: 'cleared'|'pending'|'none'; payee: string; note: string | null; postings: ParsedPosting[] }` (`lib/journal/parser.ts:64`).
- `ParsedPosting = { account: string; amount: string; currency: string }` (`lib/journal/parser.ts:25`) — structurally identical to `DraftPosting`.
- `formatTransaction(draft: TransactionDraft): string` (`lib/transactions/schema.ts:146`). `DraftState` is assignable to `TransactionDraft` (every required field present; `note: string` satisfies the optional `note?: string`), so `formatTransaction(draft)` type-checks directly. `formatTransaction` emits the `; :uid:` line when `draft.uid` is set and one `; <line>` per non-empty note line — both of which `parseBlock` reads back, so Form ↔ Raw round-trips.
- `DraftState` / `DraftAction` / `draftReducer` / `initDraft` / `serializeDraftJson` live in `features/transactions/entry/draftReducer.ts`.
- `TransactionEntry.tsx` currently declares `TABS = [{ id: 'form', label: 'Form' }]` (line 57), `const [active, setActive] = useState('form')` (line 83), `canSubmit` (lines 129-134), renders `{active === 'form' && <FormLens .../>}` (lines 177-186), and re-declares `SubmitAction` locally (lines 30-33).

---

## Task 1: Pure `parsedBlockToDraft` mapping

**Files:**
- Create: `features/transactions/entry/parsedBlockToDraft.ts`
- Test: `features/transactions/entry/parsedBlockToDraft.test.ts`

**Interfaces:**
- Consumes: `ParsedBlock` (`@/lib/journal/parser`); `DraftState` (`./draftReducer`).
- Produces:
  - `function parsedBlockToDraft(block: ParsedBlock, prev?: DraftState): DraftState` — maps a parsed block onto a draft. `note` becomes `block.note ?? ''`; `uid` becomes `block.uid ?? prev?.uid` (so editing raw text that omits the `; :uid:` line keeps the existing uid and does not break the edit-mode fingerprint guard); postings are copied field-for-field.

- [ ] **Step 1: Write the failing tests**

```ts
// features/transactions/entry/parsedBlockToDraft.test.ts
import { describe, it, expect } from 'vitest';
import { parsedBlockToDraft } from './parsedBlockToDraft';
import { parseBlock } from '@/lib/journal/parser';
import { formatTransaction } from '@/lib/transactions/schema';
import { initDraft, type DraftState } from './draftReducer';

describe('parsedBlockToDraft', () => {
  it('maps every field of a parsed block onto a draft', () => {
    const block = {
      uid: null,
      date: '2026-06-29',
      status: 'cleared' as const,
      payee: 'Whole Foods',
      note: 'weekly shop',
      postings: [
        { account: 'Expenses:Groceries', amount: '42.50', currency: 'USD' },
        { account: 'Assets:Checking', amount: '-42.50', currency: 'USD' },
      ],
    };
    expect(parsedBlockToDraft(block)).toEqual({
      date: '2026-06-29',
      payee: 'Whole Foods',
      status: 'cleared',
      note: 'weekly shop',
      uid: undefined,
      postings: [
        { account: 'Expenses:Groceries', amount: '42.50', currency: 'USD' },
        { account: 'Assets:Checking', amount: '-42.50', currency: 'USD' },
      ],
    });
  });

  it('turns a null note into an empty string', () => {
    const block = {
      uid: null, date: '2026-06-29', status: 'none' as const,
      payee: 'Acme', note: null,
      postings: [{ account: 'Assets:Cash', amount: '5', currency: 'USD' }],
    };
    expect(parsedBlockToDraft(block).note).toBe('');
  });

  it('keeps the prior uid when the raw text omits the uid line', () => {
    const prev: DraftState = {
      date: '2026-06-29', payee: 'Acme', status: 'none', note: '',
      uid: '01HZX9K3QF8V5C7R2D4M6N8P0T',
      postings: [{ account: 'Assets:Cash', amount: '5', currency: 'USD' }],
    };
    const block = {
      uid: null, date: '2026-06-29', status: 'none' as const,
      payee: 'Acme', note: null,
      postings: [{ account: 'Assets:Cash', amount: '5', currency: 'USD' }],
    };
    expect(parsedBlockToDraft(block, prev).uid).toBe('01HZX9K3QF8V5C7R2D4M6N8P0T');
  });

  it('prefers the uid present in the raw text over the prior uid', () => {
    const prev: DraftState = {
      date: '2026-06-29', payee: 'Acme', status: 'none', note: '',
      uid: '01HZX9K3QF8V5C7R2D4M6N8P0T', postings: [],
    };
    const block = {
      uid: '01J0000000000000000000000A', date: '2026-06-29',
      status: 'none' as const, payee: 'Acme', note: null, postings: [],
    };
    expect(parsedBlockToDraft(block, prev).uid).toBe('01J0000000000000000000000A');
  });

  it('round-trips a draft through formatTransaction → parseBlock → parsedBlockToDraft', () => {
    const draft = initDraft(
      {
        date: '2026-06-29', payee: 'Whole Foods', status: 'cleared',
        note: 'weekly shop',
        postings: [
          { account: 'Expenses:Groceries', amount: '42.50', currency: 'USD' },
          { account: 'Assets:Checking', amount: '-42.50', currency: 'USD' },
        ],
      },
      'USD'
    );
    const block = parseBlock(formatTransaction(draft));
    expect(block).not.toBeNull();
    expect(parsedBlockToDraft(block!)).toEqual(draft);
  });

  it('round-trips the uid line for an edited transaction', () => {
    const draft = initDraft(
      {
        date: '2026-06-29', payee: 'Acme', status: 'none',
        uid: '01HZX9K3QF8V5C7R2D4M6N8P0T',
        postings: [
          { account: 'Income:Salary', amount: '-100', currency: 'USD' },
          { account: 'Assets:Checking', amount: '100', currency: 'USD' },
        ],
      },
      'USD'
    );
    const block = parseBlock(formatTransaction(draft));
    expect(parsedBlockToDraft(block!).uid).toBe('01HZX9K3QF8V5C7R2D4M6N8P0T');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run features/transactions/entry/parsedBlockToDraft.test.ts`
Expected: FAIL — cannot resolve `./parsedBlockToDraft`.

- [ ] **Step 3: Implement the mapping**

```ts
// features/transactions/entry/parsedBlockToDraft.ts
import type { ParsedBlock } from '@/lib/journal/parser';
import type { DraftState } from './draftReducer';

/**
 * Map a parsed ledger block onto the canonical entry draft.
 *
 * `prev` carries the draft the Raw lens started from; when the edited text
 * omits the `; :uid:` line (`block.uid === null`) we fall back to the prior
 * uid so hand-editing raw text never silently drops the identity that the
 * edit-mode concurrency guard depends on.
 */
export const parsedBlockToDraft = (
  block: ParsedBlock,
  prev?: DraftState
): DraftState => ({
  date: block.date,
  payee: block.payee,
  status: block.status,
  note: block.note ?? '',
  uid: block.uid ?? prev?.uid,
  postings: block.postings.map((p) => ({
    account: p.account,
    amount: p.amount,
    currency: p.currency,
  })),
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run features/transactions/entry/parsedBlockToDraft.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add features/transactions/entry/parsedBlockToDraft.ts features/transactions/entry/parsedBlockToDraft.test.ts
git commit -m "feat(transactions): pure parsedBlockToDraft mapping for raw lens"
```

---

## Task 2: `RawLens` component

**Files:**
- Create: `features/transactions/entry/RawLens.tsx`
- Test: `features/transactions/entry/RawLens.test.tsx`

**Interfaces:**
- Consumes: `parsedBlockToDraft` (Task 1); `parseBlock` (`@/lib/journal/parser`); `formatTransaction` (`@/lib/transactions/schema`); `DraftState`, `DraftAction` (`./draftReducer`).
- Produces:
  - `function RawLens(props: { draft: DraftState; dispatch: (a: DraftAction) => void; onError?: (error: string | null) => void }): JSX.Element`

**Behavior:**
- Local `text` state seeded once on mount from `formatTransaction(draft)` (lazy initializer). The shared `draft` is NOT read again for the textarea after mount — RawLens mounts only while its tab is active (no other lens is mounted then), so there is no external draft change to track and no draft→text effect is needed. This is what avoids cursor jumps.
- Local `error` state, initialized `null`. A `useEffect(() => onError?.(null), [])` clears any stale shell-level error on mount (the seed is always the output of `formatTransaction`, i.e. structurally valid or empty).
- On `onChange(value)`: `setText(value)`; `const block = parseBlock(value)`; if `block === null` OR `block.postings.length === 0`, set a human-readable error, call `onError?.(error)`, and do NOT dispatch (the shared draft is preserved). Otherwise clear the error, call `onError?.(null)`, and `dispatch({ type: 'replaceAll', state: parsedBlockToDraft(block, draft) })`.
- Render a `<textarea>` (monospace, controlled off `text`) and, when `error`, an inline error using the same destructive styling the form errors use (`Alert`/`AlertDescription` from `@/components/ui/alert`, `variant="destructive"`).

- [ ] **Step 1: Write the failing smoke tests**

```tsx
// features/transactions/entry/RawLens.test.tsx
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { RawLens } from './RawLens';
import { initDraft } from './draftReducer';

const html = (node: React.ReactNode) => renderToStaticMarkup(node);

describe('RawLens', () => {
  const draft = initDraft(
    {
      date: '2026-06-29', payee: 'Whole Foods', status: 'cleared',
      postings: [
        { account: 'Expenses:Groceries', amount: '42.50', currency: 'USD' },
        { account: 'Assets:Checking', amount: '-42.50', currency: 'USD' },
      ],
    },
    'USD'
  );

  it('seeds the textarea with the formatted ledger text', () => {
    const out = html(<RawLens draft={draft} dispatch={() => {}} />);
    expect(out).toContain('<textarea');
    expect(out).toContain('Whole Foods');
    expect(out).toContain('Expenses:Groceries');
    expect(out).toContain('Assets:Checking');
  });

  it('renders no error on the initial (seeded) render', () => {
    const out = html(<RawLens draft={draft} dispatch={() => {}} />);
    expect(out.toLowerCase()).not.toContain('could not parse');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run features/transactions/entry/RawLens.test.tsx`
Expected: FAIL — cannot resolve `./RawLens`.

- [ ] **Step 3: Implement `RawLens`**

```tsx
// features/transactions/entry/RawLens.tsx
'use client';

import { useEffect, useState } from 'react';
import { parseBlock } from '@/lib/journal/parser';
import { formatTransaction } from '@/lib/transactions/schema';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { parsedBlockToDraft } from './parsedBlockToDraft';
import type { DraftState, DraftAction } from './draftReducer';

const PARSE_ERROR =
  'Could not parse this as a transaction. Check the date/payee header and that each posting has an account.';

export function RawLens({
  draft,
  dispatch,
  onError,
}: {
  draft: DraftState;
  dispatch: (action: DraftAction) => void;
  onError?: (error: string | null) => void;
}) {
  const [text, setText] = useState(() => formatTransaction(draft));
  const [error, setError] = useState<string | null>(null);

  // The seed is always valid (or empty) formatted text; clear any stale
  // shell-level parse error left over from a previous Raw editing session.
  useEffect(() => {
    onError?.(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onChange = (value: string) => {
    setText(value);
    const block = parseBlock(value);
    if (!block || block.postings.length === 0) {
      setError(PARSE_ERROR);
      onError?.(PARSE_ERROR);
      return;
    }
    setError(null);
    onError?.(null);
    dispatch({ type: 'replaceAll', state: parsedBlockToDraft(block, draft) });
  };

  return (
    <div className="flex flex-col gap-2">
      <textarea
        value={text}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        rows={10}
        className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 font-mono text-sm leading-relaxed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Transaction ledger text"
      />
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run features/transactions/entry/RawLens.test.tsx`
Expected: PASS.

- [ ] **Step 5: Type-check**

Run: `pnpm type-check`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add features/transactions/entry/RawLens.tsx features/transactions/entry/RawLens.test.tsx
git commit -m "feat(transactions): RawLens textarea synced to shared draft"
```

---

## Task 3: Home the `SubmitAction` type in the actions module

**Files:**
- Modify: `features/transactions/actions/types.ts`
- Modify: `features/transactions/actions/index.ts`

**Interfaces:**
- Consumes: `TransactionActionState` (already in `types.ts`).
- Produces:
  - `type SubmitAction = (prev: TransactionActionState | null, formData: FormData) => Promise<TransactionActionState>` — exported from `@/features/transactions/actions`.

This folds in the Phase 1 carried-cleanup item ("home the `SubmitAction` type in `features/transactions/actions` — currently re-declared locally in `TransactionEntry.tsx`") since Phase 2 is the next phase to touch `TransactionEntry.tsx`. No behavior change; it is a type move, so its verification is the type-check in Task 4 (where the local copy is removed and the import wired up).

- [ ] **Step 1: Add the type to `types.ts`**

Append to `features/transactions/actions/types.ts`:

```ts
export type SubmitAction = (
  prev: TransactionActionState | null,
  formData: FormData
) => Promise<TransactionActionState>;
```

- [ ] **Step 2: Re-export from the actions barrel**

In `features/transactions/actions/index.ts`, change the first line so the barrel also exports `SubmitAction`:

```ts
export type { TransactionActionState, SubmitAction } from './types';
```

- [ ] **Step 3: Type-check**

Run: `pnpm type-check`
Expected: PASS (nothing imports it yet; this just confirms the type compiles).

- [ ] **Step 4: Commit**

```bash
git add features/transactions/actions/types.ts features/transactions/actions/index.ts
git commit -m "refactor(transactions): home SubmitAction type in actions module"
```

---

## Task 4: Wire the Raw tab into the `TransactionEntry` shell

**Files:**
- Modify: `features/transactions/entry/TransactionEntry.tsx`
- Test: `features/transactions/entry/TransactionEntry.test.tsx`

**Interfaces:**
- Consumes: `RawLens` (Task 2); `SubmitAction` from `@/features/transactions/actions` (Task 3).
- Produces: no new exported symbols; `TransactionEntryProps` is unchanged.

**Changes:**
1. Replace the local `SubmitAction` declaration (lines 30-33) with an import. Update the existing `import type { TransactionActionState } from '../actions';` to `import type { TransactionActionState, SubmitAction } from '../actions';` and delete the local `type SubmitAction = ...` block.
2. Import `RawLens`: add `import { RawLens } from './RawLens';` near the `FormLens`/`TabBar` imports.
3. Register the Raw tab: `const TABS = [{ id: 'form', label: 'Form' }, { id: 'raw', label: 'Raw' }];`.
4. Add raw-error state: `const [rawError, setRawError] = useState<string | null>(null);` (next to the existing `active` state).
5. Render the Raw panel after the existing Form panel block:

```tsx
{active === 'raw' && (
  <RawLens draft={draft} dispatch={dispatch} onError={setRawError} />
)}
```

6. Gate submit while the raw tab shows a parse error. Extend the existing `canSubmit` (lines 129-134) with a final clause:

```tsx
const canSubmit =
  !isPending &&
  draft.date !== '' &&
  draft.payee.trim() !== '' &&
  draft.postings.every((p) => p.account.trim() !== '') &&
  (balanceKind === 'balanced' || balanceKind === 'auto-balance') &&
  !(active === 'raw' && rawError !== null);
```

(The error gate is scoped to `active === 'raw'`: leaving an unparseable raw edit and switching to Form re-enables submit against the last valid draft, and re-entering Raw remounts `RawLens`, which clears `rawError` on mount.)

- [ ] **Step 1: Add a failing assertion for the Raw tab**

Add this test to the existing `describe('TransactionEntry', ...)` block in `features/transactions/entry/TransactionEntry.test.tsx` (reuse the existing `common`/`html` helpers already defined in that file):

```tsx
  it('registers a Raw tab', () => {
    const out = html(
      <TransactionEntry
        {...common}
        initialDraft={{
          date: '2026-06-29', payee: 'Acme', status: 'none',
          postings: [
            { account: 'Income:Salary', amount: '-100', currency: 'USD' },
            { account: 'Assets:Checking', amount: '100', currency: 'USD' },
          ],
        }}
      />
    );
    expect(out).toContain('Raw');
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run features/transactions/entry/TransactionEntry.test.tsx`
Expected: FAIL — output does not contain `Raw` (only the Form tab is registered).

- [ ] **Step 3: Apply the shell changes**

Make edits 1-6 above in `features/transactions/entry/TransactionEntry.tsx`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run features/transactions/entry/TransactionEntry.test.tsx`
Expected: PASS.

- [ ] **Step 5: Type-check and lint**

Run: `pnpm type-check`
Expected: PASS (the local `SubmitAction` is gone and imported instead).
Run: `pnpm lint`
Expected: PASS (no unused-import or hook-deps warnings introduced).

- [ ] **Step 6: Full test suite**

Run: `pnpm test`
Expected: PASS — all suites green.

- [ ] **Step 7: Commit**

```bash
git add features/transactions/entry/TransactionEntry.tsx features/transactions/entry/TransactionEntry.test.tsx
git commit -m "feat(transactions): add Raw tab to entry shell"
```

---

## Task 5: Manual verification (interactive behavior not covered by static tests)

**Files:** none (verification only).

- [ ] **Step 1: Start the app**

Run: `pnpm dev`
Open `http://localhost:3000/transactions/new`.

- [ ] **Step 2: Verify Form → Raw seeding**

In the Form tab, enter a payee and two balanced postings (e.g. `Expenses:Groceries  USD 42.50` and `Assets:Checking  USD -42.50`). Switch to the **Raw** tab. Confirm the textarea shows the equivalent ledger text (date header, payee, both postings).

- [ ] **Step 3: Verify Raw → Form sync**

In Raw, change the amount (e.g. `42.50` → `50.00` on both lines so it still balances). Switch back to **Form**. Confirm the change is reflected in the posting rows. Switch to Raw again and confirm the seed reflects the latest draft.

- [ ] **Step 4: Verify parse-error handling**

In Raw, corrupt the text (e.g. delete the date from the header line). Confirm: an inline error appears, the **submit button is disabled while on the Raw tab**, and switching back to **Form** shows the *last valid* draft (the bad text did not clobber it). Fix the text in Raw and confirm the error clears and submit re-enables.

- [ ] **Step 5: Verify Raw submit (create)**

With valid, balanced text in Raw, click **Add transaction**. Confirm it saves and redirects exactly as a Form-tab submit would (the hidden `draft` input stays in sync because Raw dispatches into the shared draft).

- [ ] **Step 6: Verify edit flow preserves uid**

Open an existing transaction's edit page (`/transactions/<uid>/edit`), switch to **Raw**, make a small edit (e.g. tweak the note) **without touching the `; :uid:` line**, and **Save changes**. Confirm it updates the original block in place and the concurrent-edit guard still holds (no "modified somewhere else" error on a clean edit). Then repeat but **delete the `; :uid:` line** in Raw before saving — confirm the edit still targets the right transaction (uid preserved from the prior draft).

- [ ] **Step 7: Record the result**

If all pass, the phase is complete. If anything regressed, fix under TDD before closing the phase. No commit needed for a clean verification.

---

## Self-Review

- **Spec/roadmap coverage (Phase 2 scope):**
  - "New `RawLens.tsx` — controlled `<textarea>` plus inline validation/errors" → Task 2.
  - "Text → draft on every valid parse, via the existing parser; invalid text shows the parse error and does not clobber the shared draft" → Task 2 `onChange` (dispatch only on success; error otherwise).
  - "Draft → text when the tab is entered … via `formatTransaction`" → Task 2 mount seed (the tab is conditionally mounted, so entering it = mounting `RawLens`).
  - "Register `{ id: 'raw', label: 'Raw' }`; Raw always enabled" → Task 4 (tab added with no `disabled`).
  - "A pure `parsedTransactionToDraft(parsed) → DraftState` mapping … the testable core" → Task 1 (named `parsedBlockToDraft`, taking the parser's `ParsedBlock`; the `prev` param adds uid preservation the roadmap's risk note implies).
  - "Keep the textarea controlled off a local string that syncs to the shared draft only on successful parse — avoids cursor-jump and partial-parse thrash" → Task 2 architecture (seed-on-mount + push-up-on-valid-parse, no draft→text effect).
  - Testing: "unit-test `parsedBlockToDraft` (round-trips with `formatTransaction`/`serializeDraftJson`), parse-error handling; static smoke for `RawLens`" → Task 1 (round-trip + mapping + uid cases) and Task 2 (static smoke). Parse-error *behavior* on user input and live re-parse are interactive → manual Task 5 (consistent with the repo's no-jsdom limitation).
  - Carried cleanup ("home `SubmitAction` in `features/transactions/actions`") → Task 3, folded in because Phase 2 touches `TransactionEntry.tsx`. (The other carried item — `TabBar.test.tsx` aria assertions — is deferred: Phase 2 does not touch `TabBar.tsx`/its test; it belongs to whichever phase next does.)
- **Placeholder scan:** none — every code step shows complete code or an exact, enumerated edit against cited line numbers.
- **Type consistency:** `parsedBlockToDraft(block, prev?)` (Task 1) is consumed with that exact signature in Task 2; `RawLens`'s `{ draft, dispatch, onError? }` prop shape (Task 2) matches the render in Task 4; `SubmitAction` (Task 3) is imported in Task 4, replacing the local copy; `DraftState`/`DraftAction`/`parseBlock`/`ParsedBlock`/`formatTransaction` are used with their real, verified signatures.
- **Testing-infra limitation acknowledged:** typing, live re-parse, tab switching, submit gating, and the uid-preservation edit flow are exercised manually (Task 5) because the repo has no jsdom/testing-library; all pure logic (`parsedBlockToDraft`, including round-trips) is fully unit-tested (Task 1), and component shape is smoke-tested (Tasks 2, 4).
