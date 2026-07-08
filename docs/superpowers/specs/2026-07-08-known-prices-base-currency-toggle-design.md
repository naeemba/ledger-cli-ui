# Known Prices — Base-Currency Toggle

## Problem

The "Known prices" tab lists each held commodity's latest known price in
**whatever quote the newest `P` directive used** — no normalization. Fetched
prices come back in USD, but journal-sourced prices keep their original quote:
BTC shows in DAI, Nim/Sekke in KIRT, etc. A user scanning the table sees a
column of mixed currencies and cannot compare values at a glance.

This is faithful to the journal, not a bug — but the user wants a way to view
every row in one consistent currency (USD).

## Goal

Add a toggle on the Known prices tab that switches between two views:

1. **Original quote** (current behavior, default) — latest price in the quote
   the newest `P` directive recorded.
2. **In USD** — every row valued into USD (the base currency) using ledger's
   cross-rate chain (BTC→DAI→USD, Nim→KIRT→USD, …). Rows with no USD path show
   "no price".

## Key technical finding

`ledger prices -X USD` does **not** convert — it emits the raw `P` directives
plus junk zero rows. Verified against Ledger 3.4.1.

A `balance` report **does** chain-convert. Proven with a synthetic journal
(one `1 <commodity>` posting per held commodity) against the price-db:

```
ledger --file <main> --price-db <db> --file <probe> \
  balance '^Probe:' --flat -X USD --empty --no-total \
  --format "%(account)|%(quantity(scrub(display_total)))|%(commodity(scrub(display_total)))\n"
```

Output (from the user's real data):

```
Probe:ADA|0.169753|USD
Probe:BTC|107393.21686406863836|USD      <- chained BTC→DAI→USD
Probe:KIRT|0.00568182|USD
Probe:Nim|117.045492|USD                 <- chained Nim→KIRT→USD
Probe:Orphan|1|Orphan                    <- no USD path: stays in own commodity
Probe:USD|1|USD
```

Notes learned during the spike:
- Transactions in the probe journal **must be blank-line separated**, else
  ledger merges postings into one transaction and errors ("Only one posting
  with null amount allowed").
- Each probe transaction needs an explicit offsetting posting
  (`Probe:X 1 X` / `ProbeEq:X -1 X`) — a single null-amount balancer cannot
  balance multiple commodities.
- `--empty` is required: USD default display precision rounds sub-unit values
  (ADA 0.169, KIRT 0.0057) to `0`, which ledger would otherwise drop as a
  zero row. `quantity(scrub(display_total))` still returns full internal
  precision, so `--empty` only rescues visibility, not accuracy.
- Anchor the account query with `^Probe:` — an unanchored `Probe` regex also
  matches the offsetting equity accounts.
- A row whose `commodity` field is **not** `USD` was not convertible → treat
  as no USD path.

## Design

### Server — `PriceService.listKnownPricesInBase(userId)`

New method alongside `listKnownPrices`. Returns `KnownPrice[]` (same shape).

Steps:
1. Compute the raw rows via the existing `listKnownPrices(userId)` — reused
   verbatim so `date` / `ageDays` / `stale` / `source` describe the underlying
   primary price (see "Column semantics" below).
2. Build a probe journal string: for each held commodity `sym`, one
   blank-line-separated balanced transaction:
   ```
   2000-01-01 * probe
     Probe:<sym>    1 <sym>
     ProbeEq:<sym> -1 <sym>
   ```
   Symbols are the raw `ledger commodities` strings (already what
   `listHeldCommodities` returns). Guard against symbols containing newlines
   (mirrors the `listPriceHistory` guard); skip any such symbol.
3. Write the probe journal to a temp file (`os.tmpdir()`, unique name).
   `try/finally` unlink.
4. Run ledger via `runLedgerForUser(userId, ['--file', probePath, 'balance',
   '^Probe:', '--flat', '-X', base, '--empty', '--no-total', '--format',
   BALANCE_BASE_FORMAT])`. `runLedgerForUser` already prepends
   `--file <main> --price-db <db>`; the extra `--file` merges the probe's
   postings into the same price graph.
5. Parse each `Probe:<sym>|<quantity>|<commodity>` line into a map
   `sym → { price, commodity }`.
6. Merge onto the raw rows: for each raw row,
   - if a probe entry exists **and** its `commodity === base` →
     `{ ...rawRow, price: <parsed>, quote: base }`.
   - otherwise → `{ ...rawRow, price: null, quote: null }` (no USD path).
   - Keep `date`, `ageDays`, `stale`, `source` from the raw row unchanged.
7. Return sorted the same way `listKnownPrices` sorts.

`base` comes from `resolveBaseCurrency(userId)` (always `USD` today, but keep
it a variable so the two methods share the source of truth).

Parsing helper (pure, unit-testable) lives in `knownPrices.ts`:
`parseBaseBalance(stdout): Map<string, { price: number; commodity: string }>`.

`BALANCE_BASE_FORMAT` constant lives beside `PRICES_FORMAT` in `knownPrices.ts`.

**Concurrency / cost:** one extra ledger subprocess total (not per-commodity).
`listKnownPrices` itself already fans out per-commodity; `listKnownPricesInBase`
calls it once, then adds a single balance call. No change to the existing
`PRICE_HISTORY_CONCURRENCY` bound.

### Page — `app/prices/page.tsx`

- Read `searchParams`. When `base === 'usd'` (or, future-proof, any truthy
  `base` flag) call `listKnownPricesInBase`; else `listKnownPrices`.
- Page is already `force-dynamic`, so the searchParam-driven refetch is free.
- Pass a `baseMode: boolean` prop through to `PricesTabs` so the toggle can
  render its active state.

### UI — toggle

- A two-option segmented control rendered inside `KnownPricesView`'s container
  header (or just above the table), shown only on the Known prices tab.
- Options: **Original quote** (`/prices`) and **In USD** (`/prices?base=usd`),
  rendered as `next/link`s so selection is a server navigation (URL param +
  refetch, per decision). Active option styled per existing segmented-control
  / `TabBar` conventions in the codebase.
- `KnownPricesView` already renders `quote` and already handles `price: null`
  as "no price" — no row-rendering changes needed.

### Column semantics in USD mode (decision: keep-raw)

- **Latest price**: the USD value (or "no price").
- **Date / Age / stale**: unchanged from the raw row — they describe the
  recency of the underlying primary price, which still governs how stale the
  derived USD number is.
- **Source**: unchanged from the raw row (Fetched / Journal / Manual / Base).
  Tells the user how trustworthy the underlying number is. For a row derived
  from two prices (Nim = Journal price × Manual rate) the single label is
  approximate, but keep-raw is the accepted trade-off (simplest, and the base
  number's provenance is the useful signal).

## Out of scope (YAGNI)

- Arbitrary target-currency picker (only USD/base).
- Persisting the toggle choice across sessions.
- Changing the raw view or the Manual-entry tab.
- Re-dating the USD valuation (uses ledger's default latest-price valuation).

## Testing

- **`knownPrices.test.ts`** — `parseBaseBalance` unit tests: well-formed
  lines, unconvertible commodity (commodity ≠ base), blank/garbage lines,
  full-precision quantity, comma-stripping.
- **`service.test.ts`** — `listKnownPricesInBase`: mock the ledger balance
  stdout; assert USD rows carry `quote: base`, unconvertible commodity →
  `price: null`, and `date`/`source` are carried over from the raw rows.
  Also assert only one balance subprocess is issued and the temp file is
  cleaned up.
- No new UI test infra; toggle is plain links.

## Files touched

- `lib/prices/knownPrices.ts` — `BALANCE_BASE_FORMAT`, `parseBaseBalance`.
- `lib/prices/service.ts` — `listKnownPricesInBase`.
- `lib/prices/index.ts` — export if needed.
- `app/prices/page.tsx` — searchParam branch + `baseMode` prop.
- `features/prices/PricesTabs.tsx` — thread `baseMode`.
- `features/prices/KnownPricesView.tsx` — toggle control.
- Tests: `lib/prices/knownPrices.test.ts`, `lib/prices/service.test.ts`.
