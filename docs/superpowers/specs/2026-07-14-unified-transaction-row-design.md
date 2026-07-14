# Unified transaction row — design

**Date:** 2026-07-14
**Status:** Approved (design), pending implementation plan

## Problem

Transaction rows are rendered differently in every list. Only the main
Transactions list has action buttons (edit / delete / save-as-template); the
account register (`/accounts/<account>`), Dashboard "recent", and Reconcile show
bare read-only tables. We want one shared row component so a row looks the same
and carries the same actions everywhere it represents a real transaction.

## Scope

**In scope — surfaces where a row maps to a real transaction:**

- Main Transactions list — `features/transactions/TransactionList.tsx` +
  `TransactionRowItem.tsx` + `RowActions.tsx`.
- Account register — `app/accounts/[account]/page.tsx`.
- Dashboard recent — `features/dashboard/Dashboard.tsx` (+ `Dashboard.utils.ts`).
- Reconcile — `features/reconcile/Reconcile.tsx` (+ `Reconcile.utils.ts`).

**Out of scope — aggregate rows (a row is a rollup, not one transaction):**
Payees, Balance, Debts, Monthly/Cash-flow. `edit/delete this row` is meaningless
there, so they keep their current tables.

## Key technical enabler (verified against ledger 3.4.1)

Register rows come from `ledger register`, which today emits no uid, so there is
nothing to attach actions to. The journal stores the uid as a **boolean** tag
(`; :uid: <id>`), which ledger's `tag("uid")` returns empty for. **But**
`%(note)` in a register `--format` emits the raw comment text including the
`; :uid: <id>` line:

```
ledger register Assets:Checking --format '%(date)|%(payee)|%(note)|%(display_amount)|%(display_total)\n'
# → 2026/01/01|Coffee| :uid: 01AAA...|$ -5.00|$ -5.00
```

So we extract the uid with the existing `UID_LINE_REGEX` (`lib/journal/uid.ts`).
**No journal-format change and no migration are required.** Rows whose
transaction has no uid (legacy, not yet backfilled) simply render without
actions.

## Architecture

### 1. Shared view-model — `TransactionRowView`

A single type every surface maps into. Core fields are always present; extras are
individually typed (no stringly-typed `variant` prop):

```ts
type TransactionRowView = {
  // core — rendered identically on every surface
  date: string;
  payee: string;
  amount: string;          // already-rendered by the source (multi-currency ok)
  status?: DraftStatus;    // 'cleared' | 'pending' | 'none'
  uid?: string;            // present → actions enabled

  // optional extras — each rendered in a consistent slot, only if provided
  accountsSummary?: string; // main list: "Expenses:Food → Assets:Checking"
  runningTotal?: string;    // account register
  age?: number;             // reconcile (days since date)
  account?: string;         // dashboard / reconcile single-account context

  // save-as-template needs full postings; only the main list has them
  templateDraft?: TemplateDraft;
};
```

`amount` means "whatever this surface wants to show": the transaction amount on
the main list, the account's own leg amount on the register. The component only
renders it — the source decides.

### 2. Shared component — `TransactionRow` (client)

- Renders the core (`date`, `status` badge, `payee`, `amount`) with identical
  styling everywhere, reusing the mobile-card + desktop-grid layouts currently
  in `TransactionRowItem.tsx`.
- Drops each provided extra (`accountsSummary` / `runningTotal` / `age`) into a
  consistent slot.
- Shows the action menu **only when `uid` is present**.

### 3. Actions — generalized `RowActions`

- **Edit** and **Delete** are universal and need only the `uid`:
  - Edit → `router.push('/transactions/<uid>/edit')` (route already exists).
  - Delete → a `deleteTransactionByUid(uid)` server action that resolves the
    current journal fingerprint **server-side** (the pattern already used by the
    undo-toast work) and calls the existing `deleteTransactionAction`. Register
    rows therefore do not need to carry a per-row fingerprint.
- **Save-as-template** requires the full postings, so it renders only when
  `templateDraft` is present (the main list). Extending it to register rows via
  an on-demand `findTransaction(uid)` fetch is deliberately deferred (YAGNI).

### 4. Per-surface adapters (the only per-page changes)

- **Main list:** map `TransactionRow` → view (it already has uid, status,
  postings; build `accountsSummary` + `templateDraft` as today).
- **Account register / Dashboard recent / Reconcile:** add `%(note)` to the
  `ledger register` `--format`, extract `uid` via `UID_LINE_REGEX`, map the
  parsed fields → view. Each keeps its extra column (register → `runningTotal`,
  reconcile → `age`). The account-register page (currently a server component)
  gains a thin **client** wrapper so the client row/actions can mount; data is
  still fetched server-side and passed down.

### Data flow

```
source (parsed journal row | ledger register line)
   → per-surface adapter → TransactionRowView
   → <TransactionRow> (shared, client)
   → <RowActions> when view.uid (edit/delete always; save-as-template if templateDraft)
```

## Error handling

- No `uid` on a row → actions hidden; row still renders. Expected for legacy
  un-backfilled transactions.
- Delete: `deleteTransactionByUid` resolves the fingerprint server-side; if the
  transaction is already gone or the journal changed, the existing delete path
  returns a structured error surfaced as an error toast (as today). Success
  fires a toast and `router.refresh()`.
- Account register running total remains a pure ledger value (CLAUDE.md hard
  rule) — never recomputed in JS.

## Testing

- Unit tests per adapter: register line (with and without a `:uid:` note) → view,
  covering uid extraction and the no-uid (actions-disabled) case.
- Unit test for `deleteTransactionByUid` resolving the fingerprint and delegating
  to the delete path.
- Existing main-list behavior must stay green (its adapter is the trivial case).

## Explicitly deferred (YAGNI)

- Save-as-template on register rows (needs an on-demand transaction fetch).
- Any change to aggregate report tables (Payees/Balance/Debts/Monthly).
- Changing the on-disk uid tag format (the `%(note)` approach makes it
  unnecessary).

## Files touched (anticipated)

- New: `features/transactions/row/TransactionRow.tsx`,
  `features/transactions/row/rowView.ts` (type + adapters),
  server action `deleteTransactionByUid` (in `features/transactions/actions/`).
- Generalize: `features/transactions/RowActions.tsx`,
  `TransactionRowItem.tsx` (fold into the shared row).
- Adapt: `app/accounts/[account]/page.tsx` (+ new client wrapper),
  `features/dashboard/Dashboard*.ts(x)`, `features/reconcile/Reconcile*.ts(x)`.
