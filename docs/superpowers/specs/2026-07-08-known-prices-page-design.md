# Known Prices Page — Design

Date: 2026-07-08
Status: Approved (pending spec review)

## Goal

Give the user a read-only view of **what price `ledger` currently knows for
each commodity they hold**, plus a per-commodity **price-history** page. This is
distinct from the existing `/prices` page, which is a manual-entry form for
recording rates the price provider does not cover.

## User-facing shape

1. `/prices` becomes **tabbed**:
   - **Known prices** (new, default tab): a table of every held commodity with
     its latest known price, the date of that price, its age/staleness, and the
     source of that price.
   - **Manual entry** (existing `PricesView`, moved under a tab, otherwise
     unchanged).
2. `/prices/[symbol]` (new): a **commodity detail** page — a recharts line chart
   of the price over time on top, a dated price-history table below, and a back
   link to the list.

## Data sources & ledger commands

All ledger calls go through the existing `runLedgerForUser` (or the
request-scoped `runLedger`) helper, which already passes `--file <mainPath>` and
`--price-db <priceDbPath>`. That is what makes the report faithful: `ledger`
merges the journal's own `P`/`@` prices (from `--file`) with the app-generated
price database of fetched + manual prices (from `--price-db`). No new env
handling is required.

### Commands (verified against Ledger 3.4.1)

- **Held commodities:** `ledger commodities` → one symbol per line. Reports only
  commodities that appear in **postings** (a commodity that exists solely as a
  `P` directive is intentionally excluded — the user wants commodities they
  hold).
- **All known prices (for the list):** `ledger pricedb` → reparseable lines of
  the form `P YYYY/MM/DD HH:MM:SS SYMBOL AMOUNT`, e.g.
  `P 2026/06/01 00:00:00 BTC $45000`. One row per price-change day and per
  posting day, across all held commodities.
- **History for one commodity (for the detail page):**
  `ledger prices <symbol>` → `YYYY/MM/DD SYMBOL AMOUNT` rows for that symbol
  only. Because the symbol is fixed by the query, the parser only needs the date
  and amount from each row (no symbol disambiguation).

### Parsing notes

- `pricedb` line: split into `P`, date, time, **symbol**, **amount (rest of
  line)**. A multiword commodity is quoted by ledger (`"MUTUAL FUND"`); the
  parser must be quote-aware for the symbol field. Amount is everything after
  the symbol (may itself carry a trailing commodity, e.g. `45000 GBP`).
- Do **not** use `--prices-format` with `%(commodity)` — in the prices report
  that field resolves to the price's *quote* commodity (`$`), not the priced
  symbol. Parse the positional output instead.
- Dedupe history rows by `(date, amount)`; posting days inject rows that
  duplicate the prevailing price.
- **Latest price per commodity** = the row with the maximum date for that
  symbol.

### Pitfall discovered during design

`ledger`'s report commands walk the **posting stream** — with zero postings,
even `commodities`/`pricedb` return nothing. Ambient `LEDGER_FILE` /
`LEDGER_PRICE_DB` env vars (present in the developer's shell) also silently
merge an unrelated price db into results. Neither affects the app path, which
always passes explicit `--file`/`--price-db`, but local manual testing must
neutralize the environment (`env -i` + `--init-file /dev/null`) to reproduce
app behavior.

## Column semantics (Known prices tab)

| Column | Source | Notes |
|---|---|---|
| Commodity | `ledger commodities` | Every held commodity, incl. base currency. |
| Latest price + quote | `ledger pricedb` latest row | e.g. `$45,000.00`. |
| Date | latest row date | Date of that price. |
| Age / staleness | `today − date` | Badge when older than the stale threshold (default **7 days**). |
| Source | correlation (below) | `fetched` \| `manual` \| `journal` \| `base` \| `none` (gap row). |

### Coverage rules

- **All held commodities appear**, including the base currency (USD).
- The **base currency** row is synthesized: price `1.00 USD`, source `base`,
  never stale (it is the numeraire; ledger reports no price for it).
- A held commodity with **no known price** shows a `no price` row (gap), so the
  user can spot missing coverage.

### Source correlation

`ledger` output does not carry provenance. Determine the source of the latest
`(symbol, date, price)` by cross-referencing:

1. Base currency → `base`.
2. Match against manual prices (`manualRepository.listForUser`) → `manual`.
3. Match against fetched prices (`repository` / `listForQuote`) → `fetched`.
4. Otherwise the price came from a journal `P`/`@` directive → `journal`.

Match on symbol + date (day granularity); price value is a tiebreaker. If a
day has both a manual and fetched entry, prefer the one the price-db generator
would have won with (documented in `regenerateUserPriceDb`).

## Service layer (`lib/prices/service.ts`)

Two new methods, both shelling through `runLedgerForUser`/`runLedger`:

- `listKnownPrices(userId): Promise<KnownPrice[]>`
  - Runs `commodities` + `pricedb`, builds latest-per-symbol, applies coverage
    rules (base row, gap rows), runs source correlation.
  - `KnownPrice = { symbol, price: string | null, quote: string | null,
    date: string | null, ageDays: number | null, stale: boolean,
    source: 'fetched' | 'manual' | 'journal' | 'base' | 'none' }`.
- `listPriceHistory(userId, symbol): Promise<PricePoint[]>`
  - Runs `prices <symbol>`, parses + dedupes.
  - `PricePoint = { date: string, price: number, quote: string }`.

Symbol is URL-encoded in the route (`encodeURIComponent`) to tolerate `$`,
spaces, etc.; the page decodes and validates it against the held-commodity list
before shelling out (guards against arbitrary argument injection into
`ledger`).

## UI

- `features/prices/`:
  - `KnownPricesView.tsx` — the list table (client component; sortable by
    symbol/age is a nice-to-have, not required).
  - `PriceHistoryView.tsx` — recharts `LineChart` + dated table.
  - Wrap existing `PricesView` + new `KnownPricesView` in a tabs component on
    the `/prices` page (reuse the app's existing tabs UI).
- `app/prices/page.tsx` — fetch `listKnownPrices` alongside the existing manual
  data; render tabbed view.
- `app/prices/[symbol]/page.tsx` — `requireUser`, decode + validate symbol,
  fetch `listPriceHistory`, render `PriceHistoryView`.

recharts (3.9.2) is already a dependency.

## Testing

- Parser unit tests: `pricedb` output → rows (incl. quoted multiword symbol,
  amount with trailing commodity, empty output).
- `prices <symbol>` output → history points, dedupe of posting-day duplicates.
- Latest-per-symbol selection (max date).
- Source correlation: each of base / manual / fetched / journal, plus the
  manual-vs-fetched-same-day tiebreak.
- Coverage: gap row for held-but-unpriced commodity; base-currency row
  synthesized.

## Out of scope

- Editing prices from this view (manual entry stays on its tab).
- Normalizing quotes to the base currency (show the raw quote ledger stores).
- Interpolating a continuous daily price series (chart plots known points only).
