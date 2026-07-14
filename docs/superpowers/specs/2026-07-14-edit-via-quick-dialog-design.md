# Edit a transaction through the simplified entry dialogs

## Goal

Editing a transaction should open the **same simplified dialogs** used to create
one from the header, instead of navigating to the full `/transactions/[uid]/edit`
page. Clicking Edit determines the transaction's type and opens the matching
simplified form, prefilled. Shapes the simplified forms cannot faithfully
represent open a **Raw** tab instead.

## Decisions (from brainstorming)

- **Dialog is the primary edit path.** Edit opens in place (no navigation). The
  `/transactions/[uid]/edit` route stays as a fallback target, untouched.
- **Raw fallback tab.** Transactions the simplified forms can't hold open Raw;
  the simplified form also offers a one-way "Edit as raw" escape.
- **Both row triggers open the dialog**: the `⋮ → Edit` menu item and the payee
  text in each row.

## Why this is mostly wiring, not new logic

`detectType(draft)` already classifies a saved transaction and returns the exact
field shape the simplified forms consume (`ExpenseFields`, `TransferFields`, …).
Each `QuickEntrySpec.compile` **is** the matching registry adapter's `compile`,
and `adapter.detect` is its inverse. So an edit is:

```
load draft → detectType → seed matching spec form → compile → updateTransactionAction
```

Every accounting decision (balancing, compile) already lives in the adapters and
in ledger on save. This feature adds no accounting math (per CLAUDE.md).

## Flow

1. A row's Edit trigger calls `openEditTransaction(uid)`.
2. One globally-mounted `<TransactionEditDialog>` (mounted beside `QuickEntry` in
   the header slot, so it is reachable from every surface that renders rows)
   reacts: calls `loadTransactionForEditAction(uid)`.
3. The action returns `{ draft, fingerprint, accounts, payees, defaultCurrency,
   currencies }` — mirroring `EditTransaction.tsx`, including carrying
   `tx.fingerprint` through **unchanged** (the concurrency guard in
   `editTransaction` recomputes and compares this exact value; never re-hash a
   reconstruction).
4. Client runs `detectType(draft)` and chooses the surface:
   - **Simple detected shape** → matching simplified spec form, prefilled.
   - **Otherwise** → Raw tab.
5. Save builds `FormData{ draft (edit mode), uid, expectedFingerprint }` and calls
   `updateTransactionAction`, then `router.refresh()` and closes.

## Which surface opens — the routing gate

Route to a simplified form **only** when:

```
detected = detectType(draft)
simple   = detected
        && (detected.fields.extraItems is absent or empty)
```

This is stricter than `detected != null`. `adapter.detect` returns `extraItems`
(splits) as part of its fields, but the simplified `QuickEntrySpec.Fields` render
only a single amount/account pair — they never show splits. A split expense would
therefore round-trip **invisibly** through the single-amount form and desync the
moment the user edits the amount. `detect` already rejects postings with `cost`
or `assertion`, so the only extra guard needed is the empty-`extraItems` check.

Everything failing the gate — splits, undetectable multi-posting shapes,
raw-edited transactions — opens **Raw**.

## Components

### 1. `features/transactions/editTransactionStore.ts` (new, ~15 lines)

A module-level external store consumed via `useSyncExternalStore`. No new
dependency, no Context provider to thread through every row surface.

```ts
export function openEditTransaction(uid: string): void
export function useEditTransactionUid(): string | null   // null when closed
export function closeEditTransaction(): void
```

Backed by a module `let current: string | null` + a `Set<() => void>` of
listeners. `openEditTransaction` sets `current` and notifies; the dialog
subscribes.

### 2. `features/transactions/actions/loadTransactionForEdit.ts` (new server action)

```ts
'use server'
export async function loadTransactionForEditAction(uid: string): Promise<
  | { ok: true; draft: TransactionJSON; fingerprint: string;
      accounts: string[]; payees: string[]; defaultCurrency: string;
      currencies: string[] }
  | { ok: false }
>
```

Same body as `EditTransaction.tsx`: `requireUser`, `journalService
.findTransaction`, `notFound`→`{ ok: false }`, `tx.withDefaultCurrency(base)
.toWire('edit')`, `tx.fingerprint`, plus `getAccountSuggestions` /
`getPayeeSuggestions` / `getAvailableCurrencies`.

### 3. `features/transactions/QuickTypeForm.tsx` (new — extracted from `QuickEntryContent`)

The current `QuickEntryContent` body (fields state + the shared Date/Description
row + Save), parameterized so both create and edit reuse it:

```ts
type QuickTypeFormProps = {
  spec: QuickEntrySpec<HeaderFields>;
  accounts: string[];
  defaultCurrency: string;
  initialFields?: HeaderFields;          // edit: seed from detect; create: makeEmpty
  onSave: (draft: DraftState) => Promise<TransactionActionState>;
  onSwitchToRaw?: (draft: DraftState) => void;  // edit only; compiles current fields
  onDone: () => void;
};
```

`QuickEntry` (create) passes `onSave = createTransactionAction`-wrapper; the edit
dialog passes an `updateTransactionAction`-wrapper carrying `uid` +
`expectedFingerprint`. When `onSwitchToRaw` is provided, the footer renders an
"Edit as raw" link that compiles current fields and hands the draft up.

### 4. `features/transactions/TransactionEditDialog.tsx` (new, global)

Mounted once in the header slot next to `QuickEntry`. Subscribes to the store.

```
uid = useEditTransactionUid()
loaded: LoadResult | null            // fetched on uid change
view:  'type' | 'raw'
rawDraft: reducer (draftReducer), seeded when entering raw

on uid change (non-null): loadTransactionForEditAction(uid)
  → detected = detectType(draftFromWire)
  → simple   = detected && emptyExtraItems(detected.fields)
  → view     = simple ? 'type' : 'raw'
  → spec     = simple ? QUICK_ENTRY_SPECS.find(s => s.kind === detected.id) : null

render <Dialog open={uid !== null} onOpenChange={close}>:
  view==='type' && spec:
    <QuickTypeForm spec initialFields={detected.fields}
       onSave={saveEdited} onSwitchToRaw={enterRaw} onDone={close} />
  view==='raw':
    raw editor: <RawLens draft={rawDraft} dispatch={rawDispatch} ... />
      + Save button → saveEdited(rawDraft)

saveEdited(draft):
  fd = FormData{ draft: serializeDraftJson(draft,'edit'), uid, expectedFingerprint }
  res = updateTransactionAction(null, fd)
  res.ok ? (router.refresh(); close()) : show res.formError/fieldErrors

enterRaw(draft): seed rawDispatch replaceAll(draft); view='raw'
```

Reuses `RawLens`, `draftReducer`/`initDraft`/`serializeDraftJson`, `detectType`,
`QUICK_ENTRY_SPECS`, `updateTransactionAction` — all existing.

### 5. Trigger rewiring

- `RowActions.tsx`: Edit item `onClick` → `openEditTransaction(uid)` (drop the
  `router.push`). `useRouter` may become unused there.
- `TransactionRow.tsx` `payeeNode`: the payee `<Link>` becomes a small client
  trigger button (new tiny `EditPayeeTrigger` client component, styled as the
  current link) that calls `openEditTransaction(uid)`. `TransactionRow` stays a
  server component; only the trigger is client.
- Mount `<TransactionEditDialog />` in the same slot/wrapper as `QuickEntry`
  (`QuickEntrySlot`), so it loads accounts/currency context once and is global.

## Deliberate simplifications (ponytail)

- **Debt opens as Transfer.** A debt transaction
  (`Assets:Receivable:X` / `Liabilities:Payable:X`) is mechanically a transfer
  and `detectType` classifies it as one — debt is not a registry adapter. Editing
  a debt opens the **Transfer** form (still correct, loses the debt framing).
  Upgrade path: add a `debt` adapter with `detect`, or detect debt accounts in
  the dialog before falling through to transfer.
- **Raw escape is one-way.** "Edit as raw" compiles the simple fields into the
  raw reducer and switches; there is no raw→simple re-detect. Reopen the dialog
  to reset. Upgrade path: re-run `detectType` on raw exit.

## Testing

- **Routing gate unit test** (`emptyExtraItems`/`simple` decision): a plain
  2-posting expense → `type`/`expense`; a split expense (extraItems) → `raw`; a
  posting with a cost → `raw`; an income/transfer/exchange/fix-balance → their
  spec; a 3-way undetectable split → `raw`. Asserts against `detectType` output
  so it can't silently drop splits.
- **Round-trip test**: `detect(draft).fields` → `spec.compile` → draft equals the
  original for each simple type (guards the seed↔compile inverse).
- **Edit save e2e**: open dialog for a seeded expense, change the amount, save →
  `updateTransactionAction` receives `uid` + unchanged `expectedFingerprint` and
  the journal block is rewritten.

## Out of scope

- Deleting or changing the `/transactions/[uid]/edit` route.
- Any change to the create flow's behavior beyond the `QuickTypeForm` extraction.
- Debt-as-debt detection (noted as a follow-up).
