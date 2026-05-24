# Report CSV Exports (Design)

Status: approved during brainstorming, awaiting implementation plan.
Date: 2026-05-24.

## Goal

Phase 6's `[~]` CSV export item — ship an "Export CSV" button on every report page that's missing one (balance, monthly, payees, net-worth, debts, reconcile, accounts, portfolio). Each export reflects exactly what the user sees on screen: same currency conversion (active base), same date filter (when present), same row ordering. Pattern mirrors the existing `/transactions` export shipped in Phase 6.

## Scope

In:

- Three small shared helpers (`lib/csv/escape.ts`, `lib/csv/response.ts`, `components/ExportButton/`).
- One serializer per report (`lib/<report>/csv.ts`).
- One Next API route per report (`app/api/<report>/export/route.ts`).
- Page-header `<ExportButton />` mounted on each of the 8 reports.
- Extraction of per-page parse logic into `lib/<report>/parse.ts` for the reports where parsing is non-trivial enough to share between page and route (balance, payees, monthly, net-worth, portfolio).
- Refactor of `lib/transactions/csv.ts` and `features/transactions/Filters.tsx` to use the new shared helpers.
- Vitest coverage at the bar set in Phases 4.1 / 6 (95%+ on `lib/csv/*` and `lib/<report>/csv.ts`).

Out:

- Multi-format export (xlsx, json). CSV only.
- Per-report column customization (the user picks which columns). Fixed shape per report.
- Streaming responses. All reports fit comfortably in memory; `runLedger` already returns full stdout strings.
- Export queue / background jobs.
- Export rate-limiting. Phase 7.
- Per-page export-side date pickers. Pages with date filters forward their existing URL params; pages without ignore them.
- New report types. Each of the 8 exports targets exactly the data already rendered on its page.
- Generic "exportable report" registry / dispatcher. Each report stays self-contained.

## Architecture overview

New modules under `lib/csv/`:

- `lib/csv/escape.ts` — `escapeField(raw: string | null | undefined): string` and `formatRow(cells: Array<string | null | undefined>): string`. Pure functions; RFC 4180 quoting (double-quote a field containing comma, double-quote, CR, or LF; double any embedded `"`).
- `lib/csv/response.ts` — `csvDownload(csv: string, filenameStem: string): Response` returning `text/csv; charset=utf-8` + `Content-Disposition: attachment; filename="<stem>-YYYY-MM-DD.csv"` + `Cache-Control: no-store`.
- `lib/csv/index.ts` — module barrel.

New UI component:

- `components/ExportButton/ExportButton.tsx` — client `<Link>` wrapped in `buttonVariants({ variant: 'outline' })` + `<Download />` icon. Props: `href: string`, optional `label?: string` (default `"Export CSV"`). Single source of truth for the styled export trigger.

New per-report files (×8 reports):

- `lib/<report>/csv.ts` — pure serializer: `(rows, base) => csvString`.
- `lib/<report>/parse.ts` — extracted from the page where parsing is more than a one-liner. The page imports it and renders; the export route imports it and serializes.
- `app/api/<report>/export/route.ts` — Next route: `requireUser()` → resolve base via `getBaseCurrency()` → run the page's `runLedger` call → parse → serialize → return via `csvDownload`.

Touched:

- `lib/transactions/csv.ts` — now imports from `lib/csv/escape.ts` instead of inlining the quote helper. ~10 lines of net deletion.
- `lib/transactions/csv.test.ts` — quoting cases lifted to `lib/csv/escape.test.ts`; this file's tests narrow to the per-report row shape.
- `app/api/transactions/export/route.ts` — uses `csvDownload` helper instead of building the `Response` inline.
- `features/transactions/Filters.tsx` — swaps inline `<Link>` + classnames for `<ExportButton href={exportHref} />`.
- 8 report pages gain `<ExportButton />` in their header row.

Nothing else changes. No new tables, no new env vars, no new server actions.

## Section 1 — Shared helpers

### `lib/csv/escape.ts`

```ts
const NEEDS_QUOTING = /[",\r\n]/;

export const escapeField = (raw: string | null | undefined): string => {
  const s = raw ?? '';
  if (!NEEDS_QUOTING.test(s)) return s;
  return `"${s.replace(/"/g, '""')}"`;
};

export const formatRow = (cells: Array<string | null | undefined>): string =>
  cells.map(escapeField).join(',');
```

Pure, no I/O. The two functions are the same code currently inlined inside `lib/transactions/csv.ts`; lifting them out lets every report's serializer be 5 lines instead of 25.

### `lib/csv/response.ts`

```ts
import 'server-only';

export const csvDownload = (csv: string, filenameStem: string): Response => {
  const today = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filenameStem}-${today}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
};
```

The exact response shape from `app/api/transactions/export/route.ts`, with the variable parts (CSV body + filename stem) parameterized. Every route's return becomes one line.

### `components/ExportButton/ExportButton.tsx`

```tsx
import { Download } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import Link from 'next/link';

type Props = {
  href: string;
  label?: string;
};

const ExportButton = ({ href, label = 'Export CSV' }: Props) => (
  <Link
    href={href}
    className={cn(buttonVariants({ variant: 'outline', size: 'default' }))}
    download
  >
    <Download className="h-4 w-4" />
    {label}
  </Link>
);

export default ExportButton;
```

Direct lift from the existing `features/transactions/Filters.tsx` pattern. The `download` attribute is a same-origin hint; the server's `Content-Disposition: attachment` is what actually forces the browser to save.

## Section 2 — Per-report CSV shapes

Each shape below specifies the column header row + a representative example row. All amounts are pre-converted to the active base currency (the same value the page displays). The `currency` column carries the active base currency code — same on every row of a given export, included so downstream tools know what they're parsing.

**Balance** — `/balance`, `/balance/[from]/[to]` — `balance-YYYY-MM-DD.csv`

```csv
account,amount,currency
Assets:Checking,1234.50,USD
Assets:Brokerage,5000.00,USD
Liabilities:Card,-200.00,USD
Total,6034.50,USD
```

The "Total" row from the report footer is included as `account = "Total"`.

**Cash flow / monthly** — `/monthly` — `cash-flow-YYYY-MM-DD.csv`

```csv
month,income,expenses,net,currency
2023-05,4500.00,3200.00,1300.00,USD
2023-06,4500.00,2800.00,1700.00,USD
```

One row per month for the trailing 36 months (same as the on-screen chart), oldest first. `net = income - expenses`.

**Payees** — `/payees`, `/payees/[from]/[to]` — `payees-YYYY-MM-DD.csv`

```csv
payee,amount,currency
Whole Foods,1234.50,USD
PG&E,200.00,USD
```

One row per payee, sorted descending by amount (matches the chart order).

**Net worth** — `/net-worth` — `net-worth-YYYY-MM-DD.csv`

```csv
month,net_worth,currency
2024-01,12000.00,USD
2024-02,12500.00,USD
```

One row per month in the displayed range, oldest first.

**Debts** — `/debts` — `debts-YYYY-MM-DD.csv`

```csv
account,balance,currency
Liabilities:CreditCard,500.00,USD
Liabilities:Mortgage,250000.00,USD
```

One row per liability account.

**Reconcile** — `/reconcile` — `reconcile-YYYY-MM-DD.csv`

```csv
date,payee,account,amount,currency,status
2024-03-15,Amazon,Expenses:Online,49.99,USD,pending
2024-03-16,Lunch Co,Expenses:Food,15.00,USD,none
```

One row per unreconciled posting. `status` is `pending` (`!`) or `none` (no marker). Cleared (`*`) postings don't appear here — they're already off the reconcile page by definition.

**Accounts** — `/accounts` — `accounts-YYYY-MM-DD.csv`

```csv
account,balance,currency
Assets:Checking:Personal,1234.50,USD
Assets:Brokerage:Vanguard,5000.00,USD
```

One row per leaf account in the tree, flattened paths.

**Portfolio** — `/portfolio` — `portfolio-YYYY-MM-DD.csv`

```csv
account,commodity,quantity,value,currency
Assets:Brokerage:Vanguard,VTSAX,12.345,3500.00,USD
Assets:Brokerage:Vanguard,VBTLX,50.000,1500.00,USD
Assets:Crypto,BTC,0.05000000,4000.00,USD
```

One row per holding. `commodity` is the native commodity code, `quantity` is the native unit count, `value` is the converted-to-base value. Portfolio is the one report where both native and base make sense — a portfolio export with only converted values loses the share/unit data the user cares about.

### Date-filter forwarding

Pages with date filters forward their `start`/`end` URL params verbatim to the export endpoint. Pages without date filters ignore them.

| Report      | Has date filter | Export URL                                      |
| ----------- | --------------- | ----------------------------------------------- |
| balance     | yes (range)     | `/api/balance/export?start=...&end=...`         |
| monthly     | implicit (36mo) | `/api/monthly/export`                           |
| payees      | yes (range)     | `/api/payees/export?start=...&end=...`          |
| net-worth   | yes (range)     | `/api/net-worth/export?start=...&end=...`       |
| debts       | no              | `/api/debts/export`                             |
| reconcile   | no              | `/api/reconcile/export`                         |
| accounts    | no              | `/api/accounts/export`                          |
| portfolio   | no              | `/api/portfolio/export`                         |

## Section 3 — Route shape & data flow

Every export route is the same skeleton (~15 lines).

```ts
// app/api/balance/export/route.ts
import { csvDownload } from '@/lib/csv';
import { balanceRowsToCsv } from '@/lib/balance/csv';
import { parseBalanceRows } from '@/lib/balance/parse';
import { requireUser } from '@/lib/auth/require-user';
import { getBaseCurrency } from '@/lib/settings';
import runLedger from '@/utils/runLedger';
import { NextResponse, type NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest): Promise<Response> {
  await requireUser();
  const base = await getBaseCurrency();
  try {
    const stdout = await runLedger([
      'balance', 'Assets', 'Liabilities',
      '-X', base,
      '--format', '%A|%T\n',
    ]);
    const rows = parseBalanceRows(stdout);
    return csvDownload(balanceRowsToCsv(rows, base), 'balance');
  } catch (e) {
    console.error('balance export failed', e);
    return NextResponse.json({ error: 'Could not export balance' }, { status: 500 });
  }
}
```

Five things load-bearing across all 8 routes:

**1. Parser sharing via extraction.** Each report's existing inline parse logic moves into `lib/<report>/parse.ts`. The page imports it for rendering; the route imports it for serialization. No duplicated parser — both paths consume the same `runLedger` output via the same function.

**2. `runLedger` cache fully reused.** The export route calls `runLedger` with the same arguments the page does. `runLedger`'s mtime-keyed `unstable_cache` (from Phase 4.3) means a warm page-cache → instant export with zero `ledger` invocations.

**3. Date params validated at the route boundary.** Routes for `balance`/`payees`/`net-worth` read `start`/`end` from `req.nextUrl.searchParams`, parse via the existing `parseISODate` helper, and 400 on bad input with `NextResponse.json({ error: 'Invalid date range' }, { status: 400 })`. No `next/navigation` redirect — the user clicked a download link, they get a plain error response.

**4. `force-dynamic`.** Matches the existing `/api/transactions/export` route. Exports always reflect the latest journal state; `runLedger`'s mtime-keyed cache handles cross-request reuse.

**5. Errors return 500 + a generic body.** Server-side `console.error` with the full detail; client sees `{ "error": "Could not export <report>" }`. Matches the existing transactions route's error model. No `ledger` stderr leakage.

### Page-header button mount

Each report page gains an `<ExportButton href={...} />` in its existing header row, to the right of the title + Help tooltip. URL construction is inline (each page knows its own params):

```tsx
// app/balance/page.tsx — page header sketch
<div className="flex items-center justify-between gap-3">
  <div className="flex items-center gap-2">
    <h1 className="...">Balance</h1>
    <Help ... />
  </div>
  <ExportButton href="/api/balance/export" />
</div>

// app/balance/[from]/[to]/page.tsx — header gains the range params
<ExportButton href={`/api/balance/export?start=${from}&end=${to}`} />
```

All 8 new report pages are server components with their date filters expressed as route segments (`[from]/[to]`), so the href is built from the same `from`/`to` props the page already destructures — no `useSearchParams` needed. The existing `/transactions` flow (Phase 6 CSV) is the one client-side outlier; its `Filters.tsx` keeps reading `useSearchParams()` and stays unchanged in that regard.

## Section 4 — Testing

Per the bar established in Phase 4.1 / Phase 6.

**Shared helper tests:**

- `lib/csv/escape.test.ts` — covers: bare string passes through; comma → quoted; double-quote → quoted-and-doubled; LF → quoted; CR → quoted; mixed → quoted; `null` / `undefined` → empty. ~7 tests. The existing `lib/transactions/csv.test.ts` already covers these implicitly via `transactionsToCsv` — lift them into a dedicated suite so future serializers don't have to retest quoting.
- `lib/csv/response.test.ts` — one test: `csvDownload('a,b\n', 'foo')` returns a `Response` with `text/csv; charset=utf-8`, `attachment; filename="foo-<frozen-today>.csv"`, `Cache-Control: no-store`, body `a,b\n`. Mocks `Date` (via `vi.setSystemTime`) so the filename is deterministic.

**Per-report serializer tests** (`lib/<report>/csv.test.ts`, 8 files):

Each file has exactly 3 small tests:
1. **Empty input** → header row only (e.g. `"account,amount,currency\n"`).
2. **Representative row** → exact CSV string match including trailing newline.
3. **Quoting edge case** — at least one cell containing a comma or quote, asserts the output is wrapped correctly. Belt-and-braces against the shared `escapeField` (already tested) but pins down the column ordering against a real fixture.

**Per-report parser tests** (`lib/<report>/parse.test.ts`):

For reports whose parsing is non-trivial enough to extract: `balance`, `payees`, `monthly`, `net-worth`, `portfolio`. Each parse-test file has 2–3 cases against fixture ledger output. The simpler ones (`debts` reuses balance's `account|amount` parser; `accounts` reuses the existing `Accounts.utils.ts` tree-build; `reconcile` already has `Reconcile.utils.ts` tests from Phase 5.2) reuse existing tests or skip if parsing is one line.

**Route tests — skipped.** The existing `/api/transactions/export/route.ts` has no test; same bar here. Manual smoke: implement, click each Export button in the dev server, open the resulting file, eyeball the columns.

**ExportButton — no test.** It's `<Link>` with classes + a download attribute; not enough behavior to test.

**Existing transactions test updates.** `lib/transactions/csv.test.ts` keeps its row-shape tests but loses the quoting cases (moved to `lib/csv/escape.test.ts`). `app/api/transactions/export/route.ts` has no test today and gains none.

**Coverage target:** 95%+ on `lib/csv/*` and the 8 new `lib/<report>/csv.ts` files. No coverage target change elsewhere.

## Section 5 — Migration of existing transactions export

The existing `/transactions` flow gets refactored to use the new shared helpers — no behavior change, just deduplication.

`lib/transactions/csv.ts`:

```ts
// before:
const NEEDS_QUOTING = /[",\r\n]/;
const escapeField = (raw) => { ... };          // 5 lines
const formatRow = (cells) => { ... };          // 2 lines
export const transactionsToCsv = (txs) => { ... }; // uses the locals

// after:
import { formatRow } from '@/lib/csv';
export const transactionsToCsv = (txs) => { ... }; // uses imported formatRow
```

`app/api/transactions/export/route.ts`:

```ts
// before:
return new Response(csv, {
  status: 200,
  headers: {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="transactions-${today}.csv"`,
    'Cache-Control': 'no-store',
  },
});

// after:
return csvDownload(csv, 'transactions');
```

`features/transactions/Filters.tsx` — swap the inline `<Link>` + `buttonVariants` + `<Download>` for `<ExportButton href={exportHref} />`. The `exportHref` computation stays where it is.

`lib/transactions/csv.test.ts` — quoting tests move to `lib/csv/escape.test.ts`; this file's tests now narrow to the per-row shape (date / payee / status / note / uid / account / amount / currency).

## Implementation order

Each step is independently mergeable.

1. **Shared helpers** — `lib/csv/escape.ts`, `lib/csv/response.ts`, `lib/csv/index.ts`. Tests.
2. **ExportButton** — `components/ExportButton/`.
3. **Migrate transactions export** — refactor `lib/transactions/csv.ts`, `app/api/transactions/export/route.ts`, `features/transactions/Filters.tsx`. Move quoting tests. Verify no behavior change.
4. **Balance** — `lib/balance/parse.ts` (extracted from `app/balance/page.tsx`), `lib/balance/csv.ts`, `app/api/balance/export/route.ts`. Mount button in both `app/balance/page.tsx` and `app/balance/[from]/[to]/page.tsx`. Tests.
5. **Payees** — same shape; touch `/payees` and `/payees/[from]/[to]`.
6. **Monthly** — extract parser from `features/monthlyComparison/MonthlyComparison.utils.ts` (already partly parameterized for currency in Phase 6); add csv serializer + route; mount button on `app/monthly/page.tsx` (or wherever the page header lives — likely a sub-component of `MonthlyComparison`).
7. **Net worth** — extract parser, add serializer + route, mount button.
8. **Debts** — reuses balance's parse shape; add csv serializer + route, mount button.
9. **Accounts** — reuses the existing `buildTree` + a flatten helper; add csv serializer + route, mount button.
10. **Reconcile** — reuses the existing `Reconcile.utils.ts#parseRows`; add csv serializer + route, mount button.
11. **Portfolio** — extract parser, add csv serializer + route, mount button.
12. **PLAN.md** — flip the `[~]` Phase 6 CSV export entry to `[x]` with a one-line summary.

## Open questions

None at design time.
