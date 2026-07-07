# Known Prices Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only view of the latest price `ledger` knows for every held commodity, plus a per-commodity price-history page.

**Architecture:** A new pure-function module (`lib/prices/knownPrices.ts`) parses `ledger` price output and derives price provenance. Two new `PriceService` methods shell out through the existing `runLedgerForUser` helper (which passes `--file` + `--price-db`). The `/prices` route becomes tabbed — a new "Known prices" list plus the existing manual-entry form — and a new `/prices/[symbol]` route renders a recharts chart + table.

**Tech Stack:** Next.js (App Router, server components), TypeScript, Drizzle (Postgres), recharts 3.9.2, vitest, Ledger CLI 3.4.1.

## Global Constraints

- Ledger is invoked only through `runLedgerForUser(userId, args, journalRepo)` — it already passes `--file <mainPath>` and `--price-db <priceDbPath>`. Never call `execFile('ledger')` directly.
- Base currency comes from `PriceService.resolveBaseCurrency(userId)` (currently returns `'USD'`).
- Stale threshold: a price older than **7 days** is stale.
- The exact prices format string (used verbatim) is:
  `%(format_date(date,'%Y-%m-%d'))|%(quantity(scrub(display_amount)))|%(commodity(scrub(display_amount)))\n`
- Naming: spell identifiers out in full — no abbreviations (`commodity` not `comm`, `history` not `hist`). Canonical domain acronyms (`USD`, `url`, `id`) are allowed.
- No self-reference: no mention of any AI tool in code, comments, or commit messages.
- recharts (3.9.2) is already a dependency — do not add charting libraries.

## File Structure

- Create `lib/prices/knownPrices.ts` — pure helpers + shared types (`PricePoint`, `KnownPrice`, `PriceSource`, `PRICES_FORMAT`, `STALE_THRESHOLD_DAYS`, `parsePriceHistory`, `deriveSource`, `ageInDays`).
- Create `lib/prices/knownPrices.test.ts` — unit tests for the pure helpers.
- Modify `lib/prices/service.ts` — add `listHeldCommodities`, `listPriceHistory`, `listKnownPrices`.
- Modify `lib/prices/service.test.ts` — integration tests for the new service methods.
- Modify `lib/prices/index.ts` — re-export new types + views.
- Create `features/prices/PriceHistoryView.tsx` — recharts line chart + dated table (client component).
- Create `features/prices/KnownPricesView.tsx` — the list table (client component, rows link to detail).
- Create `features/prices/PricesTabs.tsx` — client wrapper switching between "Known prices" and "Manual entry" via the existing `TabBar`.
- Modify `features/prices/index.ts` — export `KnownPricesView`, `PriceHistoryView`, `PricesTabs`.
- Modify `app/prices/page.tsx` — also fetch known prices; render `PricesTabs`.
- Create `app/prices/[symbol]/page.tsx` — validate symbol, fetch history, render `PriceHistoryView`.

---

### Task 1: Price parsing + provenance helpers (pure)

**Files:**
- Create: `lib/prices/knownPrices.ts`
- Test: `lib/prices/knownPrices.test.ts`

**Interfaces:**
- Consumes: `normalizeCommoditySymbol` from `./symbols`.
- Produces:
  - `PRICES_FORMAT: string`
  - `STALE_THRESHOLD_DAYS = 7`
  - `type PricePoint = { date: string; price: number; quote: string }`
  - `type PriceSource = 'fetched' | 'manual' | 'journal' | 'base' | 'none'`
  - `type KnownPrice = { symbol: string; price: number | null; quote: string | null; date: string | null; ageDays: number | null; stale: boolean; source: PriceSource }`
  - `parsePriceHistory(stdout: string): PricePoint[]`
  - `ageInDays(dateIso: string, todayIso: string): number`
  - `deriveSource(args: { symbolNormalized: string | null; quoteNormalized: string | null; date: string | null; base: string; manualKeys: Set<string>; fetchedKeys: Set<string> }): PriceSource`
  - `priceKey(symbol: string, quote: string, date: string): string` — builds `` `${symbol}|${quote}|${date}` ``.

- [ ] **Step 1: Write the failing test**

Create `lib/prices/knownPrices.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  parsePriceHistory,
  ageInDays,
  deriveSource,
  priceKey,
  STALE_THRESHOLD_DAYS,
} from './knownPrices';

describe('parsePriceHistory', () => {
  it('parses date|quantity|quote rows into points', () => {
    const stdout = '2026-01-01|40000|$\n2026-06-15|50000|$\n';
    expect(parsePriceHistory(stdout)).toEqual([
      { date: '2026-01-01', price: 40000, quote: '$' },
      { date: '2026-06-15', price: 50000, quote: '$' },
    ]);
  });

  it('strips thousands separators from the quantity', () => {
    expect(parsePriceHistory('2026-01-01|1,234.50|$\n')).toEqual([
      { date: '2026-01-01', price: 1234.5, quote: '$' },
    ]);
  });

  it('dedupes exact (date, price) duplicates', () => {
    const stdout = '2026-01-01|40000|$\n2026-01-01|40000|$\n2026-01-02|40000|$\n';
    expect(parsePriceHistory(stdout)).toEqual([
      { date: '2026-01-01', price: 40000, quote: '$' },
      { date: '2026-01-02', price: 40000, quote: '$' },
    ]);
  });

  it('skips blank and malformed lines', () => {
    const stdout = '\n2026-01-01|40000|$\ngarbage\n|bad|\n';
    expect(parsePriceHistory(stdout)).toEqual([
      { date: '2026-01-01', price: 40000, quote: '$' },
    ]);
  });
});

describe('ageInDays', () => {
  it('counts whole UTC days between two ISO dates', () => {
    expect(ageInDays('2026-07-01', '2026-07-08')).toBe(7);
    expect(ageInDays('2026-07-08', '2026-07-08')).toBe(0);
  });
});

describe('deriveSource', () => {
  const base = 'USD';
  const empty = new Set<string>();

  it('returns base when the symbol is the base currency', () => {
    expect(
      deriveSource({ symbolNormalized: 'USD', quoteNormalized: 'USD', date: null, base, manualKeys: empty, fetchedKeys: empty })
    ).toBe('base');
  });

  it('returns none when there is no date', () => {
    expect(
      deriveSource({ symbolNormalized: 'BTC', quoteNormalized: 'USD', date: null, base, manualKeys: empty, fetchedKeys: empty })
    ).toBe('none');
  });

  it('prefers manual over fetched when both match', () => {
    const key = priceKey('BTC', 'USD', '2026-06-15');
    expect(
      deriveSource({ symbolNormalized: 'BTC', quoteNormalized: 'USD', date: '2026-06-15', base, manualKeys: new Set([key]), fetchedKeys: new Set([key]) })
    ).toBe('manual');
  });

  it('returns fetched when only the fetched set matches', () => {
    const key = priceKey('BTC', 'USD', '2026-06-15');
    expect(
      deriveSource({ symbolNormalized: 'BTC', quoteNormalized: 'USD', date: '2026-06-15', base, manualKeys: empty, fetchedKeys: new Set([key]) })
    ).toBe('fetched');
  });

  it('falls back to journal when nothing matches', () => {
    expect(
      deriveSource({ symbolNormalized: 'BTC', quoteNormalized: 'USD', date: '2026-06-15', base, manualKeys: empty, fetchedKeys: empty })
    ).toBe('journal');
  });
});

it('exposes a 7 day stale threshold', () => {
  expect(STALE_THRESHOLD_DAYS).toBe(7);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run lib/prices/knownPrices.test.ts`
Expected: FAIL — cannot resolve `./knownPrices`.

- [ ] **Step 3: Write minimal implementation**

Create `lib/prices/knownPrices.ts`:

```ts
import { normalizeCommoditySymbol } from './symbols';

/**
 * Machine-parseable prices report format: one `date|quantity|quote` line per
 * price point. `quantity` is the numeric price, `quote` is the commodity the
 * price is denominated in (e.g. `$`). Must be passed verbatim to
 * `ledger prices <symbol> --prices-format <PRICES_FORMAT>`.
 */
export const PRICES_FORMAT =
  "%(format_date(date,'%Y-%m-%d'))|%(quantity(scrub(display_amount)))|%(commodity(scrub(display_amount)))\n";

export const STALE_THRESHOLD_DAYS = 7;

export type PricePoint = { date: string; price: number; quote: string };

export type PriceSource = 'fetched' | 'manual' | 'journal' | 'base' | 'none';

export type KnownPrice = {
  symbol: string;
  price: number | null;
  quote: string | null;
  date: string | null;
  ageDays: number | null;
  stale: boolean;
  source: PriceSource;
};

export const priceKey = (symbol: string, quote: string, date: string): string =>
  `${symbol}|${quote}|${date}`;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Parse `ledger prices --prices-format PRICES_FORMAT` output into points. */
export const parsePriceHistory = (stdout: string): PricePoint[] => {
  const seen = new Set<string>();
  const points: PricePoint[] = [];
  for (const line of stdout.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const [date, quantity, quote] = trimmed.split('|');
    if (!date || !quantity || !quote) continue;
    if (!DATE_PATTERN.test(date)) continue;
    const price = Number(quantity.replace(/,/g, ''));
    if (!Number.isFinite(price)) continue;
    const key = `${date}|${price}`;
    if (seen.has(key)) continue;
    seen.add(key);
    points.push({ date, price, quote });
  }
  return points;
};

/** Whole UTC days from `dateIso` to `todayIso` (both `YYYY-MM-DD`). */
export const ageInDays = (dateIso: string, todayIso: string): number => {
  const a = Date.parse(`${dateIso}T00:00:00Z`);
  const b = Date.parse(`${todayIso}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
};

/**
 * Determine where the latest price came from. `ledger` carries no provenance,
 * so we correlate the (symbol, quote, date) key against the manual- and
 * fetched-price sets built from the database. Manual wins when both match.
 */
export const deriveSource = (args: {
  symbolNormalized: string | null;
  quoteNormalized: string | null;
  date: string | null;
  base: string;
  manualKeys: Set<string>;
  fetchedKeys: Set<string>;
}): PriceSource => {
  const { symbolNormalized, quoteNormalized, date, base, manualKeys, fetchedKeys } = args;
  if (symbolNormalized && symbolNormalized === base) return 'base';
  if (!date || !symbolNormalized || !quoteNormalized) return 'none';
  const key = priceKey(symbolNormalized, quoteNormalized, date);
  if (manualKeys.has(key)) return 'manual';
  if (fetchedKeys.has(key)) return 'fetched';
  return 'journal';
};

/** Re-exported so the service normalizes symbols the same way. */
export { normalizeCommoditySymbol };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run lib/prices/knownPrices.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add lib/prices/knownPrices.ts lib/prices/knownPrices.test.ts
git commit -m "feat(prices): add price-history parser and provenance helpers"
```

---

### Task 2: Service — `listHeldCommodities` and `listPriceHistory`

**Files:**
- Modify: `lib/prices/service.ts`
- Test: `lib/prices/service.test.ts`

**Interfaces:**
- Consumes: `runLedgerForUser` (already imported), `parsePriceHistory`, `PRICES_FORMAT`, `PricePoint` from `./knownPrices`; `this.deps.journalRepo`.
- Produces:
  - `listHeldCommodities(userId: string): Promise<string[]>` — raw commodity symbols from `ledger commodities`, trimmed, blanks dropped, original order.
  - `listPriceHistory(userId: string, symbol: string): Promise<PricePoint[]>` — ascending by date; `[]` when ledger errors or the symbol has no price.

- [ ] **Step 1: Write the failing test**

Append a new top-level `describe` block to `lib/prices/service.test.ts`, following the file's existing idiom — each `describe` owns its `ctx`/`service` via `beforeEach`/`afterEach` and seeds through the file's existing `seedUser(ctx, id, postings, baseCurrency)` helper:

```ts
describe('PriceService known-price reads', () => {
  let ctx: TestDbContext;
  let service: PriceService;

  beforeEach(async () => {
    ctx = await setupTestDb('prices-known-');
    service = new PriceService({
      db: ctx.db,
      commodityRepo: new CommodityPriceRepository(ctx.db),
      runRepo: new PriceFetchRunRepository(ctx.db),
      journalRepo: new JournalRepository(ctx.db),
      manualRepo: new ManualPriceRepository(ctx.db),
      mappingRepo: new CommodityMappingRepository(ctx.db),
    });
  });

  afterEach(async () => {
    await teardownTestDb(ctx);
  });

  it('lists held commodities including the base symbol', async () => {
    await seedUser(
      ctx,
      'u-comm',
      [
        '2026-01-02 buy',
        '    Assets:Crypto   1 BTC @ $40000',
        '    Assets:Cash',
        '',
      ].join('\n'),
      'USD'
    );
    const held = await service.listHeldCommodities('u-comm');
    expect(held).toContain('BTC');
    expect(held).toContain('$');
  });

  it('returns ascending price points for a held commodity', async () => {
    await seedUser(
      ctx,
      'u-hist',
      [
        'P 2026-01-01 BTC $40000',
        'P 2026-06-15 BTC $50000',
        '2026-01-02 buy',
        '    Assets:Crypto   1 BTC @ $40000',
        '    Assets:Cash',
        '',
      ].join('\n'),
      'USD'
    );
    const points = await service.listPriceHistory('u-hist', 'BTC');
    expect(points.length).toBeGreaterThanOrEqual(2);
    expect(points.at(-1)).toEqual({ date: '2026-06-15', price: 50000, quote: '$' });
  });
});
```

> All of `setupTestDb`, `teardownTestDb`, `TestDbContext`, `seedUser`, `PriceService`, and the four repository classes are already imported at the top of `service.test.ts` (they are used by the existing describe blocks). No new imports are needed.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run lib/prices/service.test.ts -t "known-price reads"`
Expected: FAIL — `service.listHeldCommodities is not a function`.

- [ ] **Step 3: Write minimal implementation**

In `lib/prices/service.ts` add the import near the other `./` imports:

```ts
import {
  PRICES_FORMAT,
  parsePriceHistory,
  type PricePoint,
} from './knownPrices';
```

Add these methods to the `PriceService` class (next to `listNormalizedSymbolsForUser`):

```ts
/** Raw commodity symbols the user holds, as `ledger commodities` prints them. */
async listHeldCommodities(userId: string): Promise<string[]> {
  let stdout: string;
  try {
    stdout = await runLedgerForUser(userId, ['commodities'], this.deps.journalRepo);
  } catch {
    return [];
  }
  return stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/** Full known price history for one commodity, ascending by date. */
async listPriceHistory(userId: string, symbol: string): Promise<PricePoint[]> {
  let stdout: string;
  try {
    stdout = await runLedgerForUser(
      userId,
      ['prices', symbol, '--prices-format', PRICES_FORMAT],
      this.deps.journalRepo
    );
  } catch {
    return [];
  }
  return parsePriceHistory(stdout);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run lib/prices/service.test.ts -t "known-price reads"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/prices/service.ts lib/prices/service.test.ts
git commit -m "feat(prices): read held commodities and per-commodity price history"
```

---

### Task 3: Service — `listKnownPrices`

**Files:**
- Modify: `lib/prices/service.ts`
- Test: `lib/prices/service.test.ts`

**Interfaces:**
- Consumes: `listHeldCommodities`, `listPriceHistory`, `resolveBaseCurrency`, `this.deps.manualRepo.listForUser`, `this.deps.commodityRepo.listForQuote`; `deriveSource`, `ageInDays`, `priceKey`, `normalizeCommoditySymbol`, `STALE_THRESHOLD_DAYS`, `KnownPrice` from `./knownPrices`; `utcDate` (already defined in the file).
- Produces:
  - `listKnownPrices(userId: string): Promise<KnownPrice[]>` — one row per held commodity, sorted by `symbol` ascending. Base-currency row synthesized (`price: 1`, `source: 'base'`). Unpriced commodities produce a gap row (`price: null`, `source: 'none'`).

- [ ] **Step 1: Write the failing test**

Append another top-level `describe` block to `lib/prices/service.test.ts`, same idiom as Task 2:

```ts
describe('PriceService.listKnownPrices', () => {
  let ctx: TestDbContext;
  let service: PriceService;

  beforeEach(async () => {
    ctx = await setupTestDb('prices-list-');
    service = new PriceService({
      db: ctx.db,
      commodityRepo: new CommodityPriceRepository(ctx.db),
      runRepo: new PriceFetchRunRepository(ctx.db),
      journalRepo: new JournalRepository(ctx.db),
      manualRepo: new ManualPriceRepository(ctx.db),
      mappingRepo: new CommodityMappingRepository(ctx.db),
    });
  });

  afterEach(async () => {
    await teardownTestDb(ctx);
  });

  it('reports latest price, base row, and journal source', async () => {
    await seedUser(
      ctx,
      'u-known',
      [
        'P 2026-01-01 BTC $40000',
        'P 2026-06-15 BTC $50000',
        '2026-01-02 buy',
        '    Assets:Crypto        1 BTC @ $40000',
        '    Assets:Metal         2 GOLD @ $10',
        '    Assets:Cash',
        '',
      ].join('\n'),
      'USD'
    );
    const rows = await service.listKnownPrices('u-known');
    const bySymbol = Object.fromEntries(rows.map((r) => [r.symbol, r]));

    // BTC: latest journal price, denominated in $.
    expect(bySymbol.BTC.price).toBe(50000);
    expect(bySymbol.BTC.date).toBe('2026-06-15');
    expect(bySymbol.BTC.source).toBe('journal');
    expect(bySymbol.BTC.stale).toBe(true); // 2026-06-15 is well over 7 days old

    // GOLD held with a cost → has a price row.
    expect(bySymbol.GOLD.price).toBe(10);

    // Base currency row synthesized.
    expect(bySymbol['$'].source).toBe('base');
    expect(bySymbol['$'].price).toBe(1);
    expect(bySymbol['$'].stale).toBe(false);
  });

  it('labels a fetched price as fetched', async () => {
    await seedUser(
      ctx,
      'u-fetch',
      [
        'P 2026-06-15 BTC $50000',
        '2026-01-02 buy',
        '    Assets:Crypto   1 BTC @ $40000',
        '    Assets:Cash',
        '',
      ].join('\n'),
      'USD'
    );
    // Record a fetched price on the same day/value as the latest known price.
    await new CommodityPriceRepository(ctx.db).insert([
      {
        symbol: 'BTC',
        quote: 'USD',
        price: 50000,
        fetchedAt: new Date('2026-06-15T00:00:00Z'),
        fetchedDate: '2026-06-15',
      },
    ]);
    const rows = await service.listKnownPrices('u-fetch');
    const btc = rows.find((r) => r.symbol === 'BTC');
    expect(btc?.source).toBe('fetched');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run lib/prices/service.test.ts -t listKnownPrices`
Expected: FAIL — `service.listKnownPrices is not a function`.

- [ ] **Step 3: Write minimal implementation**

Extend the import from `./knownPrices` in `service.ts` to include the helpers:

```ts
import {
  PRICES_FORMAT,
  STALE_THRESHOLD_DAYS,
  ageInDays,
  deriveSource,
  normalizeCommoditySymbol as normalizeSymbol,
  parsePriceHistory,
  priceKey,
  type KnownPrice,
  type PricePoint,
} from './knownPrices';
```

> Note: `service.ts` already imports `normalizeCommoditySymbol` from `./symbols`. Keep that import and alias the re-export here as `normalizeSymbol` to avoid a duplicate binding, OR simply use the existing `normalizeCommoditySymbol` import and drop it from this import list. Pick one; do not import the same name twice.

Add the method to `PriceService`:

```ts
/** Latest known price for every held commodity, with provenance and staleness. */
async listKnownPrices(userId: string): Promise<KnownPrice[]> {
  const base = await this.resolveBaseCurrency(userId);
  const [held, manual, fetched] = await Promise.all([
    this.listHeldCommodities(userId),
    this.deps.manualRepo.listForUser(userId),
    this.deps.commodityRepo.listForQuote(base),
  ]);

  const manualKeys = new Set(
    manual.map((row) => priceKey(row.symbol, row.quote, utcDate(row.pricedAt)))
  );
  const fetchedKeys = new Set(
    fetched.map((row) => priceKey(row.symbol, row.quote, row.fetchedDate))
  );

  const today = utcDate(new Date());

  const rows = await Promise.all(
    held.map(async (symbol): Promise<KnownPrice> => {
      const symbolNormalized = normalizeSymbol(symbol);

      if (symbolNormalized && symbolNormalized === base) {
        return {
          symbol,
          price: 1,
          quote: base,
          date: null,
          ageDays: null,
          stale: false,
          source: 'base',
        };
      }

      const history = await this.listPriceHistory(userId, symbol);
      const latest: PricePoint | undefined = history.at(-1);

      if (!latest) {
        return {
          symbol,
          price: null,
          quote: null,
          date: null,
          ageDays: null,
          stale: false,
          source: 'none',
        };
      }

      const quoteNormalized = normalizeSymbol(latest.quote) ?? latest.quote;
      const ageDays = ageInDays(latest.date, today);
      return {
        symbol,
        price: latest.price,
        quote: latest.quote,
        date: latest.date,
        ageDays,
        stale: ageDays > STALE_THRESHOLD_DAYS,
        source: deriveSource({
          symbolNormalized,
          quoteNormalized,
          date: latest.date,
          base,
          manualKeys,
          fetchedKeys,
        }),
      };
    })
  );

  return rows.sort((a, b) => a.symbol.localeCompare(b.symbol));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run lib/prices/service.test.ts -t listKnownPrices`
Expected: PASS both cases.

- [ ] **Step 5: Commit**

```bash
git add lib/prices/service.ts lib/prices/service.test.ts
git commit -m "feat(prices): assemble known-prices list with provenance and gaps"
```

---

### Task 4: Export new types and re-exports

**Files:**
- Modify: `lib/prices/index.ts`

**Interfaces:**
- Produces: barrel exports of `KnownPrice`, `PricePoint`, `PriceSource` from `lib/prices`.

- [ ] **Step 1: Add exports**

In `lib/prices/index.ts`, after the existing `export type { CommodityPriceRow } ...` line, add:

```ts
export type {
  KnownPrice,
  PricePoint,
  PriceSource,
} from './knownPrices';
```

- [ ] **Step 2: Verify type-check passes**

Run: `pnpm type-check`
Expected: PASS (no output errors).

- [ ] **Step 3: Commit**

```bash
git add lib/prices/index.ts
git commit -m "chore(prices): export known-price types from barrel"
```

---

### Task 5: Commodity detail page — chart + table

**Files:**
- Create: `features/prices/PriceHistoryView.tsx`
- Create: `app/prices/[symbol]/page.tsx`
- Modify: `features/prices/index.ts`

**Interfaces:**
- Consumes: `priceService.listHeldCommodities`, `priceService.listPriceHistory`, `PricePoint`, `requireUser`, `notFound`.
- Produces: `PriceHistoryView` (default or named export) with props `{ symbol: string; points: PricePoint[] }`.

- [ ] **Step 1: Create the view component**

Create `features/prices/PriceHistoryView.tsx`:

```tsx
'use client';

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { TableScroll } from '@/components/ui/table';
import type { PricePoint } from '@/lib/prices';

type Props = { symbol: string; points: PricePoint[] };

export const PriceHistoryView = ({ symbol, points }: Props) => {
  const quote = points.at(-1)?.quote ?? '';

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-4">
      <header className="space-y-1">
        <a href="/prices" className="text-sm text-muted-foreground hover:underline">
          ← Back to prices
        </a>
        <h1 className="text-2xl font-semibold">{symbol} price history</h1>
      </header>

      {points.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Ledger has no price history for {symbol}.
        </p>
      ) : (
        <>
          <div className="h-72 w-full rounded-2xl border border-border bg-card p-4 shadow-sm">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={points} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} minTickGap={24} />
                <YAxis tick={{ fontSize: 12 }} width={72} domain={['auto', 'auto']} />
                <Tooltip
                  formatter={(value: number) => [`${value} ${quote}`, 'Price']}
                />
                <Line type="monotone" dataKey="price" dot={false} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <TableScroll bleed={false}>
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th className="text-right">Price</th>
                    <th>Quote</th>
                  </tr>
                </thead>
                <tbody>
                  {[...points].reverse().map((point) => (
                    <tr key={`${point.date}-${point.price}`}>
                      <td className="whitespace-nowrap text-muted-foreground">
                        {point.date}
                      </td>
                      <td className="text-right tabular-nums whitespace-nowrap">
                        {point.price}
                      </td>
                      <td className="whitespace-nowrap">{point.quote}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableScroll>
          </div>
        </>
      )}
    </div>
  );
};
```

- [ ] **Step 2: Export it**

In `features/prices/index.ts` add:

```ts
export { PriceHistoryView } from './PriceHistoryView';
```

- [ ] **Step 3: Create the route**

Create `app/prices/[symbol]/page.tsx`:

```tsx
import { PriceHistoryView } from '@/features/prices';
import { requireUser } from '@/lib/auth/require-user';
import { priceService } from '@/lib/prices';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

const PriceHistoryPage = async ({
  params,
}: {
  params: Promise<{ symbol: string }>;
}) => {
  const user = await requireUser();
  const { symbol: symbolParam } = await params;
  const symbol = decodeURIComponent(symbolParam);

  const held = await priceService.listHeldCommodities(user.id);
  if (!held.includes(symbol)) notFound();

  const points = await priceService.listPriceHistory(user.id, symbol);
  return <PriceHistoryView symbol={symbol} points={points} />;
};

export default PriceHistoryPage;
```

- [ ] **Step 4: Type-check + build the route**

Run: `pnpm type-check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add features/prices/PriceHistoryView.tsx features/prices/index.ts "app/prices/[symbol]/page.tsx"
git commit -m "feat(prices): add per-commodity price-history page"
```

---

### Task 6: Known-prices list + tabbed /prices page

**Files:**
- Create: `features/prices/KnownPricesView.tsx`
- Create: `features/prices/PricesTabs.tsx`
- Modify: `features/prices/index.ts`
- Modify: `app/prices/page.tsx`

**Interfaces:**
- Consumes: `KnownPrice`, `ManualPrice`, existing `PricesView`, `TabBar` from `@/features/transactions/entry/TabBar`.
- Produces:
  - `KnownPricesView` with props `{ rows: KnownPrice[] }`.
  - `PricesTabs` with props `{ known: KnownPrice[]; prices: ManualPrice[]; commodities: string[]; baseCurrency: string }`.

- [ ] **Step 1: Create the list view**

Create `features/prices/KnownPricesView.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { TableScroll } from '@/components/ui/table';
import type { KnownPrice } from '@/lib/prices';

type Props = { rows: KnownPrice[] };

const sourceLabel: Record<KnownPrice['source'], string> = {
  fetched: 'Fetched',
  manual: 'Manual',
  journal: 'Journal',
  base: 'Base',
  none: '—',
};

const ageLabel = (row: KnownPrice): string => {
  if (row.ageDays === null) return '—';
  if (row.ageDays === 0) return 'today';
  if (row.ageDays === 1) return '1 day ago';
  return `${row.ageDays} days ago`;
};

export const KnownPricesView = ({ rows }: Props) => (
  <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
    <TableScroll bleed={false}>
      <table>
        <thead>
          <tr>
            <th>Commodity</th>
            <th className="text-right">Latest price</th>
            <th>Date</th>
            <th>Age</th>
            <th>Source</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={5} className="py-6 text-center text-muted-foreground">
                No commodities
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.symbol}>
                <td className="font-medium">
                  <Link
                    href={`/prices/${encodeURIComponent(row.symbol)}`}
                    className="hover:underline"
                  >
                    {row.symbol}
                  </Link>
                </td>
                <td className="text-right tabular-nums whitespace-nowrap">
                  {row.price === null
                    ? <span className="text-muted-foreground">no price</span>
                    : `${row.price} ${row.quote ?? ''}`.trim()}
                </td>
                <td className="whitespace-nowrap text-muted-foreground">
                  {row.date ?? '—'}
                </td>
                <td className="whitespace-nowrap">
                  <span className={row.stale ? 'text-amber-600 dark:text-amber-500' : 'text-muted-foreground'}>
                    {ageLabel(row)}
                    {row.stale ? ' · stale' : ''}
                  </span>
                </td>
                <td className="whitespace-nowrap text-muted-foreground">
                  {sourceLabel[row.source]}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </TableScroll>
  </div>
);
```

- [ ] **Step 2: Create the tabs wrapper**

Create `features/prices/PricesTabs.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { TabBar } from '@/features/transactions/entry/TabBar';
import type { ManualPrice } from '@/db/schema';
import type { KnownPrice } from '@/lib/prices';
import { KnownPricesView } from './KnownPricesView';
import { PricesView } from './PricesView';

type Props = {
  known: KnownPrice[];
  prices: ManualPrice[];
  commodities: string[];
  baseCurrency: string;
};

const TABS = [
  { id: 'known', label: 'Known prices' },
  { id: 'manual', label: 'Manual entry' },
];

export const PricesTabs = ({ known, prices, commodities, baseCurrency }: Props) => {
  const [active, setActive] = useState('known');

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-4">
      <header>
        <h1 className="text-2xl font-semibold">Prices</h1>
      </header>
      <TabBar tabs={TABS} active={active} onSelect={setActive} />
      {active === 'known' ? (
        <KnownPricesView rows={known} />
      ) : (
        <PricesView
          prices={prices}
          commodities={commodities}
          baseCurrency={baseCurrency}
        />
      )}
    </div>
  );
};
```

> `PricesView` renders its own `<header>` with an `<h1>Prices</h1>`. That duplicates the wrapper header on the manual tab. Remove the `<header>…</header>` block (the `h1` + description paragraph) from `features/prices/PricesView.tsx` so the page has a single title, OR keep PricesView's header and drop the one in `PricesTabs`. Pick one; the plan assumes you keep the `PricesTabs` header and delete PricesView's outer `<header>` block and its surrounding `max-w-3xl` wrapper padding so it nests cleanly.

- [ ] **Step 3: Export both**

In `features/prices/index.ts` add:

```ts
export { KnownPricesView } from './KnownPricesView';
export { PricesTabs } from './PricesTabs';
```

- [ ] **Step 4: Wire the page**

Replace `app/prices/page.tsx` body to fetch known prices and render the tabs:

```tsx
import { PricesTabs } from '@/features/prices';
import { requireUser } from '@/lib/auth/require-user';
import { priceService } from '@/lib/prices';

export const dynamic = 'force-dynamic';

const PricesPage = async () => {
  const user = await requireUser();
  const [known, prices, commodities, baseCurrency] = await Promise.all([
    priceService.listKnownPrices(user.id),
    priceService.listManualPrices(user.id),
    priceService.listNormalizedSymbolsForUser(user.id),
    priceService.resolveBaseCurrency(user.id),
  ]);

  return (
    <PricesTabs
      known={known}
      prices={prices}
      commodities={commodities}
      baseCurrency={baseCurrency}
    />
  );
};

export default PricesPage;
```

- [ ] **Step 5: Type-check, lint, and run the existing suite**

Run: `pnpm type-check && pnpm vitest run lib/prices`
Expected: PASS.

- [ ] **Step 6: Manual smoke check**

Run: `pnpm dev`, sign in, open `/prices`. Verify the "Known prices" tab lists held commodities with prices, dates, age, and source; the base currency (USD/`$`) shows as `Base`; clicking a commodity opens `/prices/<symbol>` with a chart + table; the "Manual entry" tab still works.

- [ ] **Step 7: Commit**

```bash
git add features/prices/KnownPricesView.tsx features/prices/PricesTabs.tsx features/prices/index.ts features/prices/PricesView.tsx app/prices/page.tsx
git commit -m "feat(prices): tabbed prices page with known-prices list"
```

---

## Self-Review

**Spec coverage:**
- Tabbed `/prices` (known + manual) → Task 6. ✓
- `/prices/[symbol]` chart + table → Task 5. ✓
- Held commodities incl. base, gaps shown → Task 3 (`listKnownPrices`). ✓
- Columns latest price+quote / date / age+stale / source → Tasks 3 (data) + 6 (render). ✓
- Ledger commands via `runLedgerForUser` with verified format → Tasks 2–3. ✓
- Source correlation against manual + fetched tables → Tasks 1 (`deriveSource`) + 3. ✓
- Tests: parser, latest-selection, source correlation, gaps, base → Tasks 1 + 3. ✓

**Placeholder scan:** No TBD/TODO; every code step shows full code. One conditional instruction (PricesView header dedupe) is spelled out with an explicit chosen path.

**Type consistency:** `KnownPrice` / `PricePoint` / `PriceSource` defined in Task 1 and consumed unchanged in Tasks 3/5/6. `listHeldCommodities`, `listPriceHistory`, `listKnownPrices` signatures match between definition (Tasks 2–3) and callers (Tasks 5–6). `PRICES_FORMAT` used verbatim.

**Note for the implementer:** `resolveBaseCurrency` currently returns `'USD'`; the base row and fetched-price quote correlation assume USD. If base-currency selection becomes per-user later, the `quoteNormalized` correlation still holds because it reads the actual ledger quote.
