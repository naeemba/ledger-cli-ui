# Phase 4.1 — Edit / Delete Transaction (Design)

Status: approved during brainstorming, awaiting implementation plan.
Date: 2026-05-18.

## Goal

Phase 4.1 of `PLAN.md`. The app currently writes journals exactly once (add) and otherwise treats them as read-only. This phase makes individual transactions editable and deletable through the UI, backed by a single mutation surface that locks, parses, rewrites, and invalidates the cache for each change.

## Scope

In:

- A journal parser that understands the real-world shape of the user's journal (tabs, slash dates, comma thousands, blank-amount auto-balance, `include` graphs).
- A one-time, import-time backfill that gives every transaction a stable `; :uid: <ULID>` tag.
- A `writeJournal` helper that performs file-scoped edit or delete with a per-user in-memory mutex.
- A list view at `/transactions` with date/account/payee filters and free-text search.
- An edit page reusing `TransactionForm` in an `edit` mode.
- Inline delete with `ConfirmDialog`.
- Concurrent-edit safety via content fingerprint.
- Test suite (vitest) covering the parser, backfill, and writer.

Out (named explicitly so they don't creep in):

- Audit log of mutations. Phase 7.
- Undo / restore from prior journal state.
- Moving a block to a different file when its date changes.
- Bulk edit / bulk delete.
- Inline editing inside the list table.
- Diff preview before save.
- Multi-process / multi-replica safety. The in-memory mutex is correct for the current single-Node-process deploy; file-locking is parked in Phase 7.
- Cache key tied to journal mtime. That is Phase 4.3.
- Templates / recurring transactions. Phase 4.2.

## Real-world constraints (from the existing journal)

Measured against `data/journals/<userId>/`:

- ~1,880 transactions across 11 files, 5,568 postings, 873 payees, 106 accounts, range 2023-06 → 2025-11.
- Multi-file via `include` from `ledger.ledger`. Annual + monthly + quarterly partitioning.
- Headers use `YYYY/MM/DD` (slashes). Ledger accepts both `/` and `-`.
- Postings indented with tabs. Mix of styles is the norm.
- Comma thousands separators in amounts (`2,290 Kirt`, `1,000 Kirt`).
- Auto-balanced postings (last line bare account, no amount) are common.
- Currency suffix follows the amount in the user's existing data (`168 Kirt`). However, the current `formatTransaction` (Phase 2's add flow) emits currency *before* the amount (`Kirt 168`). Both shapes are valid ledger syntax. The journal therefore already contains a mix of conventions, and the parser must accept both.

The parser must read all of the above. The writer emits the project's existing canonical format (`YYYY-MM-DD`, 4-space indent, no comma separators, **currency before amount** — unchanged from Phase 2) — but only for the one block it is rewriting, never for the rest of the file. An edited block flips from `168 Kirt` to `Kirt 168` as a consequence of the normalize-on-edit policy; that is expected and intentional.

## Architecture overview

New modules under `lib/journal/`:

- `lib/journal/parser.ts` — pure functions that parse a journal file (or `mainPath` + recursive `include`s) into typed `Transaction[]`. No I/O beyond reading files passed in.
- `lib/journal/uid.ts` — ULID generation, the `; :uid: ...` regex, and a helper that inserts a UID line into a raw block while matching the block's existing indent.
- `lib/journal/backfill.ts` — the import-time pass. For each ledger file reachable from the include graph, parse it, insert a UID into any block missing one, write the file back if anything changed. Idempotent.
- `lib/journal/write.ts` — the `writeJournal` helper. In-process mutex keyed by `userId`. Given `{ userId, uid, kind: 'edit' | 'delete', draft?, expectedFingerprint }`, parse the file containing that UID, splice the block, write atomically, invalidate the cache tag.
- `app/transactions/page.tsx` — list view (server component, reads via parser).
- `app/transactions/[uid]/edit/page.tsx` + `actions.ts` — edit page reusing `TransactionForm`.
- `app/transactions/actions.ts` — delete server action.

Touched:

- `lib/journals.ts` — `replaceJournalFromSingleFile` and `replaceJournalFromZip` call `backfillUids(userId)` as their last step. `addTransaction` stamps a fresh ULID into the new block.
- `lib/transactions/schema.ts` — `TransactionDraft` gains an optional `uid` field; `formatTransaction` emits the `; :uid: ...` line immediately after the header when `uid` is set.
- `components/nav/config.ts` — new `Transactions` entry under the Activity section. Sidebar + command palette pick it up automatically.
- `features/dashboard/Dashboard.tsx` — "Recent transactions" card gains a "View all →" link to `/transactions`.

Nothing else in the report pages or auth flow changes.

## Section 1 — Journal parser

Entry point:

```ts
parseJournal(userId: string): Promise<ParsedJournal>
```

returns:

```ts
type ParsedJournal = {
  files: Array<{ path: string; mtimeMs: number }>; // mainPath + every reachable include
  transactions: Transaction[];                     // in file order, then source order
};

type Transaction = {
  uid: string | null;          // null only inside the backfill pass; the writer treats null as a bug
  file: string;                // absolute path under the journal dir
  startLine: number;           // 1-based, inclusive
  endLine: number;             // 1-based, inclusive
  date: string;                // YYYY-MM-DD (normalized from slashes too)
  payee: string;
  status: 'cleared' | 'pending' | 'none';
  note: string | null;         // joined non-UID comment lines
  postings: Array<{ account: string; amount: string; currency: string }>;
  rawBlock: string;            // original bytes
};
```

Pipeline:

1. `resolveUserJournal(userId)` → `mainPath`.
2. Recursively follow `include <path>` directives. Relative paths resolve against the file containing the include. Build the include graph; refuse cycles.
3. For each file, walk lines and group into blocks. A block starts at a line matching `^\d{4}[-/]\d{2}[-/]\d{2}` and ends at the next blank line (or EOF). Lines outside blocks (directives like `account`, `commodity`, `P`, `D`, periodic `~`, automated `=`, top-level comments) are ignored by the parser but the file's byte content is preserved for the writer.
4. For each block:
   - Header → date (normalize `/` to `-`), status marker (`*` / `!` / none), payee.
   - Comment lines (`^\s*;`) → either UID (`; :uid: <ULID>` shape) or note content.
   - Posting lines (`^\s+<non-;>`) → split into account + (optional) amount + currency. Amount/currency parsing accepts both `<currency> <amount>` and `<amount> <currency>` orderings; the parser normalizes to `{ amount, currency }` regardless of which side the currency was on in the source. Comma thousands separators are stripped from amounts. Empty-amount postings keep `amount: ''` for round-trip with the auto-balance machinery.
5. Append to `transactions[]` with source coordinates.

Non-goals:

- No arithmetic. Balance enforcement is the writer's job via the existing Zod schema.
- No semantics for ignored directives — opaque pass-through.
- No I/O caching at this layer. Phase 4.3 will add an mtime-keyed wrapper.

Test-exported helpers:

- `parseBlock(text: string): ParsedBlock | null`
- `parseHeader(line: string)`, `parsePostingLine(line: string)`
- `resolveIncludes(mainPath: string): Promise<string[]>`

The parser is the only piece of code that needs to understand the diverse formatting in the user's journal. Everything downstream sees the normalized model. Test coverage concentrates here.

## Section 2 — Import-time UID backfill

API:

```ts
backfillUids(userId: string): Promise<{ filesTouched: number; uidsAdded: number }>
```

Hook point: inside `replaceJournalFromSingleFile` and `replaceJournalFromZip`, after the files land on disk and `setJournalMain` resolves.

Algorithm:

1. `parseJournal(userId)` to discover every file in the include graph.
2. For each file, walk its bytes line-by-line. Maintain a buffer of "current block" lines.
3. When a block ends (blank line or EOF), check whether any line inside matches `^\s*;\s*:uid:\s*[0-9A-HJKMNP-TV-Z]{26}\s*$`. If yes, skip.
4. Otherwise:
   - Detect the indent of the first non-comment posting line in the block (`\s+` prefix, captured verbatim). Fallback: 4 spaces if no posting is found.
   - Insert `<indent>; :uid: <ulid()>` immediately after the header line.
5. After processing all blocks in a file, write the file back via tmpfile + `rename` if any UID was inserted. If nothing was inserted, leave the file untouched (preserve mtime).
6. Files outside the include graph (`baba.ledger`, `*_old.ledger` in the user's data) are left alone.

Properties:

- Idempotent. Re-running over a fully migrated journal is a no-op.
- Minimal diff. Only inserts one line per block.
- Atomic per file. tmpfile + `rename` keeps a crash mid-pass from leaving a half-written file.
- Crash-safe across files. A crash between files leaves a partially-migrated journal that re-running picks up cleanly.

ULIDs from the `ulid` package, monotonic factory. Choice rationale: sortable by creation time, look nicer in a journal file than UUIDv4.

Edge case: if the user re-imports a journal that already contains UIDs (e.g., they exported from this app and re-imported), the backfill detects existing UIDs and preserves them.

`/import` UX impact: the existing success toast becomes `"Imported N files, M transactions tagged"` when the backfill ran, or `"Imported N files"` when it had nothing to add. Backfill failure fails the whole import (the import was already destructive of the previous journal; inconsistent state is worse than a hard rejection).

## Section 3 — `writeJournal` helper

API:

```ts
type WriteEditInput = {
  kind: 'edit';
  uid: string;
  draft: TransactionDraft;
  expectedFingerprint: string;
};

type WriteDeleteInput = {
  kind: 'delete';
  uid: string;
  expectedFingerprint: string;
};

type WriteInput = WriteEditInput | WriteDeleteInput;

writeJournal(userId: string, input: WriteInput): Promise<WriteResult>;

type WriteResult =
  | { ok: true }
  | { ok: false; reason: 'not-found' | 'stale' | 'invalid'; message: string; fieldErrors?: Record<string, string> };
```

Flow:

1. Acquire the per-user mutex (in-memory `Map<userId, Promise>` queue).
2. `parseJournal(userId)` to find the transaction by `uid`. If missing → `not-found`.
3. For `edit`:
   - Submitted `draft.uid` must equal `input.uid`. The Zod schema requires `uid` on edit submissions; the form sends it as a hidden field.
   - Run the existing `transactionDraftSchema` validation. On failure → `invalid` with `fieldErrors`.
   - Render the new block via `formatTransaction(draft)`. The formatter emits the UID line (matching first-posting indent) right after the header.
4. For `delete`: nothing to render. The block lines and one adjacent blank line are spliced out.
5. Read the target file fresh from disk (minimize TOCTOU window).
6. Locate the block: search for the UID's exact line. If absent, → `stale`.
7. Compute the fingerprint of the current block; compare against `expectedFingerprint`. Mismatch → `stale`.
8. Splice: `prefix + newBlock + suffix` for edit, or `prefix + suffix` for delete (minus the joining blank line).
9. Write atomically: `fs.writeFile(file + '.tmp', content)` → `fs.rename(file + '.tmp', file)`.
10. `updateTag(getJournalCacheTag(userId))` + `revalidatePath('/', 'layout')`.
11. Release the mutex.

Delete adjacency rule: remove the block lines `[startLine..endLine]` plus the *next* blank line. If the block is the last in the file, remove the *previous* blank line instead. Other blank-line patterns in the file are preserved.

The fingerprint is `sha256` of `formatTransaction(parsedDraft)` for the block currently in the file — i.e., the canonical rendering. Stable across tab-vs-space, slash-vs-dash, comma-vs-no-comma differences in the source.

Non-goals:

- No multi-file moves. Editing a date does not relocate the block.
- No balance arithmetic beyond the existing schema's `superRefine`.
- No batched mutations. One UID per call.

The in-memory mutex is correct for the current single-Node-process deployment. Multi-process safety is parked in Phase 7.

## Section 4 — List view at `/transactions`

Layout:

- `app/transactions/page.tsx` — server component. `parseJournal(userId)`, apply filters from `searchParams`, render the table.
- `app/transactions/TransactionTable.tsx` — client component for row actions.
- `components/nav/config.ts` — new `Transactions` entry under the Activity section.
- `features/dashboard/Dashboard.tsx` — "Recent transactions" gains a "View all →" link.

Behavior:

- Sorted newest-first. No pagination on the initial cut; 1,880 rows is within the budget. Fallback if perf becomes a problem: drop in `@tanstack/react-virtual` over the same component.
- All filters read from URL search params so deep-linking and back/forward work:
  - **Date range** — reuses the existing `DateFilter` (`start`, `end` params).
  - **Account** — single-account combobox sourced from `ledger accounts` (the same suggestions endpoint the add form already uses).
  - **Payee** — single-payee combobox, sourced from the parser (no need to re-shell ledger).
  - **Search** — free-text input matching against payee, note, and posting-account substring (case-insensitive). Debounced 200 ms client-side.

Columns: `Date | Status | Payee | Accounts | Amount(s) | Actions`.

- **Date** — `formatDate` (existing helper).
- **Status** — small badge: `✓` cleared, `!` pending, blank otherwise.
- **Payee** — truncated with `title` attribute.
- **Accounts** — first two accounts joined with `→`; tooltip lists all on hover.
- **Amount(s)** — the transaction's magnitude per currency: sum of positive postings only (a balanced transaction has equal positive and negative sides, so the positive sum is the natural "size" to display). Formatted via `formatAmount`. Multi-currency stacks vertically. Bare-account auto-balance postings contribute zero to this sum and are otherwise unchanged in storage.
- **Actions** — `Edit` icon-link + `Delete` `ConfirmDialog` trigger.

Row interaction:

- The whole row is the click target → `/transactions/${uid}/edit`.
- The `Delete` button stops propagation.

Empty states:

- Journal has no transactions → "No transactions yet" card with primary action linking to `/transactions/new`.
- Filters return no matches → "No matches" line with a "Clear filters" button.

Skeleton: `app/transactions/loading.tsx` reuses `PageSkeleton` (title + table block).

## Section 5 — Edit page

Route: `app/transactions/[uid]/edit/page.tsx` (server component).

- Loads the transaction via `parseJournal(userId)`, finds it by `uid`. If missing → `notFound()`.
- Builds an `initialDraft: TransactionDraft` from the parsed `Transaction`.
- Computes `expectedFingerprint = sha256(formatTransaction(initialDraft))`.
- Renders `<TransactionForm mode="edit" initialDraft={initialDraft} uid={uid} expectedFingerprint={expectedFingerprint} />`.

`TransactionForm` changes (one component, two modes):

- New props: `mode: 'create' | 'edit'`, `initialDraft?: TransactionDraft`, `uid?: string`, `expectedFingerprint?: string`.
- Form state initializes from `initialDraft` when present; otherwise from the existing empty-form defaults.
- Bound server action switches by mode:
  - `create` → existing `createTransactionAction`.
  - `edit` → new `updateTransactionAction` calling `writeJournal(userId, { kind: 'edit', uid, draft, expectedFingerprint })`.
- Submit button label: `"Add transaction"` vs `"Save changes"`.
- Hidden `<input name="uid">` and `<input name="expectedFingerprint">` so the server action does not have to trust URL params.
- On success: same `revalidatePath` + sonner toast pattern as the add flow, then `redirect('/transactions')` instead of `/`.

The two actions share a single `TransactionActionState` discriminated-union type and the same field-error wiring. Same Alert + `AlertDescription` error surface.

The parser fills in `DEFAULT_CURRENCY` when an amount has no currency suffix in the source, so every parsed posting has a populated `currency` field. The form's posting rows already accept currency per-row, so this is a clean round-trip. Auto-balanced postings (`amount: ''`) round-trip via the empty-amount row the form already supports.

## Section 6 — Delete flow

Trigger: Delete button on each row of `/transactions`, wired through `<ConfirmDialog>` (`variant="destructive"`, `confirmLabel="Delete"`, `description="This will permanently remove the transaction from the journal."`).

Server action: `deleteTransactionAction(uid, expectedFingerprint)` in `app/transactions/actions.ts`.

1. `requireUser()`.
2. `writeJournal(user.id, { kind: 'delete', uid, expectedFingerprint })`.
3. `not-found` → return `{ ok: false, message: 'Transaction no longer exists. Refreshing…' }`. Client surfaces this via sonner and `router.refresh()`.
4. `stale` → return `{ ok: false, message: 'Transaction was modified elsewhere. Refreshing…' }`. Same handling.
5. Success → sonner toast `"Transaction deleted"` + `router.refresh()`.

The list view passes the row's `expectedFingerprint` (computed at parse time) to the delete action, matching the edit-page guard.

No undo. The destructive `ConfirmDialog` is the only friction.

## Section 7 — Concurrent edit safety

Mechanism — `expectedFingerprint`:

- The edit page renders a hidden `<input name="expectedFingerprint">` whose value is `sha256(formatTransaction(parsedTransaction))`.
- `updateTransactionAction` receives `{ uid, draft, expectedFingerprint }`.
- Inside `writeJournal`, after locating the block by UID, recompute the fingerprint of the current file's block. Mismatch → `{ ok: false, reason: 'stale' }`.
- The form surfaces this as a non-destructive Alert: _"This transaction was modified somewhere else. Reload to see the latest version."_ — with a Reload button.

Costs: one sha256 per edited transaction on form load and on submit. Negligible.

The delete path uses the same guard.

Error model:

| `WriteResult` reason | UI surface                            | Action                  |
| -------------------- | ------------------------------------- | ----------------------- |
| `not-found`          | Sonner error toast                    | `router.refresh()`      |
| `stale`              | Inline Alert in form / toast on delete | Manual reload button    |
| `invalid`            | Field-error map → same as add form   | Inline per-field        |
| Filesystem error     | Generic destructive Alert             | Stays on page           |

Out of the error model:

- No retry-with-merge UI. The user resolves collisions manually by reloading.
- No optimistic UI for delete. The row stays until the action returns.
- No exposing `ledger` stderr or raw fs errors to the client. The action maps any unexpected exception to a generic `"Could not save changes"` and `console.error`s the detail server-side.

## Section 8 — Testing

Setup:

- `vitest` + `@vitest/coverage-v8`. No jsdom — all logic is server-side / pure.
- `pnpm test`, `pnpm test:watch` scripts.
- Fixtures directory `lib/journal/__fixtures__/` with hand-crafted journals covering the real-data cases: tabs, slashes, comma amounts, blank-amount auto-balance, nested includes, mixed-indent blocks.

Parser tests (`lib/journal/parser.test.ts`):

- `parseHeader` round-trips `YYYY-MM-DD`, `YYYY/MM/DD`, `* payee`, `! payee`, payee with trailing whitespace, empty payee rejection.
- `parsePostingLine` handles tabs vs. spaces, comma thousands, negative amounts, currency-after format (project convention), empty-amount auto-balance row.
- `parseBlock` handles a transaction with no comments, with a note, with a note + UID, with multiple comment lines.
- `parseJournal` resolves `include` recursively, detects include cycles, ignores files outside the include graph.
- Idempotency: `parseJournal` is stable across runs (same `JSON.stringify(transactions)` output).

Backfill tests (`lib/journal/backfill.test.ts`):

- Fresh journal → every block gets a UID; non-block content untouched (byte-diff against fixture).
- Mixed journal → only blocks missing UIDs get one; others bit-exact.
- Re-running backfill on a fully migrated journal → zero file writes (assert via mtime).
- UID line indent matches the first posting's indent (tab vs. space fixtures).
- Multi-file: backfill touches included files, leaves orphan files alone.

Writer tests (`lib/journal/write.test.ts`):

- `edit` rewrites only the target block; rest of file byte-exact.
- `delete` removes the block plus the one adjacent blank line, preserving the rest.
- `delete` on the last block in a file removes the *leading* blank line.
- `stale` fingerprint → returns `stale`, file untouched.
- `not-found` UID → returns `not-found`, file untouched.
- Mutex serializes two concurrent writes for the same userId.
- `addTransaction` updated to stamp a UID; round-trip test (write → parse → match).

Integration smoke (`lib/journal/integration.test.ts`):

- Full pipeline using a tmpdir copy of a small fixture: parse → backfill → edit a known transaction → parse again → expect the edit and an unchanged UID; delete it → parse again → expect it gone.
- Fixture under `lib/journal/__fixtures__/integration/` — ~10 transactions across 2 included files; uses tabs and slashes so messy-formatting paths run end-to-end.

Out of scope for this phase's tests:

- React Testing Library on the form / table. Phase 5.2's job.
- Performance benchmarks.

Coverage target: 95%+ on `lib/journal/*`. The rest of the codebase remains untested for now (Phase 5.2).

## Implementation order

Each step is independently mergeable. Steps 1–5 are invisible to the user.

1. Parser + tests.
2. Backfill module + tests.
3. Wire backfill into `/import`.
4. `writeJournal` helper + tests.
5. Update `addTransaction` + `formatTransaction` to stamp / emit UIDs. Round-trip test.
6. List view at `/transactions`. Read-only; sidebar + command palette entries light up.
7. Edit page + `TransactionForm` `edit` mode.
8. Delete + `ConfirmDialog` wiring.
9. Fingerprint guard + `stale` UX (folded into 7 and 8 as part of those steps).

## Open questions

None at design time. If the implementation surfaces any, they are recorded on the plan, not retro-added to this spec.
