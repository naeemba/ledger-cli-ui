# Known Prices — Base-Currency Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a toggle on the Known prices tab that switches each row between its original journal quote and a USD-normalized value.

**Architecture:** A new `PriceService.listKnownPricesInBase` reuses the existing raw `listKnownPrices` rows, then values each held commodity into the base currency in a single ledger `balance -X USD` call driven by a throwaway probe journal. The prices page branches on a `?base=usd` search param; a segmented `next/link` control drives the (server-refetched) switch.

**Tech Stack:** TypeScript, Next.js 16 (App Router, server components), Ledger 3.4.1 CLI, Vitest.

## Global Constraints

- Base currency comes from `resolveBaseCurrency(userId)` (returns `'USD'` today). Never hardcode `'USD'` in the service — use the resolved `base` variable.
- Ledger `prices -X` does NOT convert; only a `balance -X <base>` report chains cross-rates. Do not attempt normalization via `ledger prices`.
- Probe journal transactions MUST be blank-line separated and each MUST carry an explicit offsetting posting, or ledger errors ("Only one posting with null amount allowed").
- The `balance` call MUST include `--empty` (sub-unit values round to 0 at USD display precision and would otherwise be dropped) and anchor the account query as `^Probe:c`.
- Identifiers spelled out in full; no abbreviations. No AI/tool self-reference in code, comments, or commits.
- Commit style: Conventional Commits, terse. No `Co-Authored-By` trailer.

---

### Task 1: Base-balance parser + format constant

**Files:**
- Modify: `lib/prices/knownPrices.ts` (add near `PRICES_FORMAT`)
- Test: `lib/prices/knownPrices.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `BALANCE_BASE_FORMAT: string`
  - `parseBaseBalance(stdout: string): Map<number, { price: number; commodity: string }>`

- [ ] **Step 1: Write the failing tests**

Append to `lib/prices/knownPrices.test.ts`. Add `parseBaseBalance` and `BALANCE_BASE_FORMAT` to the existing import from `./knownPrices`.

```typescript
describe('parseBaseBalance', () => {
  it('parses Probe:cN|quantity|commodity rows keyed by index', () => {
    const stdout =
      'Probe:c0|107393.21686406863836|USD\nProbe:c1|117.045492|USD\n';
    const map = parseBaseBalance(stdout);
    expect(map.get(0)).toEqual({
      price: 107393.21686406863836,
      commodity: 'USD',
    });
    expect(map.get(1)).toEqual({ price: 117.045492, commodity: 'USD' });
  });

  it('keeps an unconvertible row in its own commodity', () => {
    const map = parseBaseBalance('Probe:c2|1|XOF\n');
    expect(map.get(2)).toEqual({ price: 1, commodity: 'XOF' });
  });

  it('strips thousands separators from the quantity', () => {
    const map = parseBaseBalance('Probe:c0|1,234.50|USD\n');
    expect(map.get(0)).toEqual({ price: 1234.5, commodity: 'USD' });
  });

  it('ignores offset accounts, blanks, and malformed lines', () => {
    const stdout =
      '\nOffset:c0|-1|USD\nProbe:c0|5|USD\ngarbage\nProbe:cX|9|USD\n';
    const map = parseBaseBalance(stdout);
    expect([...map.keys()]).toEqual([0]);
    expect(map.get(0)).toEqual({ price: 5, commodity: 'USD' });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run lib/prices/knownPrices.test.ts -t parseBaseBalance`
Expected: FAIL — `parseBaseBalance is not a function` / import error.

- [ ] **Step 3: Implement the constant and parser**

In `lib/prices/knownPrices.ts`, directly below the `PRICES_FORMAT` export, add:

```typescript
/**
 * Machine-parseable balance format for base-currency valuation: one
 * `account|quantity|commodity` line per probe holding. `quantity` is the
 * full-precision value, `commodity` is the currency it resolved to (the base
 * when a conversion path existed, otherwise the holding's own commodity).
 */
export const BALANCE_BASE_FORMAT =
  '%(account)|%(quantity(scrub(display_total)))|%(commodity(scrub(display_total)))\n';
```

At the end of the file (after `latestGenuinePrice`), add:

```typescript
/**
 * Parse `ledger balance ^Probe:cN --flat -X <base> --empty` output into a
 * map of probe index → valued amount. Probe accounts are named `Probe:c<index>`
 * so the account label carries no commodity-specific characters; the index maps
 * back to the held commodity by position. Offset accounts and malformed lines
 * are ignored. A row whose `commodity` differs from the requested base was not
 * convertible into the base.
 */
export const parseBaseBalance = (
  stdout: string
): Map<number, { price: number; commodity: string }> => {
  const out = new Map<number, { price: number; commodity: string }>();
  for (const line of stdout.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const [account, quantity, commodity] = trimmed.split('|');
    if (!account || !quantity || !commodity) continue;
    const match = /^Probe:c(\d+)$/.exec(account);
    if (!match) continue;
    const price = Number(quantity.replace(/,/g, ''));
    if (!Number.isFinite(price)) continue;
    out.set(Number(match[1]), { price, commodity });
  }
  return out;
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run lib/prices/knownPrices.test.ts`
Expected: PASS (new `parseBaseBalance` block + all existing tests).

- [ ] **Step 5: Commit**

```bash
git add lib/prices/knownPrices.ts lib/prices/knownPrices.test.ts
git commit -m "feat(prices): add base-balance parser for currency normalization"
```

---

### Task 2: `listKnownPricesInBase` service method

**Files:**
- Modify: `lib/prices/service.ts`
- Test: `lib/prices/service.test.ts`

**Interfaces:**
- Consumes: `BALANCE_BASE_FORMAT`, `parseBaseBalance` (Task 1); existing `listKnownPrices`, `resolveBaseCurrency`, `normalizeCommoditySymbol`, `runLedgerForUser`, `this.deps.journalRepo`.
- Produces: `PriceService.listKnownPricesInBase(userId: string): Promise<KnownPrice[]>` — same row shape as `listKnownPrices`; each non-base row's `price` becomes the base-valued number with `quote === base`, or `price: null` / `quote: null` when no path exists. `date`, `ageDays`, `stale`, `source` are carried over unchanged from the raw row.

- [ ] **Step 1: Write the failing integration test**

Append to `lib/prices/service.test.ts` (uses the real ledger binary, like the existing `listKnownPrices` suite):

```typescript
describe('PriceService.listKnownPricesInBase', () => {
  let ctx: TestDbContext;
  let service: PriceService;

  beforeEach(async () => {
    ctx = await setupTestDb('prices-base-');
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

  it('values held commodities into the base via ledger cross-rate chains', async () => {
    await seedUser(
      ctx,
      'u-base',
      [
        'P 2026-07-01 DAI 1 USD',
        'P 2026-07-01 BTC 100 DAI',
        'P 2026-07-01 KIRT 2 USD',
        'P 2026-07-01 Nim 10 KIRT',
        '',
        '2026-07-02 * hold',
        '  Assets:A   1 BTC',
        '  Equity    -1 BTC',
        '',
        '2026-07-02 * hold',
        '  Assets:B   1 Nim',
        '  Equity    -1 Nim',
        '',
        '2026-07-02 * hold',
        '  Assets:E   1 XOF',
        '  Equity    -1 XOF',
        '',
        '2026-07-02 * hold',
        '  Assets:F   1 USD',
        '  Equity    -1 USD',
        '',
      ].join('\n'),
      'USD'
    );

    const rows = await service.listKnownPricesInBase('u-base');
    const bySymbol = Object.fromEntries(rows.map((r) => [r.symbol, r]));

    // BTC = 100 DAI * 1 USD/DAI = 100 USD (chained BTC->DAI->USD).
    expect(bySymbol.BTC.price).toBeCloseTo(100, 6);
    expect(bySymbol.BTC.quote).toBe('USD');
    // Provenance / recency carried over from the raw row (keep-raw).
    expect(bySymbol.BTC.source).toBe('journal');
    expect(bySymbol.BTC.date).toBe('2026-07-01');

    // Nim = 10 KIRT * 2 USD/KIRT = 20 USD (chained Nim->KIRT->USD).
    expect(bySymbol.Nim.price).toBeCloseTo(20, 6);
    expect(bySymbol.Nim.quote).toBe('USD');

    // XOF has no path to USD → no price.
    expect(bySymbol.XOF.price).toBeNull();
    expect(bySymbol.XOF.quote).toBeNull();

    // Base row untouched.
    expect(bySymbol.USD.price).toBe(1);
    expect(bySymbol.USD.source).toBe('base');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run lib/prices/service.test.ts -t listKnownPricesInBase`
Expected: FAIL — `service.listKnownPricesInBase is not a function`.

- [ ] **Step 3: Add imports**

In `lib/prices/service.ts`, extend the existing top-of-file imports:

- Add to the `./knownPrices` named import block: `BALANCE_BASE_FORMAT,` and `parseBaseBalance,`.
- Add two node imports below the existing `import path from 'path';`:

```typescript
import os from 'os';
import { randomUUID } from 'crypto';
```

- [ ] **Step 4: Implement the method**

In `lib/prices/service.ts`, add this method to the `PriceService` class, directly after `listKnownPrices` (after its closing `}` near line 458):

```typescript
  /**
   * Latest known price for every held commodity, valued into the base currency.
   * Reuses the raw rows from `listKnownPrices` for provenance and staleness,
   * then re-values each non-base holding through ledger's full price graph in a
   * single `balance -X <base>` call driven by a throwaway probe journal. A
   * holding with no conversion path to the base yields `price: null`.
   */
  async listKnownPricesInBase(userId: string): Promise<KnownPrice[]> {
    const base = await this.resolveBaseCurrency(userId);
    const raw = await this.listKnownPrices(userId);

    const toBaseRow = (row: KnownPrice): KnownPrice =>
      normalizeCommoditySymbol(row.symbol) === base
        ? row
        : { ...row, price: null, quote: null };

    // Probe only non-base commodities; reject symbols that could break the
    // throwaway journal (quotes / newlines).
    const probeSymbols = raw
      .filter(
        (row) =>
          normalizeCommoditySymbol(row.symbol) !== base &&
          !/["\n\r]/.test(row.symbol)
      )
      .map((row) => row.symbol);

    if (probeSymbols.length === 0) return raw.map(toBaseRow);

    // One balanced `1 <symbol>` transaction per commodity, indexed by position
    // so the account name carries no commodity-specific characters. Blank lines
    // separate transactions; an explicit offset balances each one.
    const journal = probeSymbols
      .map((symbol, index) => {
        const needsQuote = /[^A-Za-z0-9_]/.test(symbol);
        const amount = needsQuote ? `1 "${symbol}"` : `1 ${symbol}`;
        const offset = needsQuote ? `-1 "${symbol}"` : `-1 ${symbol}`;
        return `2000-01-01 * probe\n  Probe:c${index}    ${amount}\n  Offset:c${index}    ${offset}\n`;
      })
      .join('\n');

    const probePath = path.join(
      os.tmpdir(),
      `ledger-probe-${randomUUID()}.ledger`
    );
    try {
      await fs.writeFile(probePath, journal, 'utf-8');
      let stdout: string;
      try {
        stdout = await runLedgerForUser(
          userId,
          [
            '--file',
            probePath,
            'balance',
            '^Probe:c',
            '--flat',
            '--empty',
            '--no-total',
            '-X',
            base,
            '--format',
            BALANCE_BASE_FORMAT,
          ],
          this.deps.journalRepo
        );
      } catch {
        // Ledger failed → no valuation available; degrade to no-price rows.
        return raw.map(toBaseRow);
      }

      const valued = parseBaseBalance(stdout);
      return raw.map((row) => {
        if (normalizeCommoditySymbol(row.symbol) === base) return row;
        const index = probeSymbols.indexOf(row.symbol);
        const hit = index >= 0 ? valued.get(index) : undefined;
        return hit && hit.commodity === base
          ? { ...row, price: hit.price, quote: base }
          : { ...row, price: null, quote: null };
      });
    } finally {
      await fs.rm(probePath, { force: true }).catch(() => {});
    }
  }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run lib/prices/service.test.ts -t listKnownPricesInBase`
Expected: PASS.

- [ ] **Step 6: Run the full prices suite + type-check**

Run: `pnpm vitest run lib/prices && pnpm type-check`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/prices/service.ts lib/prices/service.test.ts
git commit -m "feat(prices): value known prices into base currency"
```

---

### Task 3: Search-param branch + toggle UI

**Files:**
- Modify: `app/prices/page.tsx`
- Modify: `features/prices/PricesTabs.tsx`
- Modify: `features/prices/KnownPricesView.tsx`

**Interfaces:**
- Consumes: `priceService.listKnownPricesInBase` (Task 2).
- Produces: `PricesTabs` gains a `baseMode: boolean` prop; `KnownPricesView` gains `baseMode: boolean` and `baseCurrency: string` props and renders the toggle.

- [ ] **Step 1: Branch the page on the search param**

Replace the whole body of `app/prices/page.tsx` with:

```tsx
import { PricesTabs } from '@/features/prices';
import { requireUser } from '@/lib/auth/require-user';
import { priceService } from '@/lib/prices';

export const dynamic = 'force-dynamic';

type SearchParams = { base?: string };

const PricesPage = async ({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) => {
  const { base } = await searchParams;
  const baseMode = base === 'usd';
  const user = await requireUser();
  const [known, prices, commodities, baseCurrency] = await Promise.all([
    baseMode
      ? priceService.listKnownPricesInBase(user.id)
      : priceService.listKnownPrices(user.id),
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
      baseMode={baseMode}
    />
  );
};

export default PricesPage;
```

- [ ] **Step 2: Thread `baseMode` through `PricesTabs`**

In `features/prices/PricesTabs.tsx`:

Add `baseMode: boolean;` to the `Props` type, add `baseMode` to the destructured params, and pass `baseMode` + `baseCurrency` into `KnownPricesView`. The `KnownPricesView` usage becomes:

```tsx
      {active === 'known' ? (
        <KnownPricesView
          rows={known}
          baseMode={baseMode}
          baseCurrency={baseCurrency}
        />
      ) : (
```

The `Props` type becomes:

```tsx
type Props = {
  known: KnownPrice[];
  prices: ManualPrice[];
  commodities: string[];
  baseCurrency: string;
  baseMode: boolean;
};
```

and the destructure:

```tsx
export const PricesTabs = ({
  known,
  prices,
  commodities,
  baseCurrency,
  baseMode,
}: Props) => {
```

- [ ] **Step 3: Render the toggle in `KnownPricesView`**

In `features/prices/KnownPricesView.tsx`:

Change the `Props` type and add a segmented control above the table. Replace the `type Props` line and the component opening through the first `<TableScroll` with:

```tsx
type Props = { rows: KnownPrice[]; baseMode: boolean; baseCurrency: string };

const segmentClass = (active: boolean): string =>
  [
    'px-3 py-1.5 font-medium transition-opacity',
    active
      ? 'bg-accent text-accent-foreground'
      : 'opacity-60 hover:opacity-100',
  ].join(' ');

export const KnownPricesView = ({ rows, baseMode, baseCurrency }: Props) => (
  <div className="space-y-3">
    <div className="flex justify-end">
      <div
        role="group"
        aria-label="Price currency"
        className="inline-flex overflow-hidden rounded-md border border-border text-sm"
      >
        <Link
          href="/prices"
          aria-current={!baseMode}
          className={segmentClass(!baseMode)}
        >
          Original quote
        </Link>
        <Link
          href="/prices?base=usd"
          aria-current={baseMode}
          className={`${segmentClass(baseMode)} border-l border-border`}
        >
          In {baseCurrency}
        </Link>
      </div>
    </div>
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <TableScroll bleed={false}>
```

Then close the extra wrapping `<div>`: change the component's final `</div>` region. The existing tail is:

```tsx
      </table>
    </TableScroll>
  </div>
);
```

Replace it with:

```tsx
      </table>
    </TableScroll>
    </div>
  </div>
);
```

(The `Link` import already exists at the top of the file.)

- [ ] **Step 4: Type-check and lint**

Run: `pnpm type-check && pnpm lint`
Expected: PASS, no errors.

- [ ] **Step 5: Manual verification in the dev server**

Run: `pnpm dev` and open `http://localhost:3000/prices`.
Verify:
- Toggle shows two segments; "Original quote" active by default; table matches today's behavior (mixed quotes: BTC in DAI, Nim in KIRT).
- Click "In USD" → URL becomes `/prices?base=usd`; every priced row now reads `… USD`; commodities with no USD path read "no price"; Date / Age / Source columns unchanged.
- Click "Original quote" → returns to mixed-quote view.

- [ ] **Step 6: Commit**

```bash
git add app/prices/page.tsx features/prices/PricesTabs.tsx features/prices/KnownPricesView.tsx
git commit -m "feat(prices): toggle known prices between original quote and base currency"
```

---

## Notes / Known trade-offs

- Switching the toggle is a full server navigation; it resets the client-side tab state to "Known prices". Acceptable — the toggle only appears on that tab and it is the default.
- USD-mode Date / Age / Source are carried from the underlying primary price (keep-raw), so a USD value derived from a stale price is still flagged stale.
- `listKnownPricesInBase` issues exactly one extra ledger subprocess beyond `listKnownPrices`; the per-commodity fan-out bound (`PRICE_HISTORY_CONCURRENCY`) is unchanged.

## Self-review

- **Spec coverage:** toggle (Task 3); USD valuation via probe-journal balance (Task 2); parser + format constant (Task 1); keep-raw columns (Task 2 merge + Task 3 leaves columns intact); no-USD-path → "no price" (Task 2 + existing `KnownPricesView` null handling); default `force-dynamic` retained (Task 3).
- **Placeholder scan:** none — every step carries concrete code/commands.
- **Type consistency:** `BALANCE_BASE_FORMAT` / `parseBaseBalance` signatures identical across Tasks 1–2; `baseMode: boolean` and `baseCurrency: string` prop names identical across page → `PricesTabs` → `KnownPricesView`.
