# Transactions register: paged + virtualized loading

**Date:** 2026-06-30
**Status:** Approved design, ready for implementation plan

## Problem

`/transactions` renders the entire transaction set at once. On phones with
hundreds–thousands of transactions the page is slow and crashes the browser.

Two costs stack:

1. **Payload.** `features/transactions/Transactions.tsx` loads every transaction,
   filters/sorts in memory, and passes the whole array into the client component
   `TransactionTable`. That array — including the heavy per-transaction `rawBlock`
   raw-text field — is serialized into the RSC payload and shipped to the browser.
2. **DOM.** `TransactionTable.tsx` does a plain `.map()` over the full list,
   building one DOM subtree per transaction (mobile card list + desktop table
   markup), with no windowing.

Filters already exist server-side (`applyTransactionFilters`: `start`/`end`/
`account`/`payee`/`q`) and the parsed journal is already cached in server memory
(`unstable_cache`, 60s TTL), so paging the in-memory list is cheap.

**Key constraint:** infinite scroll *alone* does not fix the crash — appending
rows defers the DOM blowup but does not bound it. Only windowing (rendering just
the visible rows) bounds the DOM. The chosen design does both: bounded payload
(paging) **and** bounded DOM (virtualization).

## Approach (chosen: paged loading + virtualization)

Server-action offset paging ships a slimmed row projection; a virtual scroller
renders only the visible window and fetches the next page as it nears the end.
This is the only option that fully fixes both the payload and the DOM at any
transaction count.

Rejected alternatives:

- **Append-only infinite scroll** (no virtualization): fixes initial load, but
  DOM still grows unbounded — can still crash on long scrolls.
- **Virtualize, ship all data**: fixes the DOM, but the full payload (with
  `rawBlock`) is still shipped — slow first load and high JS memory on mobile.

### Dependencies

- **Add `@tanstack/react-virtual`** — headless windowing (measurement + offsets,
  no markup of its own).
- **Do NOT add `@tanstack/react-table`** — it provides client-side column
  sorting/filtering/grouping, all of which we already do server-side.
- **Do NOT use shadcn's "data-table" recipe** — it is a copy-paste TanStack
  Table example with button pagination, not virtualization. shadcn's `Table` is
  presentational only and is what crashes mobile today. We keep shadcn for row
  styling (`Button`, `DropdownMenu`, etc.) but render rows as div-grid, not a
  `<table>`, because virtualized rows must be absolutely positioned.

## Components

### 1. Slim row projection

New type and projector in `lib/journal`:

```ts
type TransactionRow = Omit<Transaction, 'rawBlock' | 'endLine'> & {
  postings: Array<{ account: string; amount: string; currency: string }>;
};

const toTransactionRow = (t: Transaction): TransactionRow => ...
```

Keeps every field the table and `RowActions` consume — `uid`, `fingerprint`,
`date`, `payee`, `status`, `note`, `file`, `startLine`, and slimmed `postings`
(`RowActions` needs `fingerprint` for delete and `payee`/`status`/`note`/
`postings` for "save as template"). Drops `rawBlock` (the dominant payload cost),
`endLine`, and posting `cost`/`assertion` annotations.

### 2. Server action — `loadTransactionPage`

`features/transactions/actions.ts`:

```ts
loadTransactionPage({
  filters: TransactionFilters,
  offset: number,
  limit: number,
}): Promise<{
  rows: TransactionRow[];
  nextOffset: number | null;
  total: number;
}>
```

- Calls `requireUser()` — identity comes from the session, never from the client.
- Loads the same cached parsed journal as the page, applies `applyTransactionFilters`
  and the existing sort (`date` desc).
- `slice(offset, offset + limit).map(toTransactionRow)`.
- `nextOffset = offset + rows.length < total ? offset + rows.length : null`.
- `PAGE_SIZE = 50` (shared constant).

Offset paging (not keyset cursors) is acceptable: the filtered list is a stable
in-memory snapshot within the 60s cache window.

### 3. Server component — `Transactions.tsx`

Stays the data owner but ships only **page 1**:

- Computes `total`, filter dropdown values (`payees`/`accounts` — small unique
  sets, keep), and the first `PAGE_SIZE` slimmed rows.
- Passes page-1 rows + `total` + the serialized `filters` to the client list.

### 4. Client list — replaces `TransactionTable`

- Holds accumulated `rows` in state, seeded from page-1 props.
- `@tanstack/react-virtual` virtualizer with `measureElement` (dynamic heights —
  mobile cards vary).
- Renders only the visible window (~30 nodes) regardless of `total`. **This bounds
  the DOM and stops the crash.**
- An end-sentinel near the last virtual item calls `loadTransactionPage` for the
  next offset, appends results, and halts when `nextOffset === null`.
- Desktop rows move from `<table>` to div-grid styled to match the current table;
  mobile keeps the card layout via the existing `md:` breakpoint. Same visual
  output.

### 5. Filter reset (reset to page 1)

- Filters remain in the URL (as today). Changing a filter navigates → server
  re-renders page 1 fresh.
- The client list is keyed on the serialized filter string, so React remounts it
  and discards accumulated rows. No scroll preservation.

## Data flow

```
URL ?start&end&account&payee&q
  → Transactions.tsx (server): load cached journal, filter+sort,
    total + page-1 rows (slimmed) + filters
      → ClientList (key=filterString): seed rows from page 1
          → react-virtual renders visible window
          → sentinel near end → loadTransactionPage({filters, offset, PAGE_SIZE})
              (server: requireUser, same filter+sort, slice+project)
            → append rows, update nextOffset
```

## Out of scope (YAGNI)

- Keyset cursors — offset is fine for a stable in-memory snapshot.
- `/registers/monthly/[account]` — already `-M` aggregated via ledger CLI, not a
  per-transaction list.
- `/api/transactions/export` — already streams the full filtered set server-side;
  no client memory concern; untouched.

## Testing

- **Unit — `toTransactionRow`:** drops `rawBlock`/`endLine`, slims postings,
  preserves consumed fields.
- **Unit — `loadTransactionPage`:** offset/limit slicing; `nextOffset` is `null`
  at the end and a number mid-list; filters applied; requires an authenticated
  user.
- **Component — client list:** seeds from page-1 props; appends on sentinel;
  halts at end (`nextOffset === null`); remounts (discards rows) on filter change.
- **Manual:** large journal at a phone viewport — confirm the rendered DOM node
  count stays bounded while scrolling the full list.
