# Layered Transaction Entry — Phase 4: The Five Type Forms ("Types" tab)

**Date:** 2026-06-29
**Roadmap:** `docs/superpowers/plans/2026-06-29-layered-transaction-entry-roadmap.md` (Phase 4)
**Depends on:** Phases 1–3 (all merged). Phase 3 delivered the full pure type
engine; nothing renders it yet — this phase is its UI.

## Goal

Add the user-facing **Types** tab to the transaction-entry shell: a row of type
chips plus a tailored mini-form per type, wired to Phase 3's adapters, all
editing the one shared `DraftState`. This makes the type engine visible and
usable while preserving the Phase 1 invariant that the ledger file is the source
of truth and a transaction's type is **inferred from posting shape, never
stored**.

## What already exists (do not rebuild)

- `entry/types/adapter.ts` — `TransactionTypeAdapter<F>` with
  `emptyFields(ctx)`, `compile(fields, ctx) → DraftState`, `detect(draft) →
  F | null`; plus `headerOf` / `draftFromHeader` helpers and `HeaderFields`.
- `entry/types/{expense,income,transfer,exchange,fixBalance}.ts` — the five
  adapters, each with its `*Fields` type. All pure, all unit-tested.
- `entry/types/registry.ts` — `TYPE_ADAPTERS` (ordered) and
  `detectType(draft) → { id, fields } | null`.
- `entry/types/accountRole.ts` — `classifyAccount(account) → AccountRole` and
  `accountsForRole(accounts, role)`.
- `entry/TransactionEntry.tsx` — the shell: owns `draft`/`dispatch`,
  `active` tab state, the `TABS` registry (`form`, `raw`), `canSubmit`.
- `entry/FormLens.tsx` — reference for styling and the building blocks
  (`Field`, `SectionLabel`, role-agnostic account `Combobox`, `AmountInput`,
  `ToggleGroup` status).
- `utils/runLedger.ts` — `runLedger(args)` server-only ledger exec.
- `lib/balance/parse.ts` — `parseBalanceRows(stdout)`.

## Decisions (locked during brainstorming)

1. **Default tab / initial state:** Types is registered **first** (`Types ·
   Form · Raw`). On open: create mode → `types`; edit mode → `detectType(draft)`
   match → that type's form on the Types tab, else fall back to `form`.
   (Phase 5 will make order/default a user preference; Phase 4 hardcodes this.)
2. **Fix-balance live preview:** build it now. A server action fetches the
   account's current balance; the form shows current → target → implied
   adjustment. The compiled draft stays assertion + blank equity (ledger
   computes the real adjustment); the preview is display-only.
3. **New-category entry:** account fields are role-filtered comboboxes but the
   user types the **full account path** (`Expenses:Coffee`). No auto-prefixing
   of role roots. (This overrides the roadmap's earlier `Expenses:<name>`
   auto-prefix idea — simpler, explicit.)

## Architecture

New files, all under `features/transactions/entry/`:

```
TypeLens.tsx                     # tab content: chip row + active form + no-match notice
typeForms/
  fields.tsx                     # shared Field / SectionLabel / AccountField (factored out of FormLens)
  HeaderFields.tsx               # shared date/payee/status/note block (every form has these)
  ExpenseForm.tsx
  IncomeForm.tsx
  TransferForm.tsx
  ExchangeForm.tsx
  FixBalanceForm.tsx
actions/getAccountBalance.ts     # server action for the fix-balance preview
```

### Data flow

`TransactionEntry` (client) already owns `draft`/`dispatch`. It renders
`TypeLens` when `active === 'types'`, passing `draft`, `dispatch`, `accounts`,
`payees`, `defaultCurrency`, and a `getAccountBalance` server-action prop
(threaded from `NewTransaction`/`EditTransaction` exactly like `submitAction`).

Each mini-form holds its `fields` shape and, on every change, dispatches
`{ type: 'replaceAll', state: adapter.compile(fields, ctx) }`. The shared
`DraftState` is the single source of truth, so the Form and Raw tabs always
reflect what was typed in Types. `ctx` is `{ defaultCurrency }`.

### Component boundaries

- **TypeLens** — owns: which chip is selected, the active form's `fields`
  state, and the create-vs-detect seeding logic. Renders the chip row and the
  active form. No compile/detect logic of its own beyond calling the registry.
- **`typeForms/fields.tsx`** — presentational primitives shared with FormLens:
  - `Field({ label, htmlFor?, error?, children })` — label + control + error.
  - `SectionLabel({ children })` — the uppercase section header.
  - `AccountField({ label, role, accounts, value, onChange, placeholder? })` —
    a `Combobox` whose options are `accountsForRole(accounts, role)`, free-text
    allowing a full path. `role: AccountRole | AccountRole[]` (Transfer's
    from/to accept asset **or** liability).
  These are **moved out of `FormLens.tsx`** and FormLens updated to import them
  (behavior-preserving refactor; FormLens tests must still pass).
- **`HeaderFields.tsx`** — the date / status / payee / note block every form
  shares, reading/writing the form's header fields (`HeaderFields` from the
  adapter module).
- **Each `*Form`** — renders `HeaderFields` + its type-specific inputs; converts
  field edits into a fresh `fields` object and calls `onFields(fields)`, which
  TypeLens turns into `compile` → `replaceAll`.

**Typing note:** the registry's `TYPE_ADAPTERS` / `detectType` are typed with
`unknown` fields (for the heterogeneous list). TypeLens uses the registry only
for id-based detection (`detectType(draft).id`). Each `*Form` imports its own
**typed** adapter directly (e.g. `expenseAdapter: TransactionTypeAdapter<
ExpenseFields>`) so its `fields`/`compile`/`detect` are fully typed — never cast
the `unknown` from the registry.

## Tab + chip state model

In `TransactionEntry`:

- Add `{ id: 'types', label: 'Types' }` to `TABS`, **first**.
- Initial `active`: computed once in the `useState` initializer from the
  **already-initialized `draft`** (the shell builds it via `initDraft` before
  this runs — do not call `detectType` on the raw `initialDraft` prop, which is
  not a `DraftState`): `mode === 'edit' ? (detectType(draft) ? 'types' :
  'form') : 'types'`.
- `canSubmit` is unaffected — it already reads the shared `draft`/balance and is
  lens-agnostic. (Only the existing `raw`-error guard stays.)

In `TypeLens`:

- Compute `detected = detectType(draft)` on each render.
- **Selected chip resolution:**
  - If the draft is non-empty and `detected` matches a type → that chip is
    selected; its form is seeded from `detected.fields` (via the adapter's
    `detect`, already run by the registry).
  - If the draft is **empty** (`isEmptyDraft(draft)` — no posting has an
    account or amount, header blank-or-default) → no chip pre-selected; a
    "Pick a type" prompt; all chips enabled.
  - If the draft is non-empty and `detected` is `null` → chips greyed; render
    the inline notice: *"This transaction's shape doesn't map to a quick type —
    edit it in the Form or Raw tab."*
- **Clicking a chip:** if it differs from the detected/selected type, reseed
  that type from `adapter.emptyFields(ctx)` (preserving the current header —
  date/payee/status/note — so switching type doesn't lose the date) and
  `replaceAll(compile(...))`. Document this "reseed on switch" so it's
  intentional, not surprising.
- `isEmptyDraft` is a small pure helper (unit-tested) so the create-path
  detection is trustworthy.

## The five forms

Layout mirrors FormLens's two-column `Field` grid. Account inputs use
`AccountField` (role-filtered, full-path free text). Amounts use `AmountInput`;
currency uses a plain `Input` defaulting to `defaultCurrency`.

| Form | Type-specific fields | Roles |
|------|---------------------|-------|
| **Expense** | amount, currency, Paid from, Spent on | from: asset/liability · to: expense |
| **Income** | amount, currency, Received into, Source | into: asset · source: income |
| **Transfer** | amount, currency, From, To | from/to: asset/liability |
| **Exchange** | Gave (amount/currency/from), Got (amount/currency/into) | from/into: asset/liability |
| **Fix balance** | Account, Target amount, Target currency | account: any |

Compile output is entirely the adapters' responsibility (already tested):
Exchange emits the `@@` total-cost posting; Fix balance emits the balance
assertion + blank `Equity:Adjustments`.

## Fix-balance live preview

New server action `features/transactions/entry/actions/getAccountBalance.ts`:

```
getAccountBalance(account: string, currency: string): Promise<string>
```

- Runs `runLedger(['balance', account, '--format', '%A|%T\n'])`, parses with
  `parseBalanceRows`, and returns the current balance for `currency` (sum/select
  the matching row), or `'0'` when the account is new/absent.
- `'server-only'`, guarded by the same `requireUser` path `runLedger` already
  enforces. Wrapped in try/catch returning `'0'` on failure (display-only; never
  blocks the form).

`FixBalanceForm`:

- On account/currency change (debounced ~300ms), calls `getAccountBalance`.
- Renders `now: <current> · target: <target> · implied adjustment: <±delta>`
  where `delta = target − current`, computed client-side for display.
- Stale-response guard: a monotonically increasing request-id ref; ignore
  responses that aren't the latest. Loading and error states render inline and
  never gate submit.
- The compiled draft is unchanged by the preview (assertion + blank equity).

## Testing

Repo pattern: Vitest, `renderToStaticMarkup`, node env, no jsdom. Pure logic is
unit-tested; interactive shells get static smoke tests + a manual pass.

- **`isEmptyDraft`** — unit: empty/default draft → true; any account or amount →
  false.
- **TypeLens logic** — initial chip selection across the three states (empty →
  none + prompt; populated+match → matched chip + seeded form; populated+no-match
  → greyed chips + notice). Reseed-on-switch preserves header.
- **Initial-tab selection in `TransactionEntry`** — create → `types`; edit with
  detectable draft → `types`; edit with undetectable draft → `form`.
- **Per-form static smoke** — each `*Form` renders its expected fields with
  given `fields`; the asserted postings come from the (already-tested) adapter,
  so the test verifies wiring, not compile math.
- **`getAccountBalance`** — unit with canned ledger stdout: selects the right
  currency row; `'0'` fallback for unknown account / thrown exec.
- **FormLens refactor** — existing `FormLens.test.tsx` must still pass after
  `Field`/`SectionLabel`/account combobox move to `typeForms/fields.tsx`.

## Carried Phase-1 cleanup (fold in, both files are touched here)

- `TabBar.test.tsx`: add assertions for inactive `aria-selected="false"` and
  `role="tablist"` / `role="tab"` presence.
- Home the `SubmitAction` type in `features/transactions/actions` (currently
  re-declared in `TransactionEntry.tsx`); import it from there.

## Out of scope (Phase 4)

- Persisting/ordering the tabs — that is Phase 5 (`entryTabOrder` preference,
  `orderTabs` helper). Phase 4 hardcodes `Types · Form · Raw`.
- Auto-prefixing role roots onto bare category names (explicitly rejected;
  full-path entry only).
- Types beyond the five; natural-language quick-add; per-type smart defaults.
