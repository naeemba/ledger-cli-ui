# Report CSV Exports Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an Export CSV button to all 8 report pages that don't currently have one (balance, monthly, payees, net-worth, debts, reconcile, accounts, portfolio), reusing the established pattern from the Phase 6 transactions export.

**Architecture:** Three shared helpers (`lib/csv/escape.ts`, `lib/csv/response.ts`, `components/ExportButton/`) plus a per-report serializer + Next API route + page-header button mount. Per-report parse logic gets extracted into `lib/<report>/parse.ts` so the page and the export route consume the same `runLedger` output through the same function.

**Tech Stack:** TypeScript · Next.js 16 App Router · React Server Components · vitest · shadcn/ui (`Button`, `buttonVariants`) · lucide-react (`Download` icon).

**Reference spec:** `docs/superpowers/specs/2026-05-24-report-csv-exports-design.md`.

---

## File Structure

**Created:**

- `lib/csv/escape.ts` — `escapeField`, `formatRow` pure helpers.
- `lib/csv/escape.test.ts`
- `lib/csv/response.ts` — `csvDownload(csv, filenameStem) -> Response`.
- `lib/csv/response.test.ts`
- `lib/csv/index.ts` — barrel.
- `components/ExportButton/ExportButton.tsx` — client `<Link>`-as-button with download attribute.
- `components/ExportButton/index.ts`
- `lib/balance/parse.ts` + `lib/balance/parse.test.ts` + `lib/balance/csv.ts` + `lib/balance/csv.test.ts`
- `app/api/balance/export/route.ts`
- `lib/payees/parse.ts` + `lib/payees/parse.test.ts` + `lib/payees/csv.ts` + `lib/payees/csv.test.ts`
- `app/api/payees/export/route.ts`
- `lib/monthly/csv.ts` + `lib/monthly/csv.test.ts` (parser already extracted as `features/monthlyComparison/MonthlyComparison.utils.ts#getCashFlow`)
- `app/api/monthly/export/route.ts`
- `lib/netWorth/parse.ts` + `lib/netWorth/parse.test.ts` + `lib/netWorth/csv.ts` + `lib/netWorth/csv.test.ts`
- `app/api/net-worth/export/route.ts`
- `lib/debts/csv.ts` + `lib/debts/csv.test.ts` (parser shares shape with balance — call balance parser)
- `app/api/debts/export/route.ts`
- `lib/accounts/csv.ts` + `lib/accounts/csv.test.ts`
- `app/api/accounts/export/route.ts`
- `lib/reconcile/csv.ts` + `lib/reconcile/csv.test.ts` (parser already extracted as `features/reconcile/Reconcile.utils.ts`)
- `app/api/reconcile/export/route.ts`
- `lib/portfolio/csv.ts` + `lib/portfolio/csv.test.ts` (parser already at `features/portfolio/parsePortfolio.ts`)
- `app/api/portfolio/export/route.ts`

**Modified:**

- `lib/transactions/csv.ts` — uses `formatRow` from `@/lib/csv` instead of inlining quoting.
- `lib/transactions/csv.test.ts` — quoting cases moved to `lib/csv/escape.test.ts`; remaining tests narrow to row shape.
- `app/api/transactions/export/route.ts` — uses `csvDownload` helper.
- `features/transactions/Filters.tsx` — swaps inline `<Link>` for `<ExportButton href={exportHref} />`.
- `app/balance/page.tsx`, `app/balance/[from]/[to]/page.tsx` — uses extracted `parseBalanceRows`; mounts button.
- `features/payees/Payees.tsx` — uses extracted `parsePayeesRows`; mounts button.
- `features/monthlyComparison/MonthlyComparison.tsx` — mounts button.
- `features/netWorth/NetWorth.tsx` — uses extracted `parseNetWorthRows`; mounts button.
- `app/debts/page.tsx` — uses extracted balance parser; mounts button.
- `features/accounts/Accounts.tsx` — mounts button.
- `features/reconcile/Reconcile.tsx` — mounts button.
- `features/portfolio/Portfolio.tsx` — mounts button.
- `PLAN.md` — tick off Phase 6 CSV export.

---

## Task 1: Shared `lib/csv/` helpers

**Files:**
- Create: `lib/csv/escape.ts`, `lib/csv/escape.test.ts`
- Create: `lib/csv/response.ts`, `lib/csv/response.test.ts`
- Create: `lib/csv/index.ts`

- [ ] **Step 1: Write the failing escape test**

Create `lib/csv/escape.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { escapeField, formatRow } from './escape';

describe('escapeField', () => {
  it('passes through plain ascii', () => {
    expect(escapeField('USD')).toBe('USD');
  });
  it('returns empty string for null and undefined', () => {
    expect(escapeField(null)).toBe('');
    expect(escapeField(undefined)).toBe('');
  });
  it('quotes a field containing a comma', () => {
    expect(escapeField('Smith, John')).toBe('"Smith, John"');
  });
  it('quotes and doubles a field containing a double-quote', () => {
    expect(escapeField('say "hi"')).toBe('"say ""hi"""');
  });
  it('quotes a field containing LF', () => {
    expect(escapeField('line1\nline2')).toBe('"line1\nline2"');
  });
  it('quotes a field containing CR', () => {
    expect(escapeField('line1\rline2')).toBe('"line1\rline2"');
  });
});

describe('formatRow', () => {
  it('joins escaped fields with commas', () => {
    expect(formatRow(['a', 'b', 'c'])).toBe('a,b,c');
  });
  it('escapes individual fields', () => {
    expect(formatRow(['a,b', 'c"d', null])).toBe('"a,b","c""d",');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test lib/csv/escape.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the escape module**

Create `lib/csv/escape.ts`:

```ts
const NEEDS_QUOTING = /[",\r\n]/;

/** RFC 4180 quoting. Wraps the field in double quotes when it contains a
 * comma, double-quote, CR, or LF; doubles any embedded double-quotes. */
export const escapeField = (raw: string | null | undefined): string => {
  const s = raw ?? '';
  if (!NEEDS_QUOTING.test(s)) return s;
  return `"${s.replace(/"/g, '""')}"`;
};

export const formatRow = (
  cells: Array<string | null | undefined>
): string => cells.map(escapeField).join(',');
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test lib/csv/escape.test.ts`
Expected: all 8 tests PASS.

- [ ] **Step 5: Write the failing response test**

Create `lib/csv/response.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { csvDownload } from './response';

describe('csvDownload', () => {
  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-24T12:00:00Z'));
  });
  afterAll(() => {
    vi.useRealTimers();
  });

  it('returns a 200 Response with the CSV body and date-stamped attachment headers', async () => {
    const res = csvDownload('a,b\n1,2\n', 'foo');
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/csv; charset=utf-8');
    expect(res.headers.get('Content-Disposition')).toBe(
      'attachment; filename="foo-2026-05-24.csv"'
    );
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(await res.text()).toBe('a,b\n1,2\n');
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `pnpm test lib/csv/response.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 7: Write the response module**

Create `lib/csv/response.ts`:

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

- [ ] **Step 8: Run test to verify it passes**

Run: `pnpm test lib/csv/response.test.ts`
Expected: 1 test PASS.

- [ ] **Step 9: Write the barrel**

Create `lib/csv/index.ts`:

```ts
export { escapeField, formatRow } from './escape';
export { csvDownload } from './response';
```

- [ ] **Step 10: Type-check + commit**

Run: `pnpm type-check`
Expected: PASS.

```bash
git add lib/csv/
git commit -m "feat(csv): shared escape and download response helpers"
```

---

## Task 2: `ExportButton` component

**Files:**
- Create: `components/ExportButton/ExportButton.tsx`, `components/ExportButton/index.ts`

- [ ] **Step 1: Write the component**

Create `components/ExportButton/ExportButton.tsx`:

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

Create `components/ExportButton/index.ts`:

```ts
export { default } from './ExportButton';
```

- [ ] **Step 2: Type-check + commit**

Run: `pnpm type-check`
Expected: PASS.

```bash
git add components/ExportButton/
git commit -m "feat(csv): shared export csv button component"
```

(No unit test — it's a `<Link>` with classes + a download attribute; behavior is the underlying primitives, which are already tested upstream. Manual smoke happens in Task 3.)

---

## Task 3: Migrate `/transactions` export to shared helpers

**Files:**
- Modify: `lib/transactions/csv.ts`
- Modify: `lib/transactions/csv.test.ts`
- Modify: `app/api/transactions/export/route.ts`
- Modify: `features/transactions/Filters.tsx`

- [ ] **Step 1: Update `lib/transactions/csv.ts`**

Replace the file contents with:

```ts
import { formatRow } from '@/lib/csv';
import type { Transaction } from '@/lib/journal/parser';

// One row per posting (long format) is the most useful shape for downstream
// analysis tools — spreadsheet pivots, pandas DataFrames, etc. Transaction-
// level metadata (date, payee, status, note) is repeated on each row.
const COLUMNS = [
  'date',
  'payee',
  'status',
  'note',
  'uid',
  'account',
  'amount',
  'currency',
] as const;

/**
 * Serialize transactions to CSV (RFC 4180). One row per posting; header row
 * first. Rows are emitted in input order — callers sort beforehand if a
 * particular order is desired.
 */
export const transactionsToCsv = (txs: Transaction[]): string => {
  const lines = [COLUMNS.join(',')];
  for (const t of txs) {
    for (const p of t.postings) {
      lines.push(
        formatRow([
          t.date,
          t.payee,
          t.status,
          t.note,
          t.uid,
          p.account,
          p.amount,
          p.currency,
        ])
      );
    }
  }
  return lines.join('\n') + '\n';
};
```

- [ ] **Step 2: Trim `lib/transactions/csv.test.ts`**

The existing file tests quoting behavior implicitly through `transactionsToCsv`. With quoting moved to `lib/csv/escape.test.ts`, this file should retain ONLY tests asserting the row-shape contract (column order, header, multiple postings per transaction).

Read the existing file at `/Users/sharp/workspace/personal/ledger-cli-ui/lib/transactions/csv.test.ts`. Identify tests that exclusively assert escape behavior on individual fields (e.g. `it('quotes commas', () => ...)`) — those can be deleted because `lib/csv/escape.test.ts` covers them at the underlying primitive. Keep tests that assert: header row present, column order, multiple postings expand to multiple rows, status/note/uid fields appear in their slots.

If any borderline test uses an embedded comma in the row data, leave it — it serves as integration coverage.

- [ ] **Step 3: Update `app/api/transactions/export/route.ts`**

Locate the `return new Response(csv, { ... })` block and replace with `csvDownload`. Final file:

```ts
import {
  applyTransactionFilters,
  type TransactionFilters,
} from '@/features/transactions/applyTransactionFilters';
import { requireUser } from '@/lib/auth/require-user';
import { csvDownload } from '@/lib/csv';
import { journalService } from '@/lib/journal';
import { transactionsToCsv } from '@/lib/transactions/csv';
import { type NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<Response> {
  const user = await requireUser();
  const sp = req.nextUrl.searchParams;
  const filters: TransactionFilters = {
    start: sp.get('start') ?? undefined,
    end: sp.get('end') ?? undefined,
    account: sp.get('account') ?? undefined,
    payee: sp.get('payee') ?? undefined,
    q: sp.get('q') ?? undefined,
  };

  try {
    const { transactions } = await journalService.listTransactions(user.id);
    const filtered = applyTransactionFilters(transactions, filters).sort(
      (a, b) => b.date.localeCompare(a.date)
    );
    return csvDownload(transactionsToCsv(filtered), 'transactions');
  } catch (e) {
    console.error('csv export failed', e);
    return NextResponse.json(
      { error: 'Could not export transactions' },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 4: Update `features/transactions/Filters.tsx`**

Find the existing `<Link href={exportHref} ...>Export CSV</Link>` block (currently around line 113-124 of the file). Replace with:

```tsx
<ExportButton href={exportHref} />
```

Add `import ExportButton from '@/components/ExportButton';` at the top alphabetically with the other component imports. Remove now-unused imports: `Download` from `lucide-react` and `Link` if it's only used by this block (keep `Link` if other code in the file uses it), `cn` from `@/lib/utils` if unused, `buttonVariants` from `@/components/ui/button` if unused.

- [ ] **Step 5: Run the full suite**

Run: `pnpm type-check && pnpm lint && pnpm test`
Expected: all PASS. The transactions export should still work byte-identically (filename, headers, body).

- [ ] **Step 6: Commit**

```bash
git add lib/transactions/ app/api/transactions/export/route.ts features/transactions/Filters.tsx
git commit -m "refactor(transactions): use shared csv helpers and ExportButton"
```

---

## Task 4: Balance export

**Files:**
- Create: `lib/balance/parse.ts`, `lib/balance/parse.test.ts`, `lib/balance/csv.ts`, `lib/balance/csv.test.ts`
- Create: `app/api/balance/export/route.ts`
- Modify: `app/balance/page.tsx`, `app/balance/[from]/[to]/page.tsx`

The balance page calls `runLedger(['balance', 'Assets', 'Liabilities', '-X', currency, '--format', '%A|%T\n'])` and renders the `|`-delimited rows in a table. Extract that parse step.

- [ ] **Step 1: Write the failing parse test**

Create `lib/balance/parse.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseBalanceRows } from './parse';

describe('parseBalanceRows', () => {
  it('returns an empty array for empty input', () => {
    expect(parseBalanceRows('')).toEqual([]);
  });

  it('parses one row per non-empty line', () => {
    const stdout = `Assets:Checking|1,234.50
Assets:Brokerage|5,000.00
Liabilities:Card|-200.00
`;
    expect(parseBalanceRows(stdout)).toEqual([
      { account: 'Assets:Checking', amount: '1,234.50' },
      { account: 'Assets:Brokerage', amount: '5,000.00' },
      { account: 'Liabilities:Card', amount: '-200.00' },
    ]);
  });

  it('treats a leading blank account as the Total row', () => {
    const stdout = `Assets:Checking|1,234.50
|6,034.50
`;
    expect(parseBalanceRows(stdout)).toEqual([
      { account: 'Assets:Checking', amount: '1,234.50' },
      { account: 'Total', amount: '6,034.50' },
    ]);
  });

  it('ignores lines without a pipe', () => {
    const stdout = `Assets:Checking|1,234.50
junk-no-pipe
Assets:Brokerage|5,000.00
`;
    expect(parseBalanceRows(stdout)).toEqual([
      { account: 'Assets:Checking', amount: '1,234.50' },
      { account: 'Assets:Brokerage', amount: '5,000.00' },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test lib/balance/parse.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write the parser**

Create `lib/balance/parse.ts`:

```ts
export type BalanceRow = {
  account: string;
  /** Numeric amount as ledger emitted it (e.g. "1,234.50", "-200.00"). */
  amount: string;
};

/**
 * Parse `ledger balance --format '%A|%T\n'` output. Each non-empty line is
 * `<account>|<amount>`. Ledger's footer total comes through as an empty
 * account; we re-label it "Total" so the CSV export carries it explicitly.
 */
export const parseBalanceRows = (stdout: string): BalanceRow[] => {
  const rows: BalanceRow[] = [];
  for (const line of stdout.split('\n')) {
    if (!line.includes('|')) continue;
    const [accountRaw, amountRaw] = line.split('|');
    const account = accountRaw.trim();
    const amount = (amountRaw ?? '').trim();
    if (!amount) continue;
    rows.push({ account: account || 'Total', amount });
  }
  return rows;
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test lib/balance/parse.test.ts`
Expected: 4 PASS.

- [ ] **Step 5: Write the failing csv test**

Create `lib/balance/csv.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { balanceRowsToCsv } from './csv';

describe('balanceRowsToCsv', () => {
  it('emits only the header row for empty input', () => {
    expect(balanceRowsToCsv([], 'USD')).toBe('account,amount,currency\n');
  });

  it('emits one row per balance row', () => {
    expect(
      balanceRowsToCsv(
        [
          { account: 'Assets:Checking', amount: '1234.50' },
          { account: 'Total', amount: '6034.50' },
        ],
        'USD'
      )
    ).toBe(
      'account,amount,currency\nAssets:Checking,1234.50,USD\nTotal,6034.50,USD\n'
    );
  });

  it('quotes commas in the amount field', () => {
    expect(
      balanceRowsToCsv([{ account: 'Assets:X', amount: '1,234.50' }], 'USD')
    ).toBe('account,amount,currency\nAssets:X,"1,234.50",USD\n');
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `pnpm test lib/balance/csv.test.ts`
Expected: FAIL.

- [ ] **Step 7: Write the serializer**

Create `lib/balance/csv.ts`:

```ts
import { formatRow } from '@/lib/csv';
import type { BalanceRow } from './parse';

const COLUMNS = ['account', 'amount', 'currency'] as const;

export const balanceRowsToCsv = (
  rows: BalanceRow[],
  currency: string
): string => {
  const lines = [COLUMNS.join(',')];
  for (const r of rows) {
    lines.push(formatRow([r.account, r.amount, currency]));
  }
  return lines.join('\n') + '\n';
};
```

- [ ] **Step 8: Run test to verify it passes**

Run: `pnpm test lib/balance/csv.test.ts`
Expected: 3 PASS.

- [ ] **Step 9: Write the route**

Create `app/api/balance/export/route.ts`:

```ts
import { balanceRowsToCsv } from '@/lib/balance/csv';
import { parseBalanceRows } from '@/lib/balance/parse';
import { requireUser } from '@/lib/auth/require-user';
import { csvDownload } from '@/lib/csv';
import { getBaseCurrency } from '@/lib/settings';
import { parseISODate, toISODate } from '@/utils/date';
import runLedger from '@/utils/runLedger';
import { type NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const buildArgs = (currency: string, start?: string, end?: string): string[] => {
  const args = ['balance', 'Assets', 'Liabilities', '-X', currency, '--format', '%A|%T\n'];
  if (start) args.push('-b', toISODate(parseISODate(start)));
  if (end) args.push('-e', toISODate(parseISODate(end)));
  return args;
};

export async function GET(req: NextRequest): Promise<Response> {
  await requireUser();
  const sp = req.nextUrl.searchParams;
  const start = sp.get('start') ?? undefined;
  const end = sp.get('end') ?? undefined;

  try {
    const base = await getBaseCurrency();
    const stdout = await runLedger(buildArgs(base, start, end));
    return csvDownload(balanceRowsToCsv(parseBalanceRows(stdout), base), 'balance');
  } catch (e) {
    if (e instanceof RangeError) {
      return NextResponse.json({ error: 'Invalid date range' }, { status: 400 });
    }
    console.error('balance export failed', e);
    return NextResponse.json({ error: 'Could not export balance' }, { status: 500 });
  }
}
```

(If `parseISODate` throws something other than `RangeError`, adjust the catch arm to match — check `utils/date.ts` for the exact error shape.)

- [ ] **Step 10: Update `app/balance/page.tsx`**

Open the file. Replace the inline parsing block (`const result = stdout.split('\n').filter(Boolean); const total = ...`) with:

```ts
import ExportButton from '@/components/ExportButton';
import { parseBalanceRows } from '@/lib/balance/parse';
// ... existing imports
// ... inside the component, after const stdout = await runLedger(...):
const rows = parseBalanceRows(stdout);
const total = rows.find((r) => r.account === 'Total')?.amount ?? '';
const result = rows.filter((r) => r.account !== 'Total').map((r) => `${r.account}|${r.amount}`);
```

(The `result` array kept in its existing pipe-delimited shape so the rest of the JSX rendering loop doesn't change. If a later refactor wants to consume `rows` directly that's fine, but it's out of scope here.)

Add the export button next to the title — find the existing header block and add it to the right side:

```tsx
<div className="flex flex-wrap items-end justify-between gap-3">
  <div>
    <div className="flex items-center gap-2">
      <h1 className="text-2xl font-semibold tracking-tight">Balance</h1>
      <Help label="About the balance report">...</Help>
    </div>
  </div>
  <ExportButton href="/api/balance/export" />
</div>
```

- [ ] **Step 11: Update `app/balance/[from]/[to]/page.tsx`**

Apply the same parser swap and add the button with date params forwarded:

```tsx
<ExportButton href={`/api/balance/export?start=${from}&end=${to}`} />
```

(`from` and `to` are the route segment params the page already destructures.)

- [ ] **Step 12: Smoke test**

Run: `pnpm type-check && pnpm lint && pnpm test`
Expected: PASS.

Optionally: `pnpm dev`, visit `/balance`, click Export CSV, verify the file downloads and opens cleanly in a spreadsheet.

- [ ] **Step 13: Commit**

```bash
git add lib/balance/ app/api/balance/export/route.ts app/balance/page.tsx app/balance/[from]/[to]/page.tsx
git commit -m "feat(balance): csv export endpoint and button"
```

---

## Task 5: Payees export

**Files:**
- Create: `lib/payees/parse.ts`, `lib/payees/parse.test.ts`, `lib/payees/csv.ts`, `lib/payees/csv.test.ts`
- Create: `app/api/payees/export/route.ts`
- Modify: `features/payees/Payees.tsx`

The payees page calls `runLedger(['reg', '^Expenses', '-b', ..., '-e', ..., '-X', currency, '--format', 'NNN%P|%t\n'])` and aggregates payee → total. Extract aggregation.

- [ ] **Step 1: Write the failing parse test**

Create `lib/payees/parse.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parsePayeeRows } from './parse';

describe('parsePayeeRows', () => {
  it('returns an empty array for empty input', () => {
    expect(parsePayeeRows('')).toEqual([]);
  });

  it('aggregates amounts per payee and sorts descending', () => {
    const stdout = 'NNNAmazon|USD 12.50\nNNNAmazon|USD 7.50\nNNNWhole Foods|USD 100.00\n';
    expect(parsePayeeRows(stdout)).toEqual([
      { payee: 'Whole Foods', total: 100 },
      { payee: 'Amazon', total: 20 },
    ]);
  });

  it('skips zero and negative totals', () => {
    const stdout = 'NNNRefund|USD -5.00\nNNNWhole Foods|USD 100.00\n';
    expect(parsePayeeRows(stdout)).toEqual([
      { payee: 'Whole Foods', total: 100 },
    ]);
  });

  it('handles amounts with comma thousand separators and bare numbers', () => {
    const stdout = 'NNNX|1,234.50\nNNNY|USD 7\n';
    expect(parsePayeeRows(stdout)).toEqual([
      { payee: 'X', total: 1234.5 },
      { payee: 'Y', total: 7 },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test lib/payees/parse.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write the parser**

Create `lib/payees/parse.ts`:

```ts
export type PayeeRow = { payee: string; total: number };

const parseAmount = (raw: string): number => {
  if (!raw) return 0;
  const parts = raw.trim().split(/\s+/);
  const numericPart = parts.length > 1 ? parts[1] : parts[0];
  return Number(numericPart.replaceAll(',', '')) || 0;
};

/**
 * Parse `ledger reg ^Expenses ... --format 'NNN%P|%t\n'` output: each
 * `NNN`-separated chunk is `<payee>|<amount>`. Aggregate per payee, drop
 * zero/negative rows, sort descending — matches what the payees page does
 * inline (kept identical for byte-for-byte parity).
 */
export const parsePayeeRows = (stdout: string): PayeeRow[] => {
  const totals = new Map<string, number>();
  for (const line of stdout.split('NNN')) {
    const [payee, amount] = line.split('|').map((s) => s.trim());
    if (!payee || !amount) continue;
    totals.set(payee, (totals.get(payee) ?? 0) + parseAmount(amount));
  }
  return Array.from(totals.entries())
    .map(([payee, total]) => ({ payee, total }))
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total);
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test lib/payees/parse.test.ts`
Expected: 4 PASS.

- [ ] **Step 5: Write the failing csv test**

Create `lib/payees/csv.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { payeeRowsToCsv } from './csv';

describe('payeeRowsToCsv', () => {
  it('emits only the header row for empty input', () => {
    expect(payeeRowsToCsv([], 'USD')).toBe('payee,amount,currency\n');
  });

  it('emits one row per payee, two decimal places', () => {
    expect(
      payeeRowsToCsv(
        [
          { payee: 'Whole Foods', total: 100 },
          { payee: 'Amazon', total: 20.5 },
        ],
        'USD'
      )
    ).toBe(
      'payee,amount,currency\nWhole Foods,100.00,USD\nAmazon,20.50,USD\n'
    );
  });

  it('quotes a payee name containing a comma', () => {
    expect(
      payeeRowsToCsv([{ payee: 'Smith, John', total: 10 }], 'USD')
    ).toBe('payee,amount,currency\n"Smith, John",10.00,USD\n');
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `pnpm test lib/payees/csv.test.ts`
Expected: FAIL.

- [ ] **Step 7: Write the serializer**

Create `lib/payees/csv.ts`:

```ts
import { formatRow } from '@/lib/csv';
import type { PayeeRow } from './parse';

const COLUMNS = ['payee', 'amount', 'currency'] as const;

const formatNumber = (n: number) => n.toFixed(2);

export const payeeRowsToCsv = (rows: PayeeRow[], currency: string): string => {
  const lines = [COLUMNS.join(',')];
  for (const r of rows) {
    lines.push(formatRow([r.payee, formatNumber(r.total), currency]));
  }
  return lines.join('\n') + '\n';
};
```

- [ ] **Step 8: Run test to verify it passes**

Run: `pnpm test lib/payees/csv.test.ts`
Expected: 3 PASS.

- [ ] **Step 9: Write the route**

Create `app/api/payees/export/route.ts`:

```ts
import { requireUser } from '@/lib/auth/require-user';
import { csvDownload } from '@/lib/csv';
import { parsePayeeRows } from '@/lib/payees/parse';
import { payeeRowsToCsv } from '@/lib/payees/csv';
import { getBaseCurrency } from '@/lib/settings';
import { parseISODate, toISODate } from '@/utils/date';
import runLedger from '@/utils/runLedger';
import { type NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<Response> {
  await requireUser();
  const sp = req.nextUrl.searchParams;
  const start = sp.get('start');
  const end = sp.get('end');

  try {
    const base = await getBaseCurrency();
    const args = [
      'reg',
      '^Expenses',
      '-X', base,
      '--format', 'NNN%P|%t\n',
    ];
    if (start) args.splice(2, 0, '-b', toISODate(parseISODate(start)));
    if (end) args.splice(2, 0, '-e', toISODate(parseISODate(end)));
    const stdout = await runLedger(args);
    return csvDownload(payeeRowsToCsv(parsePayeeRows(stdout), base), 'payees');
  } catch (e) {
    if (e instanceof RangeError) {
      return NextResponse.json({ error: 'Invalid date range' }, { status: 400 });
    }
    console.error('payees export failed', e);
    return NextResponse.json({ error: 'Could not export payees' }, { status: 500 });
  }
}
```

- [ ] **Step 10: Update `features/payees/Payees.tsx`**

Replace the inline aggregation (`const totals = new Map(); ... const sorted = ...`) with:

```tsx
import { parsePayeeRows } from '@/lib/payees/parse';
import ExportButton from '@/components/ExportButton';
// ...
const sorted = parsePayeeRows(stdout).slice(0, TOP_N);
const grandTotal = sorted.reduce((acc, r) => acc + r.total, 0);
```

(The page truncates to `TOP_N`; the CSV export does not — exports give the user everything.)

Add the export button in the page header. Find the existing right-side block (where the "Top N total" lives) and ADD the button at the very top of that flex row, or place it next to the title on the left side. Following the convention chosen, drop it to the right of the Help tooltip in the title cluster:

```tsx
<div>
  <div className="flex items-center gap-2">
    <h1 className="text-2xl font-semibold tracking-tight">Payees</h1>
    <Help label="About payees">...</Help>
    <ExportButton href={`/api/payees/export?start=${fromParam}&end=${toParam}`} />
  </div>
  ...
</div>
```

- [ ] **Step 11: Smoke test + commit**

Run: `pnpm type-check && pnpm lint && pnpm test`
Expected: PASS.

```bash
git add lib/payees/ app/api/payees/export/route.ts features/payees/Payees.tsx
git commit -m "feat(payees): csv export endpoint and button"
```

---

## Task 6: Monthly (cash flow) export

**Files:**
- Create: `lib/monthly/csv.ts`, `lib/monthly/csv.test.ts`
- Create: `app/api/monthly/export/route.ts`
- Modify: `features/monthlyComparison/MonthlyComparison.tsx`

The parse logic already lives in `features/monthlyComparison/MonthlyComparison.utils.ts` as `getCashFlow(currency): Promise<CashFlowRow[]>`. The export route imports it directly.

- [ ] **Step 1: Write the failing csv test**

Create `lib/monthly/csv.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { cashFlowRowsToCsv } from './csv';

describe('cashFlowRowsToCsv', () => {
  it('emits only the header row for empty input', () => {
    expect(cashFlowRowsToCsv([], 'USD')).toBe(
      'month,income,expenses,net,currency\n'
    );
  });

  it('emits one row per month in input order with net = income - expenses', () => {
    expect(
      cashFlowRowsToCsv(
        [
          { date: new Date('2026-01-01T00:00:00Z'), income: 4500, expenses: 3200 },
          { date: new Date('2026-02-01T00:00:00Z'), income: 4500, expenses: 2800 },
        ],
        'USD'
      )
    ).toBe(
      'month,income,expenses,net,currency\n2026-01,4500.00,3200.00,1300.00,USD\n2026-02,4500.00,2800.00,1700.00,USD\n'
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test lib/monthly/csv.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write the serializer**

Create `lib/monthly/csv.ts`:

```ts
import { formatRow } from '@/lib/csv';
import type { CashFlowRow } from '@/features/monthlyComparison/MonthlyComparison.utils';

const COLUMNS = ['month', 'income', 'expenses', 'net', 'currency'] as const;

const monthKey = (d: Date): string =>
  `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;

const fmt = (n: number) => n.toFixed(2);

export const cashFlowRowsToCsv = (
  rows: CashFlowRow[],
  currency: string
): string => {
  const lines = [COLUMNS.join(',')];
  for (const r of rows) {
    lines.push(
      formatRow([
        monthKey(r.date),
        fmt(r.income),
        fmt(r.expenses),
        fmt(r.income - r.expenses),
        currency,
      ])
    );
  }
  return lines.join('\n') + '\n';
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test lib/monthly/csv.test.ts`
Expected: 2 PASS.

- [ ] **Step 5: Write the route**

Create `app/api/monthly/export/route.ts`:

```ts
import { requireUser } from '@/lib/auth/require-user';
import { csvDownload } from '@/lib/csv';
import { cashFlowRowsToCsv } from '@/lib/monthly/csv';
import { getBaseCurrency } from '@/lib/settings';
import { getCashFlow } from '@/features/monthlyComparison/MonthlyComparison.utils';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  await requireUser();
  try {
    const base = await getBaseCurrency();
    const rows = await getCashFlow(base);
    return csvDownload(cashFlowRowsToCsv(rows, base), 'cash-flow');
  } catch (e) {
    console.error('monthly export failed', e);
    return NextResponse.json({ error: 'Could not export cash flow' }, { status: 500 });
  }
}
```

- [ ] **Step 6: Mount the button**

Edit `features/monthlyComparison/MonthlyComparison.tsx`. Add the import and place the button in the page header alongside the title — match where Help lives:

```tsx
import ExportButton from '@/components/ExportButton';
// ...
<div className="flex items-center gap-2">
  <h1 ...>...</h1>
  <Help ...>...</Help>
  <ExportButton href="/api/monthly/export" />
</div>
```

- [ ] **Step 7: Smoke test + commit**

Run: `pnpm type-check && pnpm lint && pnpm test`
Expected: PASS.

```bash
git add lib/monthly/ app/api/monthly/export/route.ts features/monthlyComparison/MonthlyComparison.tsx
git commit -m "feat(monthly): csv export endpoint and button"
```

---

## Task 7: Net-worth export

**Files:**
- Create: `lib/netWorth/parse.ts`, `lib/netWorth/parse.test.ts`, `lib/netWorth/csv.ts`, `lib/netWorth/csv.test.ts`
- Create: `app/api/net-worth/export/route.ts`
- Modify: `features/netWorth/NetWorth.tsx`

- [ ] **Step 1: Write the failing parse test**

Create `lib/netWorth/parse.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseNetWorthRows } from './parse';

describe('parseNetWorthRows', () => {
  it('returns an empty array for empty input', () => {
    expect(parseNetWorthRows('')).toEqual([]);
  });

  it('parses one row per non-empty NNN-split chunk', () => {
    const stdout = 'NNN2024-01-31|USD 12,000.00\nNNN2024-02-29|USD 12,500.00\n';
    expect(parseNetWorthRows(stdout)).toEqual([
      { date: '2024-01-31', value: 12000 },
      { date: '2024-02-29', value: 12500 },
    ]);
  });

  it('handles bare numeric amounts (no currency prefix)', () => {
    const stdout = 'NNN2024-01-31|12,000.00\n';
    expect(parseNetWorthRows(stdout)).toEqual([
      { date: '2024-01-31', value: 12000 },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test lib/netWorth/parse.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write the parser**

Create `lib/netWorth/parse.ts`:

```ts
export type NetWorthRow = { date: string; value: number };

const parseAmount = (raw: string): number => {
  const parts = raw.trim().split(/\s+/);
  const numericPart = parts.length > 1 ? parts[1] : parts[0];
  return Number(numericPart.replaceAll(',', ''));
};

/**
 * Parse `ledger reg ^Assets ^Liabilities --monthly --format 'NNN%D|%T\n'`
 * output. Each `NNN`-separated chunk is `<YYYY-MM-DD>|<amount>`. The date
 * is ledger's end-of-month timestamp; we preserve it verbatim for the export.
 */
export const parseNetWorthRows = (stdout: string): NetWorthRow[] => {
  const rows: NetWorthRow[] = [];
  for (const line of stdout.split('NNN')) {
    const [date, amount] = line.split('|').map((s) => s?.trim() ?? '');
    if (!date || !amount) continue;
    rows.push({ date, value: parseAmount(amount) });
  }
  return rows;
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test lib/netWorth/parse.test.ts`
Expected: 3 PASS.

- [ ] **Step 5: Write the failing csv test**

Create `lib/netWorth/csv.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { netWorthRowsToCsv } from './csv';

describe('netWorthRowsToCsv', () => {
  it('emits only the header row for empty input', () => {
    expect(netWorthRowsToCsv([], 'USD')).toBe('month,net_worth,currency\n');
  });

  it('emits one row per month using YYYY-MM keys', () => {
    expect(
      netWorthRowsToCsv(
        [
          { date: '2024-01-31', value: 12000 },
          { date: '2024-02-29', value: 12500 },
        ],
        'USD'
      )
    ).toBe(
      'month,net_worth,currency\n2024-01,12000.00,USD\n2024-02,12500.00,USD\n'
    );
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `pnpm test lib/netWorth/csv.test.ts`
Expected: FAIL.

- [ ] **Step 7: Write the serializer**

Create `lib/netWorth/csv.ts`:

```ts
import { formatRow } from '@/lib/csv';
import type { NetWorthRow } from './parse';

const COLUMNS = ['month', 'net_worth', 'currency'] as const;

const fmt = (n: number) => n.toFixed(2);
const monthKey = (date: string) => date.slice(0, 7);

export const netWorthRowsToCsv = (
  rows: NetWorthRow[],
  currency: string
): string => {
  const lines = [COLUMNS.join(',')];
  for (const r of rows) {
    lines.push(formatRow([monthKey(r.date), fmt(r.value), currency]));
  }
  return lines.join('\n') + '\n';
};
```

- [ ] **Step 8: Run test to verify it passes**

Run: `pnpm test lib/netWorth/csv.test.ts`
Expected: 2 PASS.

- [ ] **Step 9: Write the route**

Create `app/api/net-worth/export/route.ts`:

```ts
import { requireUser } from '@/lib/auth/require-user';
import { csvDownload } from '@/lib/csv';
import { parseNetWorthRows } from '@/lib/netWorth/parse';
import { netWorthRowsToCsv } from '@/lib/netWorth/csv';
import { getBaseCurrency } from '@/lib/settings';
import runLedger from '@/utils/runLedger';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  await requireUser();
  try {
    const base = await getBaseCurrency();
    const stdout = await runLedger(
      [
        'reg', '^Assets', '^Liabilities',
        '--monthly',
        '-X', base,
        '--format', 'NNN%D|%T\n',
      ],
      { sortByDate: false }
    );
    return csvDownload(netWorthRowsToCsv(parseNetWorthRows(stdout), base), 'net-worth');
  } catch (e) {
    console.error('net-worth export failed', e);
    return NextResponse.json({ error: 'Could not export net worth' }, { status: 500 });
  }
}
```

- [ ] **Step 10: Update `features/netWorth/NetWorth.tsx`**

Replace the inline `allRows = stdout.split('NNN')...` block with `parseNetWorthRows(stdout)`. Adapt the existing `labels`, `data`, and `latest` derivations to consume `NetWorthRow[]` (use `r.date` / `r.value`).

Add the button to the header:

```tsx
import ExportButton from '@/components/ExportButton';
// ...
<div className="flex items-center gap-2">
  <h1 ...>Net Worth</h1>
  <Help ...>...</Help>
  <ExportButton href="/api/net-worth/export" />
</div>
```

- [ ] **Step 11: Smoke test + commit**

Run: `pnpm type-check && pnpm lint && pnpm test`
Expected: PASS.

```bash
git add lib/netWorth/ app/api/net-worth/export/route.ts features/netWorth/NetWorth.tsx
git commit -m "feat(net-worth): csv export endpoint and button"
```

---

## Task 8: Debts export

**Files:**
- Create: `lib/debts/csv.ts`, `lib/debts/csv.test.ts`
- Create: `app/api/debts/export/route.ts`
- Modify: `app/debts/page.tsx`

Debts uses a different `runLedger` format (`NNN%A|%T`) but the parse shape is `account|amount` — identical to balance after splitting on `NNN`. The csv serializer is also identical to balance's except the header label is `balance` not `amount`.

- [ ] **Step 1: Write the failing csv test**

Create `lib/debts/csv.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { debtsRowsToCsv } from './csv';

describe('debtsRowsToCsv', () => {
  it('emits only the header row for empty input', () => {
    expect(debtsRowsToCsv([], 'USD')).toBe('account,balance,currency\n');
  });

  it('emits one row per debt', () => {
    expect(
      debtsRowsToCsv(
        [
          { account: 'Liabilities:CreditCard', amount: '500.00' },
          { account: 'Liabilities:Mortgage', amount: '250000.00' },
        ],
        'USD'
      )
    ).toBe(
      'account,balance,currency\nLiabilities:CreditCard,500.00,USD\nLiabilities:Mortgage,250000.00,USD\n'
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test lib/debts/csv.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write the serializer**

Create `lib/debts/csv.ts`:

```ts
import { formatRow } from '@/lib/csv';
import type { BalanceRow } from '@/lib/balance/parse';

const COLUMNS = ['account', 'balance', 'currency'] as const;

export const debtsRowsToCsv = (rows: BalanceRow[], currency: string): string => {
  const lines = [COLUMNS.join(',')];
  for (const r of rows) {
    lines.push(formatRow([r.account, r.amount, currency]));
  }
  return lines.join('\n') + '\n';
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test lib/debts/csv.test.ts`
Expected: 2 PASS.

- [ ] **Step 5: Write the route**

Note the debts page uses `'NNN%A|%T'` (no trailing `\n`) and splits on `NNN`. To reuse the balance parser, switch the route to `'%A|%T\n'` so `parseBalanceRows` works as-is.

Create `app/api/debts/export/route.ts`:

```ts
import { requireUser } from '@/lib/auth/require-user';
import { parseBalanceRows } from '@/lib/balance/parse';
import { csvDownload } from '@/lib/csv';
import { debtsRowsToCsv } from '@/lib/debts/csv';
import { getBaseCurrency } from '@/lib/settings';
import runLedger from '@/utils/runLedger';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  await requireUser();
  try {
    const base = await getBaseCurrency();
    const stdout = await runLedger([
      'balance',
      'Assets:Credited',
      '-X', base,
      '--format', '%A|%T\n',
    ]);
    // Drop the parser's "Total" row — the debts page renders it separately and
    // the export keeps per-account rows only.
    const rows = parseBalanceRows(stdout).filter((r) => r.account !== 'Total');
    return csvDownload(debtsRowsToCsv(rows, base), 'debts');
  } catch (e) {
    console.error('debts export failed', e);
    return NextResponse.json({ error: 'Could not export debts' }, { status: 500 });
  }
}
```

- [ ] **Step 6: Mount the button**

Edit `app/debts/page.tsx`. Add the import and place the button in the existing header block (next to Help):

```tsx
import ExportButton from '@/components/ExportButton';
// ...
<div className="flex items-center gap-2">
  <h1 ...>Debts</h1>
  <Help ...>...</Help>
  <ExportButton href="/api/debts/export" />
</div>
```

- [ ] **Step 7: Smoke test + commit**

Run: `pnpm type-check && pnpm lint && pnpm test`
Expected: PASS.

```bash
git add lib/debts/ app/api/debts/export/route.ts app/debts/page.tsx
git commit -m "feat(debts): csv export endpoint and button"
```

---

## Task 9: Accounts export

**Files:**
- Create: `lib/accounts/csv.ts`, `lib/accounts/csv.test.ts`
- Create: `app/api/accounts/export/route.ts`
- Modify: `features/accounts/Accounts.tsx`

Accounts is the one report whose CSV shape (`account, balance, currency`) is richer than what the page renders (account names only). The export runs a separate `ledger balance --flat` call to fetch balances; the CSV joins the two.

The simplest implementation: the export route doesn't need the existing accounts list at all — `ledger balance --flat -X <base>` returns every account with a non-zero balance, which is what we want for the CSV.

- [ ] **Step 1: Write the failing csv test**

Create `lib/accounts/csv.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { accountsRowsToCsv } from './csv';

describe('accountsRowsToCsv', () => {
  it('emits only the header row for empty input', () => {
    expect(accountsRowsToCsv([], 'USD')).toBe('account,balance,currency\n');
  });

  it('emits one row per account', () => {
    expect(
      accountsRowsToCsv(
        [
          { account: 'Assets:Checking', amount: '1234.50' },
          { account: 'Expenses:Food', amount: '420.00' },
        ],
        'USD'
      )
    ).toBe(
      'account,balance,currency\nAssets:Checking,1234.50,USD\nExpenses:Food,420.00,USD\n'
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test lib/accounts/csv.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write the serializer**

Create `lib/accounts/csv.ts`:

```ts
import { formatRow } from '@/lib/csv';
import type { BalanceRow } from '@/lib/balance/parse';

const COLUMNS = ['account', 'balance', 'currency'] as const;

export const accountsRowsToCsv = (
  rows: BalanceRow[],
  currency: string
): string => {
  const lines = [COLUMNS.join(',')];
  for (const r of rows) {
    lines.push(formatRow([r.account, r.amount, currency]));
  }
  return lines.join('\n') + '\n';
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test lib/accounts/csv.test.ts`
Expected: 2 PASS.

- [ ] **Step 5: Write the route**

Create `app/api/accounts/export/route.ts`:

```ts
import { requireUser } from '@/lib/auth/require-user';
import { accountsRowsToCsv } from '@/lib/accounts/csv';
import { parseBalanceRows } from '@/lib/balance/parse';
import { csvDownload } from '@/lib/csv';
import { getBaseCurrency } from '@/lib/settings';
import runLedger from '@/utils/runLedger';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  await requireUser();
  try {
    const base = await getBaseCurrency();
    const stdout = await runLedger([
      'balance',
      '--flat',
      '--no-total',
      '-X', base,
      '--format', '%A|%T\n',
    ]);
    const rows = parseBalanceRows(stdout).filter((r) => r.account !== 'Total');
    return csvDownload(accountsRowsToCsv(rows, base), 'accounts');
  } catch (e) {
    console.error('accounts export failed', e);
    return NextResponse.json({ error: 'Could not export accounts' }, { status: 500 });
  }
}
```

- [ ] **Step 6: Mount the button**

Edit `features/accounts/Accounts.tsx`. Add the import and place the button in the header:

```tsx
import ExportButton from '@/components/ExportButton';
// ...
<div className="flex items-center gap-2">
  <h1 ...>Accounts</h1>
  <Help ...>...</Help>
  <ExportButton href="/api/accounts/export" />
</div>
```

- [ ] **Step 7: Smoke test + commit**

Run: `pnpm type-check && pnpm lint && pnpm test`
Expected: PASS.

```bash
git add lib/accounts/ app/api/accounts/export/route.ts features/accounts/Accounts.tsx
git commit -m "feat(accounts): csv export endpoint and button"
```

---

## Task 10: Reconcile export

**Files:**
- Create: `lib/reconcile/csv.ts`, `lib/reconcile/csv.test.ts`
- Create: `app/api/reconcile/export/route.ts`
- Modify: `features/reconcile/Reconcile.tsx`

The parser already exists at `features/reconcile/Reconcile.utils.ts` as `parseReconcileRows(stdout, now?)` returning `ReconcileRow[]`. The csv serializer adds a `status` column derived from the journal — but `ReconcileRow` doesn't carry status today. The reconcile page renders ALL uncleared rows (status is implicitly `none` or `pending`). For the export, leave status blank for now since the existing parser doesn't expose it, and update the spec retroactively if more granularity is needed.

Actually re-reading the spec: it says `status` is `pending` or `none`. The existing `ledger reg --uncleared` output doesn't directly carry status — we'd need a format-string change. For v1, omit `status` from the export and document the deviation.

- [ ] **Step 1: Write the failing csv test**

Create `lib/reconcile/csv.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { reconcileRowsToCsv } from './csv';

describe('reconcileRowsToCsv', () => {
  it('emits only the header row for empty input', () => {
    expect(reconcileRowsToCsv([], 'USD')).toBe(
      'date,payee,account,amount,currency\n'
    );
  });

  it('emits one row per posting', () => {
    expect(
      reconcileRowsToCsv(
        [
          {
            date: '2024-03-15',
            payee: 'Amazon',
            account: 'Expenses:Online',
            amount: 'USD 49.99',
            days: 100,
          },
        ],
        'USD'
      )
    ).toBe(
      'date,payee,account,amount,currency\n2024-03-15,Amazon,Expenses:Online,USD 49.99,USD\n'
    );
  });

  it('quotes payees containing commas', () => {
    expect(
      reconcileRowsToCsv(
        [
          {
            date: '2024-03-15',
            payee: 'Smith, John',
            account: 'Expenses:Online',
            amount: 'USD 49.99',
            days: 100,
          },
        ],
        'USD'
      )
    ).toBe(
      'date,payee,account,amount,currency\n2024-03-15,"Smith, John",Expenses:Online,USD 49.99,USD\n'
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test lib/reconcile/csv.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write the serializer**

Create `lib/reconcile/csv.ts`:

```ts
import { formatRow } from '@/lib/csv';
import type { ReconcileRow } from '@/features/reconcile/Reconcile.utils';

// Note: the underlying parser doesn't expose status today; the reconcile
// page shows only uncleared rows so status is implicitly "pending" or
// "none". The export omits the column for v1 — see plan deviation note.
const COLUMNS = ['date', 'payee', 'account', 'amount', 'currency'] as const;

export const reconcileRowsToCsv = (
  rows: ReconcileRow[],
  currency: string
): string => {
  const lines = [COLUMNS.join(',')];
  for (const r of rows) {
    lines.push(formatRow([r.date, r.payee, r.account, r.amount, currency]));
  }
  return lines.join('\n') + '\n';
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test lib/reconcile/csv.test.ts`
Expected: 3 PASS.

- [ ] **Step 5: Write the route**

Create `app/api/reconcile/export/route.ts`:

```ts
import { requireUser } from '@/lib/auth/require-user';
import { csvDownload } from '@/lib/csv';
import { reconcileRowsToCsv } from '@/lib/reconcile/csv';
import { getBaseCurrency } from '@/lib/settings';
import { parseReconcileRows } from '@/features/reconcile/Reconcile.utils';
import runLedger from '@/utils/runLedger';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  await requireUser();
  try {
    const base = await getBaseCurrency();
    const stdout = await runLedger([
      'reg',
      '--uncleared',
      '-X', base,
      '--format', 'NNN%D|%P|%A|%t\n',
    ]);
    return csvDownload(reconcileRowsToCsv(parseReconcileRows(stdout), base), 'reconcile');
  } catch (e) {
    console.error('reconcile export failed', e);
    return NextResponse.json({ error: 'Could not export reconcile rows' }, { status: 500 });
  }
}
```

(Verify the ledger args by reading `features/reconcile/Reconcile.tsx` — the route should mirror exactly what the page calls.)

- [ ] **Step 6: Mount the button**

Edit `features/reconcile/Reconcile.tsx`. Add the import and place the button in the header:

```tsx
import ExportButton from '@/components/ExportButton';
// ...
<div className="flex items-center gap-2">
  <h1 ...>Reconcile</h1>
  <Help ...>...</Help>
  <ExportButton href="/api/reconcile/export" />
</div>
```

- [ ] **Step 7: Smoke test + commit**

Run: `pnpm type-check && pnpm lint && pnpm test`
Expected: PASS.

```bash
git add lib/reconcile/ app/api/reconcile/export/route.ts features/reconcile/Reconcile.tsx
git commit -m "feat(reconcile): csv export endpoint and button"
```

---

## Task 11: Portfolio export

**Files:**
- Create: `lib/portfolio/csv.ts`, `lib/portfolio/csv.test.ts`
- Create: `app/api/portfolio/export/route.ts`
- Modify: `features/portfolio/Portfolio.tsx`

The parser already exists at `features/portfolio/parsePortfolio.ts` as `mergePortfolio(nativeStdout, convertedStdout)` returning `PortfolioRow[]` (`{account, native, converted}` where `native` is a string like `"10 AAPL"` and `converted` is a string like `"1234.50"` or empty).

For the CSV, we want separate columns: `account, commodity, quantity, value, currency`. That requires splitting the `native` string into quantity + commodity. Add a small helper.

- [ ] **Step 1: Write the failing csv test**

Create `lib/portfolio/csv.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { portfolioRowsToCsv } from './csv';

describe('portfolioRowsToCsv', () => {
  it('emits only the header row for empty input', () => {
    expect(portfolioRowsToCsv([], 'USD')).toBe(
      'account,commodity,quantity,value,currency\n'
    );
  });

  it('splits "<qty> <commodity>" native strings into separate columns', () => {
    expect(
      portfolioRowsToCsv(
        [
          { account: 'Assets:Brokerage', native: '12.345 VTSAX', converted: '3500.00' },
          { account: 'Assets:Crypto', native: '0.05 BTC', converted: '4000.00' },
        ],
        'USD'
      )
    ).toBe(
      'account,commodity,quantity,value,currency\n' +
        'Assets:Brokerage,VTSAX,12.345,3500.00,USD\n' +
        'Assets:Crypto,BTC,0.05,4000.00,USD\n'
    );
  });

  it('handles symbol-prefix amounts like "$1234.50"', () => {
    expect(
      portfolioRowsToCsv(
        [{ account: 'Assets:Cash', native: '$1234.50', converted: '1234.50' }],
        'USD'
      )
    ).toBe(
      'account,commodity,quantity,value,currency\n' +
        'Assets:Cash,$,1234.50,1234.50,USD\n'
    );
  });

  it('leaves value empty when converted is missing', () => {
    expect(
      portfolioRowsToCsv(
        [{ account: 'Assets:Crypto', native: '0.05 BTC', converted: '' }],
        'USD'
      )
    ).toBe(
      'account,commodity,quantity,value,currency\n' +
        'Assets:Crypto,BTC,0.05,,USD\n'
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test lib/portfolio/csv.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write the serializer**

Create `lib/portfolio/csv.ts`:

```ts
import { formatRow } from '@/lib/csv';
import type { PortfolioRow } from '@/features/portfolio/parsePortfolio';

const COLUMNS = ['account', 'commodity', 'quantity', 'value', 'currency'] as const;

/**
 * Split a native amount string into (quantity, commodity). Handles both
 * "<qty> <commodity>" (`10 AAPL`) and "<symbol><qty>" (`$1234.50`).
 */
const splitNative = (native: string): { quantity: string; commodity: string } => {
  const trimmed = native.trim();
  // Symbol-prefix: leading non-digit non-minus non-space char.
  const symbolMatch = /^([^\d\s.\-])(.+)$/.exec(trimmed);
  if (symbolMatch) {
    return { commodity: symbolMatch[1], quantity: symbolMatch[2].trim() };
  }
  // Space-separated: <qty> <commodity-or-rest>.
  const idx = trimmed.search(/\s/);
  if (idx === -1) return { quantity: trimmed, commodity: '' };
  return {
    quantity: trimmed.slice(0, idx).trim(),
    commodity: trimmed.slice(idx).trim(),
  };
};

const valueOf = (converted: string): string => {
  const trimmed = converted.trim();
  if (!trimmed) return '';
  // Strip leading symbol or trailing commodity for the numeric value.
  // For our use case `converted` from mergePortfolio is already a plain
  // numeric string with no commodity (per parsePortfolio.ts).
  return trimmed;
};

export const portfolioRowsToCsv = (
  rows: PortfolioRow[],
  currency: string
): string => {
  const lines = [COLUMNS.join(',')];
  for (const r of rows) {
    const { quantity, commodity } = splitNative(r.native);
    lines.push(formatRow([r.account, commodity, quantity, valueOf(r.converted), currency]));
  }
  return lines.join('\n') + '\n';
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test lib/portfolio/csv.test.ts`
Expected: 4 PASS. If a test fails, adjust `splitNative` until the tests pass without weakening them. The "test 3 symbol-prefix" case is the constraint — it must extract `$` as commodity and `1234.50` as quantity from `$1234.50`.

- [ ] **Step 5: Write the route**

Create `app/api/portfolio/export/route.ts`:

```ts
import { requireUser } from '@/lib/auth/require-user';
import { csvDownload } from '@/lib/csv';
import { portfolioRowsToCsv } from '@/lib/portfolio/csv';
import { env } from '@/lib/env';
import { getBaseCurrency } from '@/lib/settings';
import { mergePortfolio } from '@/features/portfolio/parsePortfolio';
import runLedger from '@/utils/runLedger';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  await requireUser();
  const prefix = env.PORTFOLIO_ACCOUNT_PREFIX;

  try {
    const base = await getBaseCurrency();
    const [nativeStdout, convertedStdout] = await Promise.all([
      runLedger(['balance', prefix, '--flat', '--format', '%A|%T\n']),
      runLedger([
        'balance', prefix,
        '-X', base,
        '--flat',
        '--format', '%A|%T\n',
      ]),
    ]);
    const rows = mergePortfolio(nativeStdout, convertedStdout);
    return csvDownload(portfolioRowsToCsv(rows, base), 'portfolio');
  } catch (e) {
    console.error('portfolio export failed', e);
    return NextResponse.json({ error: 'Could not export portfolio' }, { status: 500 });
  }
}
```

- [ ] **Step 6: Mount the button**

Edit `features/portfolio/Portfolio.tsx`. Add the import and place the button in BOTH the empty-state header and the populated header:

```tsx
import ExportButton from '@/components/ExportButton';
// ...
// In the empty-state header (and the populated header):
<div className="flex items-center gap-2">
  <h1 ...>Portfolio</h1>
  <Help ...>...</Help>
  <ExportButton href="/api/portfolio/export" />
</div>
```

(The empty-state CSV will be just the header row — still a valid download. No special case needed.)

- [ ] **Step 7: Smoke test + commit**

Run: `pnpm type-check && pnpm lint && pnpm test`
Expected: PASS.

```bash
git add lib/portfolio/ app/api/portfolio/export/route.ts features/portfolio/Portfolio.tsx
git commit -m "feat(portfolio): csv export endpoint and button"
```

---

## Task 12: PLAN.md update

**Files:**
- Modify: `PLAN.md`

- [ ] **Step 1: Tick off the CSV export item**

Find this line in `PLAN.md` (Phase 6):

```md
- [~] **CSV export** for any report (`ledger csv`) — `/transactions` ships with an Export CSV button that downloads the currently-filtered list as RFC 4180 CSV via `/api/transactions/export`. One row per posting (long format) for spreadsheet/pandas compatibility. Other report pages (balance / monthly / payees) don't have export buttons yet; revisit if asked.
```

Replace with:

```md
- [x] **CSV export** for any report — every report page (transactions, balance, monthly, payees, net-worth, debts, accounts, reconcile, portfolio) ships with an Export CSV button via `/api/<report>/export`. Shared helpers in `lib/csv/` (`escapeField`, `formatRow`, `csvDownload`) keep each route to ~15 lines; per-report serializers live next to their parsers under `lib/<report>/`. Amounts pre-converted to the active base currency; date-filtered pages forward `start`/`end` URL params. Spec: `docs/superpowers/specs/2026-05-24-report-csv-exports-design.md`.
```

- [ ] **Step 2: Commit**

```bash
git add PLAN.md
git commit -m "docs(plan): tick off Phase 6 csv export for all report pages"
```

---

## Self-Review

**1. Spec coverage:**
- Spec section 1 (shared helpers) → Task 1, Task 2. ✓
- Spec section 2 (per-report CSV shapes) → Tasks 4–11 each cover one report. ✓
- Spec section 3 (route shape & data flow) → embedded in every report task; `force-dynamic`, error model, mtime cache reuse, date-param validation. ✓
- Spec section 4 (testing) → escape/response unit tests in Task 1; per-report serializer tests in each of 4–11; parser tests in 4/5/7. ✓
- Spec section 5 (transactions migration) → Task 3. ✓
- Implementation order steps 1–12 → Tasks 1–12. ✓

**2. Placeholder scan:** every code step has the actual code; no `// TODO`, `TBD`, or "similar to Task N" references. The reconcile status-column omission is documented inline as a deliberate v1 deviation.

**3. Type consistency:**
- `BalanceRow` type defined in Task 4 (`lib/balance/parse.ts`); reused in Tasks 8 (debts) and 9 (accounts). ✓
- `PayeeRow` defined in Task 5; only consumed by `lib/payees/csv.ts`. ✓
- `CashFlowRow` reused from the existing `MonthlyComparison.utils.ts` in Task 6. ✓
- `NetWorthRow` defined in Task 7; only consumed by `lib/netWorth/csv.ts`. ✓
- `ReconcileRow` reused from `Reconcile.utils.ts` in Task 10. ✓
- `PortfolioRow` reused from `parsePortfolio.ts` in Task 11. ✓
- `csvDownload(csv, filenameStem)` signature consistent across all routes. ✓
- `formatRow(cells)` signature consistent across all serializers. ✓

**4. Known v1 deviations (documented in plan and acceptable to ship):**
- Reconcile CSV omits the `status` column (the underlying parser doesn't expose status today; adding it would require a separate ledger format change). Spec mentions `status` but plan defers it.
- Portfolio's `splitNative` helper handles only `<qty> <commodity>` and `<symbol><qty>` shapes — same set the rest of the codebase supports. Exotic shapes would fall through as `commodity=""` or `quantity=<full string>`, which is graceful degradation.

---

## Execution Handoff
