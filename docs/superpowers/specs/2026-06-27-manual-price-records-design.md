# Manual price records (`/prices`)

**Status:** Approved design — ready for implementation planning
**Date:** 2026-06-27

## Problem

The app already fetches commodity rates from external providers (CoinGecko/Yahoo)
into a global `commodity_price` table, then regenerates an auto-generated
`price-db.ledger` per user that ledger reads via `--price-db` for `-X`
conversions. There is **no way to enter a rate by hand**.

That gap matters for commodities no provider knows about. The driving example is
**KIRT** ("Kilo IRT" = 1000 IRT), a custom unit the user values themselves. There
is no feed for it, so the only way to make `-X USD` conversions and net-worth
figures work for KIRT holdings is to enter the rate manually.

Because ledger resolves a commodity's value from **dated `P` directives** — for
any report date it uses the most recent price on-or-before that date — a history
of dated manual rates gives true **valuation-over-time**: current net worth uses
the latest rate, while a historical/as-of-date report uses the rate that was in
effect then.

## Goals

- Let a user record manual exchange rates for one or more commodities in a single
  batch, sharing a date (and optional time) and a quote currency.
- Support brand-new commodity symbols (e.g. KIRT) that may not appear in any
  transaction yet.
- Persist rates per-user, build a dated history (never overwrite older dates),
  and merge them into the regenerated `price-db.ledger` so they immediately power
  ledger conversions and survive every provider refresh.
- Surface the history with the ability to delete individual entries.

## Non-goals (YAGNI)

- No inline editing — to change an entry, delete and re-add (re-entering the same
  instant upserts anyway).
- No CSV/bulk file import.
- No per-row quote currency — one shared quote currency per batch.
- No new shared UI primitives — reuse the existing `Combobox`, `input`, `button`.

## Key concepts confirmed with the user

1. **Valuation-over-time is the point.** Each rate is a separate dated row; we
   never overwrite an older date. Ledger picks the right rate per report date.
2. **Ledger `P` directives carry an optional time** (`P DATE [TIME] SYMBOL PRICE
   QUOTE`). The existing fetched-price formatter already emits full timestamps via
   `formatLedgerDateTime` → `YYYY/MM/DD HH:MM:SS` (UTC). Manual rates do the same.
3. **"Later timestamp wins"** for current calculations — which is just how ledger
   resolves prices, applied automatically. No special-case override rule.

## Data model

New **per-user** table `manual_price` (file: `db/schema/manualPrice.ts`,
re-exported from `db/schema/index.ts`).

The existing `commodity_price` table is **global** — `BTC = 62500 USD` is the same
fact for every user, so it has no `userId`. Manual rates are the opposite: a
user's own valuation of their own unit. They get a separate table rather than
adding a nullable `userId` + source flag to the shared one, which keeps the
global table's semantics and unique constraint intact.

```
manual_price
  id        serial    primary key
  userId    text      not null          -- user.id
  symbol    text      not null          -- normalized, uppercase (e.g. KIRT)
  quote     text      not null          -- normalized, uppercase (e.g. USD)
  price     real      not null          -- > 0
  pricedAt  timestamp not null          -- UTC instant the rate applies to
  createdAt timestamp not null
  unique(userId, symbol, quote, pricedAt)
```

- `real` for `price` matches `commodity_price`.
- Uniqueness on the full `pricedAt` (not the day) allows **multiple same-day rates
  at different times** (intraday history); re-entering the **exact same instant**
  upserts (fixes a typo) without touching other rows.
- No separate `pricedDate` column — the calendar day is derivable from `pricedAt`.

### Migration

Add the table to `db/schema/manualPrice.ts`, then:

```
pnpm db:generate   # emits db/migrations/00NN_*.sql
pnpm db:migrate    # applies it
```

Commit the generated SQL.

## Time handling

The form collects a calendar **Date** (required) and an optional **Time**, both
treated as **UTC** (consistent with the codebase's UTC-everywhere price
convention; `formatLedgerDateTime` formats in UTC).

- **Time provided** → `pricedAt` = that exact `YYYY-MM-DDTHH:MM:00Z`.
- **Time omitted** → `pricedAt` = **end-of-day** `YYYY-MM-DDT23:59:59Z`. A
  date-only manual rate is therefore the authoritative price for that whole
  calendar day and beats any intraday fetched rate on the same day — achieving
  "manual wins for that day" purely through ordering, with no special-case logic.

## Merge into `price-db.ledger`

`PriceService.regenerateUserPriceDb(userId)` today emits **only fetched** prices
for the base quote, filtered to commodities the user has transacted. Extend it to
also emit **all of the user's manual prices, always** — including symbols never
transacted (the KIRT case) and quotes other than the base currency.

- Build the file from two row sources: existing filtered fetched rows + **all**
  `manual_price` rows for the user.
- Render both through `formatLedgerDateTime` so output is uniform:
  `P 2026/06/27 23:59:59 KIRT 0.0000033 USD`.
- Ordering: ledger resolves by date/time natively, so no cross-source dedupe is
  needed. In the unlikely event a manual and a fetched row share the **identical**
  timestamp for the same symbol+quote, manual lines are written **after** fetched
  lines so ledger uses the manual one.
- This runs on every manual mutation and on every provider refresh
  (`runOnce` already calls `regenerateUserPriceDb` per user), so manual rates
  survive refreshes automatically.

`renderPriceDb` (in `lib/prices/formatter.ts`) is generalized to accept a list of
already-timestamped rows (symbol, quote, price, instant) rather than only
`CommodityPriceRow`, so manual and fetched rows share one render path.

## Backend (Repository + Service + one-action-per-file)

### `ManualPriceRepository` — `lib/prices/manualRepository.ts`

- `upsertMany(rows)` — batched upsert on conflict
  `(userId, symbol, quote, pricedAt)` set `price`, mirroring
  `CommodityPriceRepository.insert`'s dedupe-then-batched-upsert approach (collapse
  duplicate conflict keys before the statement to avoid Postgres 21000).
- `listForUser(userId)` — all rows, newest `pricedAt` first.
- `deleteForUser(userId, id)` — delete one row scoped to the owner.

### `PriceService` additions — `lib/prices/service.ts`

- `addManualPrices(userId, { date, time?, quote, rows })` — normalize symbols +
  quote via `normalizeCommoditySymbol`, build `pricedAt`, `upsertMany`, then
  `regenerateUserPriceDb`.
- `listManualPrices(userId)` — delegates to the repository.
- `deleteManualPrice(userId, id)` — delete then `regenerateUserPriceDb`.
- Make `listNormalizedSymbolsForUser` **public** (or expose via a thin wrapper) so
  the page can feed the commodity autocomplete.

Wire `ManualPriceRepository` into the `priceService` singleton in
`lib/prices/index.ts` (constructed with `db`), and pass it into `PriceService`'s
deps.

### Server actions — `features/prices/actions/` (one file each)

Both follow the `createTransaction.ts` shape: `requireUser` →
`rateLimit(WRITE, user.id)` (return `RATE_LIMIT_MESSAGE` if blocked) → parse +
Zod-validate → service call → `auditService.record(...)` with
`auditRequestMeta()` → return an action-state object. The page calls
`revalidatePath('/prices')` / relies on `regenerateUserPriceDb`'s cache tag
invalidation.

- `addManualPrices.ts` — audit action `price.add`.
- `deleteManualPrice.ts` — audit action `price.delete`.

### Validation (Zod) — `lib/prices/manualSchema.ts`

- `date`: required, real `YYYY-MM-DD`.
- `time`: optional `HH:MM` (24h).
- `quote`: normalizes to a non-empty symbol.
- `rows`: ≥ 1; each `{ symbol, price }` where `symbol` normalizes non-empty and
  `price` is finite `> 0`.
- Reject any row where `symbol === quote` (can't price a thing in itself).
- Collapse duplicate symbols within one batch (last-wins).

## Frontend

### Route — `app/prices/page.tsx` (thin server shell)

`requireUser` → load `listManualPrices(user.id)`, the commodity list
(`listNormalizedSymbolsForUser`), and the resolved base currency → render the
client view. Mirrors `app/settings/activity/page.tsx`.

### `features/prices/PricesView.tsx` (client component)

**Batch add form** (`useActionState` + `addManualPrices` action):
- Shared **Date** input (`type="date"`, default today).
- Shared **Time** input (`type="time"`, optional) — applies to all rows.
- Shared **Quote currency** — `Combobox` over the commodity list,
  `allowFreeText`, default = base currency.
- A dynamic list of **rows**, each: **Commodity** `Combobox`
  (`allowFreeText` so KIRT works) + **Rate** number input. Add-row / remove-row
  buttons. At least one row.
- The form serializes `{ date, time, quote, rows }` to a JSON `draft` field
  (matching the transactions form's `draft` convention).

**History table:**
- The user's manual rates, newest first: date (+ time when not the end-of-day
  default), symbol, rate, quote, and a **delete** button per row
  (`deleteManualPrice` action).

### Navigation — `components/nav/config.ts`

Add a "Prices" nav item (`href: '/prices'`, lucide `TrendingUp`, `match: 'exact'`)
in a suitable section, rendered by `components/Sidebar/AppSidebar.tsx`.

## Testing

- **Repository:** `upsertMany` inserts and upserts on the
  `(userId, symbol, quote, pricedAt)` key; `listForUser` ordering and per-user
  scoping; `deleteForUser` only deletes the owner's row.
- **Schema:** rejects bad dates/times, non-positive prices, `symbol === quote`;
  normalizes `$`→`USD` and uppercases; collapses duplicate symbols.
- **Service:**
  - `addManualPrices` normalizes, upserts, and regenerates.
  - Omitted time → `23:59:59Z`; provided time → exact instant.
  - **Regeneration emits a never-transacted manual symbol** (KIRT) into
    `price-db.ledger`.
  - **Same-day manual rate beats a fetched rate** via end-of-day ordering;
    explicit earlier time orders correctly.
  - `deleteManualPrice` removes the row and regenerates.
- **Action:** requires a user, is rate-limited, rejects malformed payloads, and
  writes an audit record.
- **Component/integration:** batch form submits multiple rows; history renders and
  delete works.

## File summary

| Concern | Path |
|---|---|
| Table | `db/schema/manualPrice.ts` (+ `db/schema/index.ts`) |
| Migration | `db/migrations/00NN_*.sql` |
| Repository | `lib/prices/manualRepository.ts` |
| Service methods | `lib/prices/service.ts` |
| Render generalization | `lib/prices/formatter.ts` |
| DI wiring | `lib/prices/index.ts` |
| Validation | `lib/prices/manualSchema.ts` |
| Actions | `features/prices/actions/addManualPrices.ts`, `deleteManualPrice.ts` |
| Page shell | `app/prices/page.tsx` |
| View | `features/prices/PricesView.tsx` (+ `features/prices/index.ts`) |
| Nav | `components/nav/config.ts` |
