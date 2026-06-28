# Layered Transaction Entry — Roadmap

**Date:** 2026-06-29
**Spec:** `docs/superpowers/specs/2026-06-29-layered-transaction-entry-design.md`

Forward map for the whole feature. Phase 1 is shipped; Phases 2–5 each get their
own detailed, TDD implementation plan (like the Phase 1 plan) when started. This
document is the index and the per-phase scope/dependency contract — not
bite-sized steps.

All phases share the Phase 1 invariants: the ledger file is the source of truth,
a transaction's type is **inferred from posting shape (never stored)**, every
lens reads/writes the one canonical `DraftState`, and tests follow the repo
pattern (Vitest + `renderToStaticMarkup`, node env, no jsdom — so pure logic is
unit-tested and interactive shells get static smoke tests + a manual pass).

Everything new lives under `features/transactions/entry/`.

---

## Phase 1 — Lens Scaffold ✅ DONE (PR #49)

Tabbed shell over one shared draft; today's form moved into a "Form" tab.
Delivered: `draftReducer.ts`, `balance.ts`, `TabBar.tsx`, `FormLens.tsx`,
`TransactionEntry.tsx`; `TransactionForm.tsx` deleted. Behavior-preserving.

Established interfaces the later phases build on:
- `DraftState` / `DraftAction` / `draftReducer` / `initDraft` / `serializeDraftJson`
- `computeBalance(postings) → Balance` (shared util)
- `TabBar` (controlled, presentational) + the shell's `active` tab state and
  `TABS` registry (currently `[{ id: 'form', label: 'Form' }]`)

---

## Phase 2 — Raw Lens

**Goal:** add a "Raw" tab where the user reads and edits the transaction as ledger
text. Power-user fast path; in-app hand-editing.

**Scope**
- New `RawLens.tsx` — a controlled `<textarea>` plus inline validation/errors.
- Text → draft on every valid parse, via the existing parser
  (`lib/journal/parser.ts`); invalid text shows the parse error and does **not**
  clobber the shared draft.
- Draft → text when the tab is entered / draft changes elsewhere, via the
  existing `formatTransaction(draft)` (`lib/transactions/schema.ts:146`).
- Register `{ id: 'raw', label: 'Raw' }` in the shell's `TABS`. Raw is always
  enabled (lossless for arbitrary postings).

**Key work / risks**
- A pure `parsedTransactionToDraft(parsed) → DraftState` mapping (parser returns a
  `Transaction`; the shell needs a `DraftState`). This is the testable core.
- Decide debounce/parse cadence and how errors render (reuse the form's error
  styling). Keep the textarea controlled off a local string that syncs to the
  shared draft only on successful parse — avoids cursor-jump and partial-parse
  thrash.

**Testing:** unit-test `parsedTransactionToDraft` (round-trips with
`formatTransaction`/`serializeDraftJson`), parse-error handling; static smoke for
`RawLens`.

**Depends on:** Phase 1 only.

---

## Phase 3 — Type Engine (no forms yet)

**Goal:** the framework that powers type forms — the adapter interface, the five
adapters' pure `compile`/`detect` logic, and account-role classification. No UI
in this phase; it is all pure, fully unit-tested logic that Phase 4 renders.

**Scope**
- `accountRole.ts` — `classifyAccount(account) → 'asset' | 'liability' | 'income'
  | 'expense' | 'equity' | 'unknown'` using the standard five roots, plus
  `accountsForRole(accounts, role)` filtering helpers. `unknown` is the graceful
  fallback signal.
- A `TransactionType` adapter interface:
  - `id`, `label`, `icon`
  - `fields` — the typed shape of the friendly inputs
  - `compile(fields, ctx) → DraftState` (ctx carries `defaultCurrency`, etc.)
  - `detect(draft) → fields | null` — recognizes the type from posting shape
- Five adapters implementing it: **Expense, Income, Transfer, Exchange, Fix
  balance**. Compile/detect rules per the spec (Exchange emits `@@` total-cost;
  Fix balance emits a balance assertion + auto-balanced `Equity:Adjustments`).
- A small registry exporting the ordered list of adapters.

**Key work / risks**
- `detect()` ambiguity rules: a clean 2-posting asset→expense is Expense; splits
  / unclassifiable shapes return `null` (→ Form tab). Pin these with tests so
  Phase 4's tab-enabling is trustworthy.
- Fix balance's "compute the difference" needs the account's current balance.
  Keep the adapter pure: `compile` emits the assertion + blank equity posting
  (ledger auto-balances), and the *current-balance lookup for display* is a
  Phase 4 server concern, not part of the pure adapter.

**Testing:** exhaustive unit tests for `classifyAccount`, and per-adapter
`compile` + `detect` (including round-trip: `detect(compile(fields)) ≈ fields`).

**Depends on:** Phase 1 (`DraftState`, `computeBalance`).

---

## Phase 4 — The Five Type Forms (the "Types" tab)

**Goal:** the user-facing Types tab — type-selector chips plus a tailored
mini-form per type, wired to Phase 3's adapters, all editing the shared draft.

**Scope**
- `TypeLens.tsx` — the tab content: the type chips + the active type's form.
- One mini-form per type (`ExpenseForm`, `IncomeForm`, `TransferForm`,
  `ExchangeForm`, `FixBalanceForm`), each rendering its adapter's `fields` and
  dispatching `replaceAll` with `compile(fields)` so the shared draft stays
  canonical.
- Account fields filtered by role (`accountsForRole`); typing a new name creates
  the account path on save (`Expenses:<name>` / `Income:<name>`), never showing a
  root prefix.
- Register `{ id: 'types', label: 'Types' }` and make it the default-first tab.
  Type tabs/chips **enable only when `detect()` matches** the current draft;
  otherwise greyed with the "use Form or Raw" tooltip.
- Edit flow: on open, run `detect()` across adapters to choose the starting tab;
  no match → Form.
- Fix balance form: fetch the account's current balance (server action /
  existing balance query) to show the implied adjustment; output stays the
  assertion + blank equity posting.

**Key work / risks**
- This is the largest phase; consider splitting the detailed plan into the
  shared `TypeLens` + chips first, then the five forms (Expense/Income/Transfer
  are near-identical; Exchange and Fix balance are the bespoke ones).
- Make `default` tab/order come from a prop so Phase 5 can drive it.

**Testing:** per-form static smoke (renders fields, compiles expected postings via
the adapter); detect-based enable/disable logic; create-category-on-the-fly path.

**Depends on:** Phases 1–3.

---

## Phase 5 — Settings (tab order & default)

**Goal:** a per-user preference for the entry-tab order, where the first tab is
the default. Ships as `Types · Form · Raw`; reorderable (e.g. a power user puts
`Raw` first).

**Scope**
- Persist an `entryTabOrder` preference in the existing user-settings store
  (mirror how `getBaseCurrency()` is read/stored — find and reuse that
  mechanism; likely a settings repository/service).
- A small settings UI block to reorder the three tabs.
- The server component that renders `TransactionEntry` reads the preference and
  passes `tabOrder` / `defaultTab` props; the shell already owns `active` state
  and the `TABS` registry, so this is prop-driven.
- All three tabs remain always-present regardless of order.

**Key work / risks**
- Migration/default: users with no preference get `Types · Form · Raw`.
- Keep ordering logic a pure helper (`orderTabs(order, allTabs)`) so it's
  unit-testable.

**Testing:** settings persistence (repository/service test) + `orderTabs` unit
tests + static smoke that the shell honors a custom order.

**Depends on:** Phases 1, 4 (needs the Types/Raw tabs to exist to order them).

---

## Sequencing & dependencies

```
Phase 1 ✅ ──► Phase 2 (Raw)
        └────► Phase 3 (Type engine) ──► Phase 4 (Type forms) ──► Phase 5 (Settings)
```

- Phase 2 and Phase 3 are independent of each other and could be done in either
  order or in parallel; both depend only on Phase 1.
- Phase 4 needs Phase 3. Phase 5 needs Phase 4 (and benefits from Phase 2 being
  present so all three tabs are real before ordering them).
- Recommended order: **2 → 3 → 4 → 5** (ship the power-user Raw lens early; it's
  small and high-value), or **3 → 4 → 2 → 5** if type forms are the priority.

## Out of scope (whole feature, v1)

- Storing the type in the ledger file (always inferred).
- Account-role aliases / per-user role mapping (standard roots only; non-standard
  journals fall back to Form/Raw).
- Types beyond the five (debt/lend, refund, investment) — reachable via Form/Raw,
  cheap to add later once the adapter framework exists.
- Natural-language quick-add, smart per-type defaults, recurring/scheduled
  transactions — future ideas on the same machinery.

## Carried cleanup (from Phase 1 review, non-blocking)

- `TabBar.test.tsx`: add assertions for inactive `aria-selected="false"` and
  `role="tablist"`/`role="tab"` presence.
- Consider homing the `SubmitAction` type in `features/transactions/actions`
  (currently re-declared locally in `TransactionEntry.tsx`).

Fold these into whichever phase next touches those files.
