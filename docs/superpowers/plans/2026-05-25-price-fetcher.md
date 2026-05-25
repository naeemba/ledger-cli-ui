# Daily Price Fetcher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a centralized daily price fetcher that populates a shared SQLite cache from cryptocompare and projects each user's `price-db.ledger` from it.

**Architecture:** New `lib/prices/` module (Repository + Service + provider + formatter + scheduler) following the project's existing `lib/journal/` and `lib/templates/` shape. SQLite tables `commodity_price` and `price_fetch_run` are the source of truth; per-user `price-db.ledger` files are deterministic projections rewritten atomically on every refresh. An in-process `node-cron` registered from `instrumentation.ts` runs daily; a manual button on the Portfolio page triggers the same code path, coalesced by a module-level lock.

**Tech Stack:** Next.js 16 (App Router), Drizzle ORM + better-sqlite3, Vitest, node-cron, shadcn/ui, sonner. Spec: `docs/superpowers/specs/2026-05-25-price-fetcher-design.md`.

---

## File structure

```
db/schema/
  commodityPrice.ts                                NEW
  priceFetchRun.ts                                 NEW
  index.ts                                         MODIFY (add exports)

lib/prices/
  provider.ts        + provider.test.ts            NEW
  symbols.ts         + symbols.test.ts             NEW
  formatter.ts       + formatter.test.ts           NEW
  migration.ts       + migration.test.ts           NEW
  repository.ts      + repository.test.ts          NEW
  lock.ts            + lock.test.ts                NEW
  service.ts         + service.test.ts             NEW
  scheduler.ts                                     NEW (no test — wiring)
  index.ts                                         NEW (module surface)

lib/env/index.ts                                   MODIFY (2 env vars)
lib/test-utils/db.ts                               MODIFY (env defaults for cron-off)
utils/formatDate.ts                                MODIFY (add formatLedgerDateTime)
utils/runLedgerForUser.ts + .test.ts               NEW (request-free ledger shell-out)

instrumentation.ts                                 NEW (Next.js startup hook, repo root)

features/portfolio/
  Portfolio.tsx                                    MODIFY (mount status strip)
  PriceStatus.tsx                                  NEW (server)
  RefreshPricesButton.tsx                          NEW (client)
  actions/refreshPrices.ts                         NEW (server action)

.env.example                                       MODIFY
package.json                                       MODIFY (node-cron dep)
PLAN.md                                            MODIFY (Phase 6 entry)
```

Tasks in execution order:

1. Foundation: deps + env + `formatLedgerDateTime` + `runLedgerForUser`
2. Pure modules: symbols, formatter, migration, lock
3. Provider (HTTP, mockable)
4. Schema + db:push + test-utils env tweak
5. Repository
6. Service + module surface
7. Scheduler + instrumentation
8. Server action + UI components + Portfolio mount
9. Docs + manual smoke test

---

## Task 1: Add `node-cron` dependency and env vars

**Files:**
- Modify: `package.json`
- Modify: `lib/env/index.ts`
- Modify: `.env.example`
- Modify: `lib/test-utils/db.ts` (set `PRICE_REFRESH_ENABLED=false` so test runs never start the cron)

- [ ] **Step 1: Install `node-cron`**

Run:
```bash
pnpm add node-cron && pnpm add -D @types/node-cron
```
Expected: both packages added to `package.json` under `dependencies` / `devDependencies` respectively.

- [ ] **Step 2: Extend the env schema**

In `lib/env/index.ts`, inside the `envSchema = clientEnvSchema.extend({ … })` object, add (after `PORTFOLIO_ACCOUNT_PREFIX`):

```ts
  // Prices
  PRICE_REFRESH_HOUR: z.coerce.number().int().min(0).max(23).default(6),
  PRICE_REFRESH_ENABLED: z
    .union([z.literal('true'), z.literal('false')])
    .default('true')
    .transform((v) => v === 'true'),
```

- [ ] **Step 3: Document the env vars**

Append to `.env.example`:

```
# === Prices =================================================================
# Hour-of-day (server-local) when the price-fetch cron runs. 0-23.
PRICE_REFRESH_HOUR=6

# Set to 'false' to disable the in-process cron entirely (useful for tests
# or external schedulers).
PRICE_REFRESH_ENABLED=true
```

- [ ] **Step 4: Disable cron during tests**

In `lib/test-utils/db.ts`, inside `setupTestDb` after the existing `process.env.BETTER_AUTH_SECRET = …` line, add:

```ts
  process.env.PRICE_REFRESH_ENABLED = 'false';
```

- [ ] **Step 5: Verify type-check passes**

Run: `pnpm type-check`
Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml lib/env/index.ts .env.example lib/test-utils/db.ts
git commit -m "feat(prices): add node-cron dependency and PRICE_REFRESH_* env vars"
```

---

## Task 2: Add `formatLedgerDateTime` helper

**Files:**
- Modify: `utils/formatDate.ts`
- Test: `utils/formatLedgerDateTime.test.ts`

- [ ] **Step 1: Write the failing test**

Create `utils/formatLedgerDateTime.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { formatLedgerDateTime } from './formatDate';

describe('formatLedgerDateTime', () => {
  it('formats a Date as YYYY/MM/DD HH:MM:SS in UTC', () => {
    const d = new Date('2026-05-25T06:07:08.000Z');
    expect(formatLedgerDateTime(d)).toBe('2026/05/25 06:07:08');
  });

  it('zero-pads single-digit components', () => {
    const d = new Date('2026-01-02T03:04:05.000Z');
    expect(formatLedgerDateTime(d)).toBe('2026/01/02 03:04:05');
  });

  it('handles end-of-year boundary', () => {
    const d = new Date('2026-12-31T23:59:59.000Z');
    expect(formatLedgerDateTime(d)).toBe('2026/12/31 23:59:59');
  });
});
```

- [ ] **Step 2: Run test to confirm failure**

Run: `pnpm exec vitest run utils/formatLedgerDateTime.test.ts`
Expected: FAIL — `formatLedgerDateTime is not a function` (or import error).

- [ ] **Step 3: Implement the helper**

Append to `utils/formatDate.ts`:

```ts
const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Format a Date as ledger's `P` directive timestamp: `YYYY/MM/DD HH:MM:SS`
 * in UTC. Stable across server timezones so price-db files diff cleanly.
 */
export const formatLedgerDateTime = (d: Date): string => {
  return (
    `${d.getUTCFullYear()}/${pad(d.getUTCMonth() + 1)}/${pad(d.getUTCDate())} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`
  );
};
```

- [ ] **Step 4: Run test to confirm it passes**

Run: `pnpm exec vitest run utils/formatLedgerDateTime.test.ts`
Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add utils/formatDate.ts utils/formatLedgerDateTime.test.ts
git commit -m "feat(utils): formatLedgerDateTime for price-db P directives"
```

---

## Task 3: Add `runLedgerForUser` (request-free ledger shell-out)

The existing `utils/runLedger.ts` reads `requireUser()` and `connection()`, so it can't be called from the cron context. Build a lower-level helper the cron and the existing `runLedger` can both share.

**Files:**
- Create: `utils/runLedgerForUser.ts`
- Test: `utils/runLedgerForUser.test.ts`

- [ ] **Step 1: Write the failing test**

Create `utils/runLedgerForUser.test.ts`:

```ts
import { promises as fs } from 'fs';
import path from 'path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '@/db/schema';
import {
  setupTestDb,
  teardownTestDb,
  type TestDbContext,
} from '@/lib/test-utils/db';
import { runLedgerForUser } from './runLedgerForUser';
import { getJournalDir } from '@/lib/journal/layout';

describe('runLedgerForUser', () => {
  let ctx: TestDbContext;

  beforeEach(async () => {
    ctx = await setupTestDb('runledger-');
    ctx.sqlite
      .prepare(`INSERT INTO "user" ("id","name","email") VALUES (?,?,?)`)
      .run('u1', 'U', 'u1@example.com');
    const dir = getJournalDir('u1');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, 'main.ledger'),
      '2026/01/01 Lunch\n  Expenses:Food  10 USD\n  Assets:Cash\n',
      'utf-8'
    );
    drizzle(ctx.sqlite, { schema });
  });

  afterEach(async () => {
    await teardownTestDb(ctx);
  });

  it('runs ledger commodities against the user main file', async () => {
    const stdout = await runLedgerForUser('u1', ['commodities']);
    expect(stdout).toContain('USD');
  });

  it('omits --price-db when no price-db.ledger exists', async () => {
    const stdout = await runLedgerForUser('u1', ['stats']);
    expect(stdout).toContain('Transactions found');
  });
});
```

- [ ] **Step 2: Run test to confirm failure**

Run: `pnpm exec vitest run utils/runLedgerForUser.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `utils/runLedgerForUser.ts`:

```ts
import { execFile } from 'child_process';
import { promisify } from 'util';
import 'server-only';
import { journalRepository } from '@/lib/journal';

const execFilePromise = promisify(execFile);

/**
 * Shell out to `ledger` for a specific user without depending on a request
 * context. The request-scoped `runLedger` should be preferred for page
 * renders; this helper exists for background jobs (cron, scheduler).
 *
 * No caching — callers should be infrequent (daily cron). Pass `--sort -date`
 * yourself if needed.
 */
export const runLedgerForUser = async (
  userId: string,
  args: string[]
): Promise<string> => {
  const { mainPath, priceDbPath } = await journalRepository.ensureLayout(
    userId
  );
  const baseArgs: string[] = ['--file', mainPath];
  if (priceDbPath) baseArgs.push('--price-db', priceDbPath);
  const { stdout } = await execFilePromise('ledger', [...baseArgs, ...args]);
  return stdout;
};
```

- [ ] **Step 4: Run test to confirm it passes**

Run: `pnpm exec vitest run utils/runLedgerForUser.test.ts`
Expected: 2 tests pass. (Requires `ledger` on PATH; same precondition as other tests in this repo.)

- [ ] **Step 5: Commit**

```bash
git add utils/runLedgerForUser.ts utils/runLedgerForUser.test.ts
git commit -m "feat(utils): runLedgerForUser for request-free ledger shell-out"
```

---

## Task 4: `lib/prices/symbols.ts` — `normalizeCommoditySymbol`

**Files:**
- Create: `lib/prices/symbols.ts`
- Test: `lib/prices/symbols.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/prices/symbols.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { normalizeCommoditySymbol } from './symbols';

describe('normalizeCommoditySymbol', () => {
  it('returns the uppercase symbol unchanged', () => {
    expect(normalizeCommoditySymbol('BTC')).toBe('BTC');
    expect(normalizeCommoditySymbol('btc')).toBe('BTC');
  });

  it('strips one pair of surrounding single quotes', () => {
    expect(normalizeCommoditySymbol("'1INCH'")).toBe('1INCH');
  });

  it('strips one pair of surrounding double quotes', () => {
    expect(normalizeCommoditySymbol('"1INCH"')).toBe('1INCH');
  });

  it('maps $ to USD', () => {
    expect(normalizeCommoditySymbol('$')).toBe('USD');
  });

  it('returns null for whitespace-containing names', () => {
    expect(normalizeCommoditySymbol('My Stock')).toBeNull();
    expect(normalizeCommoditySymbol('"My Stock"')).toBeNull();
  });

  it('returns null for empty / whitespace-only input', () => {
    expect(normalizeCommoditySymbol('')).toBeNull();
    expect(normalizeCommoditySymbol('   ')).toBeNull();
    expect(normalizeCommoditySymbol('""')).toBeNull();
  });

  it('returns null for non-alphanumeric characters', () => {
    expect(normalizeCommoditySymbol('BTC/USD')).toBeNull();
    expect(normalizeCommoditySymbol('B-T-C')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to confirm failure**

Run: `pnpm exec vitest run lib/prices/symbols.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `lib/prices/symbols.ts`:

```ts
/**
 * Normalize a raw commodity name from `ledger commodities` into a
 * cryptocompare-compatible symbol. Returns null for anything the provider
 * won't recognize (whitespace, slashes, hyphens, empty strings).
 */
export const normalizeCommoditySymbol = (raw: string): string | null => {
  let s = raw.trim();
  if (
    s.length >= 2 &&
    ((s.startsWith("'") && s.endsWith("'")) ||
      (s.startsWith('"') && s.endsWith('"')))
  ) {
    s = s.slice(1, -1).trim();
  }
  if (!s) return null;
  if (s === '$') return 'USD';
  if (!/^[A-Za-z0-9]+$/.test(s)) return null;
  return s.toUpperCase();
};
```

- [ ] **Step 4: Run test to confirm it passes**

Run: `pnpm exec vitest run lib/prices/symbols.test.ts`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/prices/symbols.ts lib/prices/symbols.test.ts
git commit -m "feat(prices): normalizeCommoditySymbol"
```

---

## Task 5: `lib/prices/formatter.ts` — `renderPriceDb` + `hasGeneratedBanner`

**Files:**
- Create: `lib/prices/formatter.ts`
- Test: `lib/prices/formatter.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/prices/formatter.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { renderPriceDb, hasGeneratedBanner, BANNER_MARKER } from './formatter';

const sampleRows = [
  {
    id: 1,
    symbol: 'BTC',
    quote: 'EUR',
    price: 67234.12,
    fetchedAt: new Date('2026-05-25T06:00:00.000Z'),
    fetchedDate: '2026-05-25',
  },
  {
    id: 2,
    symbol: 'ADA',
    quote: 'EUR',
    price: 0.41,
    fetchedAt: new Date('2026-05-25T06:00:00.000Z'),
    fetchedDate: '2026-05-25',
  },
];

describe('renderPriceDb', () => {
  it('emits the AUTO-GENERATED banner', () => {
    const out = renderPriceDb(sampleRows);
    expect(out).toContain(BANNER_MARKER);
    expect(out).toContain('Do not edit by hand');
  });

  it('emits one P line per row', () => {
    const out = renderPriceDb(sampleRows);
    expect(out).toContain('P 2026/05/25 06:00:00 BTC 67234.12 EUR');
    expect(out).toContain('P 2026/05/25 06:00:00 ADA 0.41 EUR');
  });

  it('ends with a trailing newline', () => {
    const out = renderPriceDb(sampleRows);
    expect(out.endsWith('\n')).toBe(true);
  });

  it('emits banner-only output for empty input', () => {
    const out = renderPriceDb([]);
    expect(out).toContain(BANNER_MARKER);
    expect(out).not.toMatch(/^P /m);
  });
});

describe('hasGeneratedBanner', () => {
  it('returns true when the marker is present', () => {
    expect(hasGeneratedBanner(renderPriceDb(sampleRows))).toBe(true);
  });

  it('returns false for arbitrary text', () => {
    expect(hasGeneratedBanner('P 2026/01/01 BTC 50000 USD')).toBe(false);
    expect(hasGeneratedBanner('')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to confirm failure**

Run: `pnpm exec vitest run lib/prices/formatter.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `lib/prices/formatter.ts`:

```ts
import { formatLedgerDateTime } from '@/utils/formatDate';

export type CommodityPriceRow = {
  id?: number;
  symbol: string;
  quote: string;
  price: number;
  fetchedAt: Date;
  fetchedDate: string;
};

export const BANNER_MARKER = 'AUTO-GENERATED by ledger-cli-ui';

const BANNER = [
  `; ${BANNER_MARKER} price fetcher.`,
  '; Do not edit by hand — this file is overwritten on every refresh.',
  '; Manual price overrides belong in your main journal.',
].join('\n');

export const renderPriceDb = (rows: CommodityPriceRow[]): string => {
  const generatedAt = `; Last regenerated: ${new Date().toISOString()}`;
  const lines = rows.map(
    (r) =>
      `P ${formatLedgerDateTime(r.fetchedAt)} ${r.symbol} ${r.price} ${r.quote}`
  );
  return [BANNER, generatedAt, '', ...lines, ''].join('\n');
};

export const hasGeneratedBanner = (text: string): boolean =>
  text.includes(BANNER_MARKER);
```

- [ ] **Step 4: Run test to confirm it passes**

Run: `pnpm exec vitest run lib/prices/formatter.test.ts`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/prices/formatter.ts lib/prices/formatter.test.ts
git commit -m "feat(prices): renderPriceDb + hasGeneratedBanner"
```

---

## Task 6: `lib/prices/migration.ts` — `parseLegacyPriceDb`

**Files:**
- Create: `lib/prices/migration.ts`
- Test: `lib/prices/migration.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/prices/migration.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseLegacyPriceDb } from './migration';

describe('parseLegacyPriceDb', () => {
  it('parses P lines with date + time', () => {
    const out = parseLegacyPriceDb('P 2026/05/25 06:00:00 BTC 67000.5 USD\n');
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      symbol: 'BTC',
      quote: 'USD',
      price: 67000.5,
      fetchedDate: '2026-05-25',
    });
    expect(out[0].fetchedAt.toISOString()).toMatch(/^2026-05-25T/);
  });

  it('parses P lines without time', () => {
    const out = parseLegacyPriceDb('P 2026/05/25 BTC 67000.5 USD\n');
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      symbol: 'BTC',
      quote: 'USD',
      price: 67000.5,
    });
  });

  it('parses dashed dates (2026-05-25)', () => {
    const out = parseLegacyPriceDb('P 2026-05-25 BTC 67000 USD\n');
    expect(out).toHaveLength(1);
    expect(out[0].fetchedDate).toBe('2026-05-25');
  });

  it('skips comments and blank lines', () => {
    const text = [
      '; a comment',
      '',
      'P 2026/05/25 BTC 67000 USD',
      '   ; indented comment',
    ].join('\n');
    expect(parseLegacyPriceDb(text)).toHaveLength(1);
  });

  it('skips malformed lines', () => {
    const text = ['P malformed', 'P 2026/05/25 BTC', 'random text'].join('\n');
    expect(parseLegacyPriceDb(text)).toHaveLength(0);
  });

  it('handles multiple lines in order', () => {
    const text = [
      'P 2026/05/24 BTC 65000 USD',
      'P 2026/05/25 BTC 67000 USD',
    ].join('\n');
    const out = parseLegacyPriceDb(text);
    expect(out.map((r) => r.fetchedDate)).toEqual(['2026-05-24', '2026-05-25']);
  });
});
```

- [ ] **Step 2: Run test to confirm failure**

Run: `pnpm exec vitest run lib/prices/migration.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `lib/prices/migration.ts`:

```ts
import type { CommodityPriceRow } from './formatter';

const LINE_RE =
  /^P\s+(\d{4})[/-](\d{2})[/-](\d{2})(?:\s+(\d{2}):(\d{2}):(\d{2}))?\s+(\S+)\s+([0-9.]+)\s+(\S+)\s*$/;

/**
 * Best-effort parse of a pre-existing price-db.ledger. Returns one row per
 * recognized `P` directive; silently skips comments, blank lines, and
 * malformed entries. Caller is responsible for upserting into commodity_price.
 */
export const parseLegacyPriceDb = (
  text: string
): Omit<CommodityPriceRow, 'id'>[] => {
  const out: Omit<CommodityPriceRow, 'id'>[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith(';')) continue;
    const m = LINE_RE.exec(line);
    if (!m) continue;
    const [, y, mo, d, hh = '00', mm = '00', ss = '00', symbol, priceStr, quote] = m;
    const price = Number(priceStr);
    if (!Number.isFinite(price)) continue;
    const fetchedAt = new Date(
      Date.UTC(
        Number(y),
        Number(mo) - 1,
        Number(d),
        Number(hh),
        Number(mm),
        Number(ss)
      )
    );
    out.push({
      symbol,
      quote,
      price,
      fetchedAt,
      fetchedDate: `${y}-${mo}-${d}`,
    });
  }
  return out;
};
```

- [ ] **Step 4: Run test to confirm it passes**

Run: `pnpm exec vitest run lib/prices/migration.test.ts`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/prices/migration.ts lib/prices/migration.test.ts
git commit -m "feat(prices): parseLegacyPriceDb for one-time import"
```

---

## Task 7: `lib/prices/lock.ts` — `withPriceLock`

**Files:**
- Create: `lib/prices/lock.ts`
- Test: `lib/prices/lock.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/prices/lock.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { withPriceLock, __resetPriceLockForTests } from './lock';

describe('withPriceLock', () => {
  it('runs the function and returns its result', async () => {
    __resetPriceLockForTests();
    const result = await withPriceLock(async () => 'ok' as const);
    expect(result).toBe('ok');
  });

  it('coalesces concurrent calls into a single in-flight promise', async () => {
    __resetPriceLockForTests();
    let calls = 0;
    let release: (v: string) => void = () => {};
    const gate = new Promise<string>((r) => {
      release = r;
    });
    const fn = async () => {
      calls += 1;
      return gate;
    };

    const a = withPriceLock(fn);
    const b = withPriceLock(fn);
    release('done');
    expect(await a).toBe('done');
    expect(await b).toBe('done');
    expect(calls).toBe(1);
  });

  it('allows a new call after the previous one settles', async () => {
    __resetPriceLockForTests();
    let calls = 0;
    const fn = async () => {
      calls += 1;
      return 'x';
    };
    await withPriceLock(fn);
    await withPriceLock(fn);
    expect(calls).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to confirm failure**

Run: `pnpm exec vitest run lib/prices/lock.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `lib/prices/lock.ts`:

```ts
let inflight: Promise<unknown> | null = null;

/**
 * Coalesce concurrent refresh calls. Second caller while one is in flight
 * gets the same promise — one fetch, one set of side effects. The slot
 * clears on settle (success or failure) so the next caller starts fresh.
 */
export const withPriceLock = <T>(fn: () => Promise<T>): Promise<T> => {
  if (inflight) return inflight as Promise<T>;
  const p = fn().finally(() => {
    if (inflight === p) inflight = null;
  });
  inflight = p;
  return p;
};

/** Test-only: clear the in-flight slot between tests. */
export const __resetPriceLockForTests = (): void => {
  inflight = null;
};
```

- [ ] **Step 4: Run test to confirm it passes**

Run: `pnpm exec vitest run lib/prices/lock.test.ts`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/prices/lock.ts lib/prices/lock.test.ts
git commit -m "feat(prices): withPriceLock for concurrent-refresh coalescing"
```

---

## Task 8: `lib/prices/provider.ts` — `fetchPrices`

**Files:**
- Create: `lib/prices/provider.ts`
- Test: `lib/prices/provider.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/prices/provider.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { fetchPrices } from './provider';

const json = (body: unknown, status = 200): Response =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body } as Response);

describe('fetchPrices', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-25T06:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('returns a flat list of quotes from a pricemulti response', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(json({ BTC: { USD: 67000 }, ADA: { USD: 0.41 } }));

    const result = await fetchPrices([
      { symbol: 'BTC', quote: 'USD' },
      { symbol: 'ADA', quote: 'USD' },
    ]);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(result.quotes).toEqual([
      { symbol: 'BTC', quote: 'USD', price: 67000, fetchedAt: expect.any(Date) },
      { symbol: 'ADA', quote: 'USD', price: 0.41, fetchedAt: expect.any(Date) },
    ]);
    expect(result.failed).toEqual([]);
  });

  it('groups pairs by quote and makes one request per quote group', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (url: any) => {
        const u = String(url);
        if (u.includes('tsyms=USD'))
          return json({ BTC: { USD: 67000 } });
        if (u.includes('tsyms=EUR'))
          return json({ ADA: { EUR: 0.38 } });
        throw new Error('unexpected URL ' + u);
      });

    const result = await fetchPrices([
      { symbol: 'BTC', quote: 'USD' },
      { symbol: 'ADA', quote: 'EUR' },
    ]);

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(result.quotes).toHaveLength(2);
  });

  it('puts missing symbols into the failed list', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      json({ BTC: { USD: 67000 } })
    );

    const result = await fetchPrices([
      { symbol: 'BTC', quote: 'USD' },
      { symbol: 'UNKNOWN', quote: 'USD' },
    ]);

    expect(result.quotes).toHaveLength(1);
    expect(result.failed).toEqual([{ symbol: 'UNKNOWN', quote: 'USD' }]);
  });

  it('retries once on 429', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json({}, 429))
      .mockResolvedValueOnce(json({ BTC: { USD: 67000 } }));

    const result = await fetchPrices([{ symbol: 'BTC', quote: 'USD' }]);

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(result.quotes).toHaveLength(1);
  });

  it('returns empty result for empty input without calling fetch', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const result = await fetchPrices([]);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.quotes).toEqual([]);
    expect(result.failed).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to confirm failure**

Run: `pnpm exec vitest run lib/prices/provider.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `lib/prices/provider.ts`:

```ts
export type QuotePair = { symbol: string; quote: string };
export type PriceQuote = QuotePair & { price: number; fetchedAt: Date };

export type ProviderResult = {
  quotes: PriceQuote[];
  failed: QuotePair[];
};

const ENDPOINT = 'https://min-api.cryptocompare.com/data/pricemulti';
const MAX_URL_LENGTH = 2000;
const TIMEOUT_MS = 10_000;

type CryptoCompareResponse = Record<string, Record<string, number>>;

const sleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

/**
 * Batch-fetch prices from cryptocompare's pricemulti endpoint. Groups input
 * pairs by quote currency, then issues one request per group (splitting
 * further if the URL would exceed 2KB). One retry on 429 / 5xx.
 *
 * No DB, no fs — pure HTTP + parsing. The same `fetchedAt` Date is attached
 * to every quote in a single call so the caller can use it as the
 * upsert-dedupe key.
 */
export const fetchPrices = async (
  pairs: QuotePair[],
  opts?: { signal?: AbortSignal }
): Promise<ProviderResult> => {
  if (pairs.length === 0) return { quotes: [], failed: [] };

  const fetchedAt = new Date();
  const byQuote = new Map<string, Set<string>>();
  for (const p of pairs) {
    if (!byQuote.has(p.quote)) byQuote.set(p.quote, new Set());
    byQuote.get(p.quote)!.add(p.symbol);
  }

  const quotes: PriceQuote[] = [];
  const found = new Set<string>(); // `${symbol}|${quote}` of resolved pairs

  for (const [quote, symbolSet] of byQuote) {
    for (const fsymsChunk of chunkSymbols(Array.from(symbolSet), quote)) {
      const url = `${ENDPOINT}?fsyms=${encodeURIComponent(fsymsChunk.join(','))}&tsyms=${encodeURIComponent(quote)}`;
      const body = await fetchWithRetry(url, opts?.signal);
      for (const symbol of fsymsChunk) {
        const price = body?.[symbol]?.[quote];
        if (typeof price === 'number' && Number.isFinite(price)) {
          quotes.push({ symbol, quote, price, fetchedAt });
          found.add(`${symbol}|${quote}`);
        }
      }
    }
  }

  const failed = pairs.filter((p) => !found.has(`${p.symbol}|${p.quote}`));
  return { quotes, failed };
};

const chunkSymbols = (symbols: string[], quote: string): string[][] => {
  const overhead =
    ENDPOINT.length + '?fsyms=&tsyms='.length + encodeURIComponent(quote).length;
  const budget = MAX_URL_LENGTH - overhead;
  const chunks: string[][] = [];
  let current: string[] = [];
  let len = 0;
  for (const s of symbols) {
    const add = (current.length === 0 ? 0 : 1) + encodeURIComponent(s).length;
    if (len + add > budget && current.length > 0) {
      chunks.push(current);
      current = [];
      len = 0;
    }
    current.push(s);
    len += add;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
};

const fetchWithRetry = async (
  url: string,
  signal: AbortSignal | undefined
): Promise<CryptoCompareResponse | null> => {
  for (let attempt = 0; attempt < 2; attempt++) {
    const timeout = AbortSignal.timeout(TIMEOUT_MS);
    const merged = signal ? AbortSignal.any([signal, timeout]) : timeout;
    try {
      const res = await fetch(url, { signal: merged });
      if (res.ok) return (await res.json()) as CryptoCompareResponse;
      if (res.status === 429 || (res.status >= 500 && res.status < 600)) {
        if (attempt === 0) {
          await sleep(1000);
          continue;
        }
      }
      return null;
    } catch (err) {
      if (attempt === 0) {
        await sleep(1000);
        continue;
      }
      throw err;
    }
  }
  return null;
};
```

- [ ] **Step 4: Run test to confirm it passes**

Run: `pnpm exec vitest run lib/prices/provider.test.ts`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/prices/provider.ts lib/prices/provider.test.ts
git commit -m "feat(prices): fetchPrices provider (cryptocompare pricemulti)"
```

---

## Task 9: Schema — `commodity_price` and `price_fetch_run`

**Files:**
- Create: `db/schema/commodityPrice.ts`
- Create: `db/schema/priceFetchRun.ts`
- Modify: `db/schema/index.ts`

- [ ] **Step 1: Create `commodityPrice.ts`**

Create `db/schema/commodityPrice.ts`:

```ts
import {
  integer,
  real,
  sqliteTable,
  text,
  unique,
} from 'drizzle-orm/sqlite-core';

export const commodityPrice = sqliteTable(
  'commodity_price',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    symbol: text('symbol').notNull(),
    quote: text('quote').notNull(),
    price: real('price').notNull(),
    fetchedAt: integer('fetched_at', { mode: 'timestamp' }).notNull(),
    fetchedDate: text('fetched_date').notNull(),
  },
  (t) => [
    unique('commodity_price_unique_per_day').on(
      t.symbol,
      t.quote,
      t.fetchedDate
    ),
  ]
);

export type CommodityPrice = typeof commodityPrice.$inferSelect;
```

- [ ] **Step 2: Create `priceFetchRun.ts`**

Create `db/schema/priceFetchRun.ts`:

```ts
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const priceFetchRun = sqliteTable('price_fetch_run', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  startedAt: integer('started_at', { mode: 'timestamp' }).notNull(),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
  status: text('status', { enum: ['success', 'partial', 'failed'] }).notNull(),
  symbolsFetched: integer('symbols_fetched').notNull().default(0),
  symbolsFailed: integer('symbols_failed').notNull().default(0),
  errorMessage: text('error_message'),
});

export type PriceFetchRun = typeof priceFetchRun.$inferSelect;
```

- [ ] **Step 3: Re-export both from the schema index**

Edit `db/schema/index.ts` — add (sorted alphabetically with the existing exports):

```ts
export { commodityPrice } from './commodityPrice';
export { priceFetchRun } from './priceFetchRun';
```

So the file becomes:

```ts
export { account } from './account';
export { commodityPrice } from './commodityPrice';
export { passkey } from './passkey';
export { priceFetchRun } from './priceFetchRun';
export { session } from './session';
export { template } from './template';
export { user } from './user';
export { userSetting } from './userSetting';
export { verification } from './verification';
```

- [ ] **Step 4: Push the schema to the dev database**

Run: `pnpm db:push`
Expected: drizzle-kit applies the additive change and reports the new tables created.

- [ ] **Step 5: Verify type-check**

Run: `pnpm type-check`
Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add db/schema/commodityPrice.ts db/schema/priceFetchRun.ts db/schema/index.ts
git commit -m "feat(db): commodity_price and price_fetch_run tables"
```

---

## Task 10: `lib/prices/repository.ts` — `CommodityPriceRepository` + `PriceFetchRunRepository`

**Files:**
- Create: `lib/prices/repository.ts`
- Test: `lib/prices/repository.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/prices/repository.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '@/db/schema';
import {
  setupTestDb,
  teardownTestDb,
  type TestDbContext,
} from '@/lib/test-utils/db';
import {
  CommodityPriceRepository,
  PriceFetchRunRepository,
} from './repository';

const PRICE_TABLE = `
  CREATE TABLE IF NOT EXISTS "commodity_price" (
    "id" integer PRIMARY KEY AUTOINCREMENT,
    "symbol" text NOT NULL,
    "quote" text NOT NULL,
    "price" real NOT NULL,
    "fetched_at" integer NOT NULL,
    "fetched_date" text NOT NULL,
    CONSTRAINT "commodity_price_unique_per_day" UNIQUE ("symbol","quote","fetched_date")
  );
`;

const RUN_TABLE = `
  CREATE TABLE IF NOT EXISTS "price_fetch_run" (
    "id" integer PRIMARY KEY AUTOINCREMENT,
    "started_at" integer NOT NULL,
    "completed_at" integer,
    "status" text NOT NULL,
    "symbols_fetched" integer NOT NULL DEFAULT 0,
    "symbols_failed" integer NOT NULL DEFAULT 0,
    "error_message" text
  );
`;

describe('CommodityPriceRepository', () => {
  let ctx: TestDbContext;
  let repo: CommodityPriceRepository;

  beforeEach(async () => {
    ctx = await setupTestDb('prices-repo-');
    ctx.sqlite.exec(PRICE_TABLE);
    repo = new CommodityPriceRepository(drizzle(ctx.sqlite, { schema }));
  });

  afterEach(async () => {
    await teardownTestDb(ctx);
  });

  it('inserts new rows', async () => {
    const fetchedAt = new Date('2026-05-25T06:00:00Z');
    await repo.insert([
      { symbol: 'BTC', quote: 'EUR', price: 60000, fetchedAt, fetchedDate: '2026-05-25' },
    ]);
    const rows = await repo.listForQuote('EUR');
    expect(rows).toHaveLength(1);
    expect(rows[0].price).toBe(60000);
  });

  it('upserts on (symbol, quote, fetched_date) conflict', async () => {
    const fetchedAt = new Date('2026-05-25T06:00:00Z');
    await repo.insert([
      { symbol: 'BTC', quote: 'EUR', price: 60000, fetchedAt, fetchedDate: '2026-05-25' },
    ]);
    await repo.insert([
      { symbol: 'BTC', quote: 'EUR', price: 61000, fetchedAt, fetchedDate: '2026-05-25' },
    ]);
    const rows = await repo.listForQuote('EUR');
    expect(rows).toHaveLength(1);
    expect(rows[0].price).toBe(61000);
  });

  it('returns rows ordered by fetchedAt ascending', async () => {
    const day1 = new Date('2026-05-24T06:00:00Z');
    const day2 = new Date('2026-05-25T06:00:00Z');
    await repo.insert([
      { symbol: 'BTC', quote: 'USD', price: 61000, fetchedAt: day2, fetchedDate: '2026-05-25' },
      { symbol: 'BTC', quote: 'USD', price: 60000, fetchedAt: day1, fetchedDate: '2026-05-24' },
    ]);
    const rows = await repo.listForQuote('USD');
    expect(rows.map((r) => r.fetchedDate)).toEqual(['2026-05-24', '2026-05-25']);
  });

  it('listForQuote filters by quote currency', async () => {
    const at = new Date('2026-05-25T06:00:00Z');
    await repo.insert([
      { symbol: 'BTC', quote: 'USD', price: 67000, fetchedAt: at, fetchedDate: '2026-05-25' },
      { symbol: 'BTC', quote: 'EUR', price: 60000, fetchedAt: at, fetchedDate: '2026-05-25' },
    ]);
    expect((await repo.listForQuote('USD'))).toHaveLength(1);
    expect((await repo.listForQuote('EUR'))).toHaveLength(1);
  });
});

describe('PriceFetchRunRepository', () => {
  let ctx: TestDbContext;
  let repo: PriceFetchRunRepository;

  beforeEach(async () => {
    ctx = await setupTestDb('runs-repo-');
    ctx.sqlite.exec(RUN_TABLE);
    repo = new PriceFetchRunRepository(drizzle(ctx.sqlite, { schema }));
  });

  afterEach(async () => {
    await teardownTestDb(ctx);
  });

  it('insert returns the inserted row with id', async () => {
    const row = await repo.insert({
      startedAt: new Date('2026-05-25T06:00:00Z'),
      status: 'success',
    });
    expect(row.id).toBeGreaterThan(0);
    expect(row.status).toBe('success');
  });

  it('update mutates an existing run row', async () => {
    const row = await repo.insert({
      startedAt: new Date('2026-05-25T06:00:00Z'),
      status: 'success',
    });
    await repo.update(row.id, {
      completedAt: new Date('2026-05-25T06:00:05Z'),
      status: 'partial',
      symbolsFetched: 5,
      symbolsFailed: 1,
      errorMessage: 'NOPE/USD',
    });
    const latest = await repo.latest();
    expect(latest?.status).toBe('partial');
    expect(latest?.symbolsFetched).toBe(5);
  });

  it('latest returns the most recent row by id', async () => {
    await repo.insert({ startedAt: new Date(), status: 'success' });
    await repo.insert({ startedAt: new Date(), status: 'failed' });
    const latest = await repo.latest();
    expect(latest?.status).toBe('failed');
  });

  it('latest returns null on empty table', async () => {
    expect(await repo.latest()).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to confirm failure**

Run: `pnpm exec vitest run lib/prices/repository.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `lib/prices/repository.ts`:

```ts
import { desc, eq, sql } from 'drizzle-orm';
import {
  commodityPrice,
  priceFetchRun,
  type CommodityPrice,
  type PriceFetchRun,
} from '@/db/schema';
import type { DbInstance } from '@/lib/db/connection';

export type CommodityPriceInput = {
  symbol: string;
  quote: string;
  price: number;
  fetchedAt: Date;
  fetchedDate: string;
};

export class CommodityPriceRepository {
  constructor(private readonly db: DbInstance) {}

  /** Upsert rows by (symbol, quote, fetched_date). */
  async insert(rows: CommodityPriceInput[]): Promise<void> {
    if (rows.length === 0) return;
    for (const r of rows) {
      this.db
        .insert(commodityPrice)
        .values(r)
        .onConflictDoUpdate({
          target: [
            commodityPrice.symbol,
            commodityPrice.quote,
            commodityPrice.fetchedDate,
          ],
          set: {
            price: sql`excluded.price`,
            fetchedAt: sql`excluded.fetched_at`,
          },
        })
        .run();
    }
  }

  async listForQuote(quote: string): Promise<CommodityPrice[]> {
    return this.db
      .select()
      .from(commodityPrice)
      .where(eq(commodityPrice.quote, quote))
      .orderBy(commodityPrice.fetchedAt)
      .all();
  }

  /** Distinct symbols already fetched against the given quote. */
  async knownSymbolsForQuote(quote: string): Promise<string[]> {
    const rows = this.db
      .selectDistinct({ symbol: commodityPrice.symbol })
      .from(commodityPrice)
      .where(eq(commodityPrice.quote, quote))
      .all();
    return rows.map((r) => r.symbol);
  }
}

export type PriceFetchRunInsert = {
  startedAt: Date;
  status: PriceFetchRun['status'];
};

export type PriceFetchRunUpdate = Partial<{
  completedAt: Date;
  status: PriceFetchRun['status'];
  symbolsFetched: number;
  symbolsFailed: number;
  errorMessage: string | null;
}>;

export class PriceFetchRunRepository {
  constructor(private readonly db: DbInstance) {}

  async insert(input: PriceFetchRunInsert): Promise<PriceFetchRun> {
    const row = this.db
      .insert(priceFetchRun)
      .values(input)
      .returning()
      .get();
    return row!;
  }

  async update(id: number, patch: PriceFetchRunUpdate): Promise<void> {
    this.db
      .update(priceFetchRun)
      .set(patch)
      .where(eq(priceFetchRun.id, id))
      .run();
  }

  async latest(): Promise<PriceFetchRun | null> {
    const row = this.db
      .select()
      .from(priceFetchRun)
      .orderBy(desc(priceFetchRun.id))
      .limit(1)
      .get();
    return row ?? null;
  }
}
```

- [ ] **Step 4: Run test to confirm it passes**

Run: `pnpm exec vitest run lib/prices/repository.test.ts`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/prices/repository.ts lib/prices/repository.test.ts
git commit -m "feat(prices): CommodityPriceRepository + PriceFetchRunRepository"
```

---

## Task 11: `lib/prices/service.ts` — `PriceService`

This is the largest task. It composes the provider, the two repositories, the journal repository (for `listCommodities` / file IO), `getBaseCurrency`, and the lock.

**Files:**
- Create: `lib/prices/service.ts`
- Test: `lib/prices/service.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `lib/prices/service.test.ts`:

```ts
import { promises as fs } from 'fs';
import path from 'path';
import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
} from 'vitest';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '@/db/schema';
import {
  setupTestDb,
  teardownTestDb,
  type TestDbContext,
} from '@/lib/test-utils/db';
import { JournalRepository } from '@/lib/journal/repository';
import { getJournalDir } from '@/lib/journal/layout';
import {
  CommodityPriceRepository,
  PriceFetchRunRepository,
} from './repository';
import { PriceService } from './service';
import { __resetPriceLockForTests } from './lock';
import { BANNER_MARKER } from './formatter';

const PRICE_TABLE = `
  CREATE TABLE IF NOT EXISTS "commodity_price" (
    "id" integer PRIMARY KEY AUTOINCREMENT,
    "symbol" text NOT NULL,
    "quote" text NOT NULL,
    "price" real NOT NULL,
    "fetched_at" integer NOT NULL,
    "fetched_date" text NOT NULL,
    CONSTRAINT "commodity_price_unique_per_day" UNIQUE ("symbol","quote","fetched_date")
  );
  CREATE TABLE IF NOT EXISTS "price_fetch_run" (
    "id" integer PRIMARY KEY AUTOINCREMENT,
    "started_at" integer NOT NULL,
    "completed_at" integer,
    "status" text NOT NULL,
    "symbols_fetched" integer NOT NULL DEFAULT 0,
    "symbols_failed" integer NOT NULL DEFAULT 0,
    "error_message" text
  );
  CREATE TABLE IF NOT EXISTS "userSetting" (
    "userId" text PRIMARY KEY,
    "baseCurrency" text NOT NULL,
    "updatedAt" integer NOT NULL DEFAULT (unixepoch())
  );
`;

const seedUser = async (
  ctx: TestDbContext,
  id: string,
  postings: string,
  baseCurrency: string
) => {
  ctx.sqlite
    .prepare(`INSERT INTO "user" ("id","name","email") VALUES (?,?,?)`)
    .run(id, id, `${id}@example.com`);
  ctx.sqlite
    .prepare(`INSERT INTO "userSetting" ("userId","baseCurrency") VALUES (?,?)`)
    .run(id, baseCurrency);
  const dir = getJournalDir(id);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'main.ledger'), postings, 'utf-8');
};

describe('PriceService.refreshAll', () => {
  let ctx: TestDbContext;
  let service: PriceService;

  beforeEach(async () => {
    __resetPriceLockForTests();
    ctx = await setupTestDb('prices-svc-');
    ctx.sqlite.exec(PRICE_TABLE);

    const db = drizzle(ctx.sqlite, { schema });
    service = new PriceService({
      db,
      commodityRepo: new CommodityPriceRepository(db),
      runRepo: new PriceFetchRunRepository(db),
      journalRepo: new JournalRepository(db),
    });
  });

  afterEach(async () => {
    await teardownTestDb(ctx);
    vi.restoreAllMocks();
  });

  it('fetches the union of all users (symbols, base) in one provider call', async () => {
    await seedUser(
      ctx,
      'alice',
      '2026/01/01 X\n  Assets:Cash  1 BTC\n  Income\n',
      'EUR'
    );
    await seedUser(
      ctx,
      'bob',
      '2026/01/01 Y\n  Assets:Cash  1 ADA\n  Income\n',
      'EUR'
    );

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ BTC: { EUR: 60000 }, ADA: { EUR: 0.38 } }),
    } as Response);

    const result = await service.refreshAll();

    expect(result.status).toBe('success');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('writes the per-user price-db.ledger with the banner + P lines', async () => {
    await seedUser(
      ctx,
      'alice',
      '2026/01/01 X\n  Assets:Cash  1 BTC\n  Income\n',
      'EUR'
    );

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ BTC: { EUR: 60000 } }),
    } as Response);

    await service.refreshAll();

    const file = await fs.readFile(
      path.join(getJournalDir('alice'), 'price-db.ledger'),
      'utf-8'
    );
    expect(file).toContain(BANNER_MARKER);
    expect(file).toContain('P ');
    expect(file).toContain('BTC');
    expect(file).toContain('60000');
    expect(file).toContain('EUR');
  });

  it('marks the run as partial when the provider reports failed symbols', async () => {
    await seedUser(
      ctx,
      'alice',
      '2026/01/01 X\n  Assets:Cash  1 NOPE\n  Income\n',
      'USD'
    );

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    } as Response);

    const result = await service.refreshAll();
    expect(result.status).toBe('partial');
    if (result.status === 'partial') {
      expect(result.failed).toContain('NOPE');
    }
  });

  it('marks the run as failed on provider throw, without regenerating files', async () => {
    await seedUser(
      ctx,
      'alice',
      '2026/01/01 X\n  Assets:Cash  1 BTC\n  Income\n',
      'EUR'
    );
    const existing = '; user-written content\n';
    await fs.writeFile(
      path.join(getJournalDir('alice'), 'price-db.ledger'),
      existing,
      'utf-8'
    );

    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('boom'));

    const result = await service.refreshAll();
    expect(result.status).toBe('failed');

    const file = await fs.readFile(
      path.join(getJournalDir('alice'), 'price-db.ledger'),
      'utf-8'
    );
    expect(file).toBe(existing);
  });

  it('migrates a legacy price-db.ledger into the table before regenerating', async () => {
    await seedUser(
      ctx,
      'alice',
      '2026/01/01 X\n  Assets:Cash  1 BTC\n  Income\n',
      'EUR'
    );
    await fs.writeFile(
      path.join(getJournalDir('alice'), 'price-db.ledger'),
      'P 2026/01/01 12:00:00 BTC 50000 EUR\n',
      'utf-8'
    );

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ BTC: { EUR: 60000 } }),
    } as Response);

    await service.refreshAll();

    const file = await fs.readFile(
      path.join(getJournalDir('alice'), 'price-db.ledger'),
      'utf-8'
    );
    expect(file).toContain('50000');
    expect(file).toContain('60000');
  });

  it('coalesces concurrent calls into a single provider request', async () => {
    await seedUser(
      ctx,
      'alice',
      '2026/01/01 X\n  Assets:Cash  1 BTC\n  Income\n',
      'EUR'
    );

    let release: () => void = () => {};
    const gate = new Promise<Response>((r) => {
      release = () =>
        r({
          ok: true,
          status: 200,
          json: async () => ({ BTC: { EUR: 60000 } }),
        } as Response);
    });
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => gate);

    const a = service.refreshAll();
    const b = service.refreshAll();
    release();
    const [ra, rb] = await Promise.all([a, b]);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(ra.status).toBe('success');
    expect(rb.status).toBe('success');
  });
});
```

- [ ] **Step 2: Run test to confirm failure**

Run: `pnpm exec vitest run lib/prices/service.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `lib/prices/service.ts`:

```ts
import path from 'path';
import { promises as fs } from 'fs';
import { revalidateTag } from 'next/cache';
import { eq } from 'drizzle-orm';
import { user as userTable, userSetting } from '@/db/schema';
import { env } from '@/lib/env';
import type { DbInstance } from '@/lib/db/connection';
import {
  PRICE_DB_NAME,
  getJournalCacheTag,
} from '@/lib/journal/layout';
import type { JournalRepository } from '@/lib/journal/repository';
import { fetchPrices, type QuotePair } from './provider';
import { renderPriceDb, hasGeneratedBanner } from './formatter';
import { parseLegacyPriceDb } from './migration';
import { normalizeCommoditySymbol } from './symbols';
import { withPriceLock } from './lock';
import {
  type CommodityPriceRepository,
  type PriceFetchRunRepository,
} from './repository';
import { runLedgerForUser } from '@/utils/runLedgerForUser';

export type RefreshResult =
  | { status: 'success'; fetched: number }
  | { status: 'partial'; fetched: number; failed: string[] }
  | { status: 'failed'; message: string };

const sanitize = (msg: string): string =>
  msg.replace(/\/[^\s]+/g, '<path>').slice(0, 500);

const isoDateUTC = (d: Date): string => d.toISOString().slice(0, 10);

type Deps = {
  db: DbInstance;
  commodityRepo: CommodityPriceRepository;
  runRepo: PriceFetchRunRepository;
  journalRepo: JournalRepository;
};

export class PriceService {
  constructor(private readonly deps: Deps) {}

  async refreshAll(): Promise<RefreshResult> {
    return withPriceLock(() => this.runOnce());
  }

  async getLastRun() {
    return this.deps.runRepo.latest();
  }

  async regenerateUserPriceDb(userId: string): Promise<void> {
    const layout = await this.deps.journalRepo.ensureLayout(userId);
    const base = await this.resolveBaseCurrency(userId);
    const all = await this.deps.commodityRepo.listForQuote(base);
    const userSymbols = new Set(
      await this.listNormalizedSymbolsForUser(userId)
    );
    const filtered = all.filter((r) => userSymbols.has(r.symbol));
    const body = renderPriceDb(filtered);
    const target = path.join(layout.dir, PRICE_DB_NAME);
    const tmp = target + '.tmp';
    await fs.writeFile(tmp, body, 'utf-8');
    await fs.rename(tmp, target);
    revalidateTag(getJournalCacheTag(userId));
  }

  private async runOnce(): Promise<RefreshResult> {
    const startedAt = new Date();
    const run = await this.deps.runRepo.insert({
      startedAt,
      status: 'success',
    });

    try {
      const users = await this.listUsers();
      await this.maybeMigrateLegacyFiles(users);

      const perUser = new Map<string, { base: string; symbols: string[] }>();
      const pairs = new Map<string, QuotePair>(); // key: `${symbol}|${quote}`
      for (const userId of users) {
        const base = await this.resolveBaseCurrency(userId);
        const symbols = await this.listNormalizedSymbolsForUser(userId);
        const filtered = symbols.filter((s) => s !== base);
        perUser.set(userId, { base, symbols: filtered });
        for (const s of filtered) {
          pairs.set(`${s}|${base}`, { symbol: s, quote: base });
        }
      }

      const result = await fetchPrices(Array.from(pairs.values()));

      await this.deps.commodityRepo.insert(
        result.quotes.map((q) => ({
          symbol: q.symbol,
          quote: q.quote,
          price: q.price,
          fetchedAt: q.fetchedAt,
          fetchedDate: isoDateUTC(q.fetchedAt),
        }))
      );

      for (const userId of users) {
        await this.regenerateUserPriceDb(userId);
      }

      const failedSymbols = result.failed.map((p) => p.symbol);
      const status = result.failed.length === 0 ? 'success' : 'partial';
      await this.deps.runRepo.update(run.id, {
        completedAt: new Date(),
        status,
        symbolsFetched: result.quotes.length,
        symbolsFailed: result.failed.length,
        errorMessage:
          failedSymbols.length > 0 ? failedSymbols.join(', ') : null,
      });

      if (status === 'partial') {
        return {
          status: 'partial',
          fetched: result.quotes.length,
          failed: failedSymbols,
        };
      }
      return { status: 'success', fetched: result.quotes.length };
    } catch (err) {
      const message = sanitize(err instanceof Error ? err.message : String(err));
      console.error('[prices] refresh failed:', err);
      await this.deps.runRepo.update(run.id, {
        completedAt: new Date(),
        status: 'failed',
        errorMessage: message,
      });
      return { status: 'failed', message };
    }
  }

  private async listUsers(): Promise<string[]> {
    const rows = this.deps.db
      .select({ id: userTable.id })
      .from(userTable)
      .all();
    return rows.map((r) => r.id);
  }

  private async resolveBaseCurrency(userId: string): Promise<string> {
    const row = this.deps.db
      .select({ baseCurrency: userSetting.baseCurrency })
      .from(userSetting)
      .where(eq(userSetting.userId, userId))
      .get();
    return row?.baseCurrency ?? env.DEFAULT_CURRENCY;
  }

  private async listNormalizedSymbolsForUser(
    userId: string
  ): Promise<string[]> {
    let stdout: string;
    try {
      stdout = await runLedgerForUser(userId, ['commodities']);
    } catch {
      return [];
    }
    const out = new Set<string>();
    for (const line of stdout.split('\n')) {
      const sym = normalizeCommoditySymbol(line);
      if (sym) out.add(sym);
    }
    return Array.from(out);
  }

  private async maybeMigrateLegacyFiles(users: string[]): Promise<void> {
    for (const userId of users) {
      const layout = await this.deps.journalRepo.ensureLayout(userId);
      const target = path.join(layout.dir, PRICE_DB_NAME);
      let text: string;
      try {
        text = await fs.readFile(target, 'utf-8');
      } catch {
        continue; // no existing file → nothing to migrate
      }
      if (hasGeneratedBanner(text)) continue;
      const rows = parseLegacyPriceDb(text);
      if (rows.length === 0) continue;
      await this.deps.commodityRepo.insert(rows);
    }
  }
}
```

- [ ] **Step 4: Run test to confirm it passes**

Run: `pnpm exec vitest run lib/prices/service.test.ts`
Expected: all tests pass. (Tests stub `fetch`; they also exercise `runLedgerForUser` against a real journal file — requires `ledger` on PATH.)

- [ ] **Step 5: Commit**

```bash
git add lib/prices/service.ts lib/prices/service.test.ts
git commit -m "feat(prices): PriceService composing provider, repos, lock"
```

---

## Task 12: `lib/prices/index.ts` — module surface

**Files:**
- Create: `lib/prices/index.ts`

- [ ] **Step 1: Implement**

Create `lib/prices/index.ts`:

```ts
import { db } from '@/lib/db';
import { journalRepository } from '@/lib/journal';
import { CommodityPriceRepository, PriceFetchRunRepository } from './repository';
import { PriceService } from './service';

export const commodityPriceRepository = new CommodityPriceRepository(db);
export const priceFetchRunRepository = new PriceFetchRunRepository(db);
export const priceService = new PriceService({
  db,
  commodityRepo: commodityPriceRepository,
  runRepo: priceFetchRunRepository,
  journalRepo: journalRepository,
});

export { PriceService } from './service';
export type { RefreshResult } from './service';
export { CommodityPriceRepository, PriceFetchRunRepository } from './repository';
export { fetchPrices } from './provider';
export type { QuotePair, PriceQuote, ProviderResult } from './provider';
export { renderPriceDb, hasGeneratedBanner, BANNER_MARKER } from './formatter';
export type { CommodityPriceRow } from './formatter';
```

- [ ] **Step 2: Verify type-check**

Run: `pnpm type-check`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add lib/prices/index.ts
git commit -m "feat(prices): module surface (lib/prices/index.ts)"
```

---

## Task 13: `lib/prices/scheduler.ts` + `instrumentation.ts`

No unit test — the scheduler is wiring around `node-cron`. We verify via manual smoke test in the final task.

**Files:**
- Create: `lib/prices/scheduler.ts`
- Create: `instrumentation.ts` (repo root)

- [ ] **Step 1: Implement the scheduler**

Create `lib/prices/scheduler.ts`:

```ts
import 'server-only';
import cron, { type ScheduledTask } from 'node-cron';
import { env } from '@/lib/env';
import { priceService } from './index';

let scheduled: ScheduledTask | null = null;

/**
 * Idempotent — calling more than once (HMR, double startup) returns silently.
 * No-op when PRICE_REFRESH_ENABLED is false.
 */
export const registerPriceCron = (): void => {
  if (scheduled) return;
  if (!env.PRICE_REFRESH_ENABLED) {
    console.log('[prices] cron disabled via PRICE_REFRESH_ENABLED=false');
    return;
  }
  const expr = `0 ${env.PRICE_REFRESH_HOUR} * * *`;
  scheduled = cron.schedule(expr, () => {
    console.log('[prices] scheduled refresh starting');
    void priceService.refreshAll().then(
      (r) => console.log('[prices] scheduled refresh done:', r),
      (err) => console.error('[prices] scheduled refresh threw:', err)
    );
  });
  console.log(`[prices] cron registered (schedule: "${expr}")`);
};
```

- [ ] **Step 2: Implement the startup hook**

Create `instrumentation.ts` at the repo root:

```ts
export const register = async (): Promise<void> => {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { registerPriceCron } = await import('@/lib/prices/scheduler');
  registerPriceCron();
};
```

- [ ] **Step 3: Verify type-check**

Run: `pnpm type-check`
Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add lib/prices/scheduler.ts instrumentation.ts
git commit -m "feat(prices): node-cron scheduler + Next.js instrumentation hook"
```

---

## Task 14: Server action `refreshPrices`

**Files:**
- Create: `features/portfolio/actions/refreshPrices.ts`

- [ ] **Step 1: Implement**

Create `features/portfolio/actions/refreshPrices.ts`:

```ts
'use server';

import { requireUser } from '@/lib/auth/require-user';
import { priceService, type RefreshResult } from '@/lib/prices';

export const refreshPricesAction = async (): Promise<RefreshResult> => {
  const user = await requireUser();
  const result = await priceService.refreshAll();
  // refreshAll already regenerates every user's file; this call ensures the
  // caller's file is fresh even if their `userId` happened to be enumerated
  // before another user that pushed their file into a transient bad state.
  await priceService.regenerateUserPriceDb(user.id);
  return result;
};
```

- [ ] **Step 2: Verify type-check**

Run: `pnpm type-check`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add features/portfolio/actions/refreshPrices.ts
git commit -m "feat(portfolio): refreshPrices server action"
```

---

## Task 15: `features/portfolio/PriceStatus.tsx` (server component)

**Files:**
- Create: `features/portfolio/PriceStatus.tsx`

- [ ] **Step 1: Implement**

Create `features/portfolio/PriceStatus.tsx`:

```tsx
import 'server-only';
import { env } from '@/lib/env';
import { priceFetchRunRepository } from '@/lib/prices';

const formatRelative = (d: Date): string => {
  const diffMs = Date.now() - d.getTime();
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
};

const computeNextRun = (hour: number): Date => {
  const now = new Date();
  const next = new Date(now);
  next.setHours(hour, 0, 0, 0);
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
  return next;
};

const PriceStatus = async () => {
  const latest = await priceFetchRunRepository.latest();
  const nextRun = computeNextRun(env.PRICE_REFRESH_HOUR);
  const nextRunLabel = nextRun.toLocaleString(undefined, {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

  let primary: string;
  if (!latest) {
    primary = 'Last refresh: never';
  } else if (latest.status === 'failed') {
    primary = `Refresh failed ${formatRelative(latest.startedAt)}${
      latest.errorMessage ? ` — ${latest.errorMessage}` : ''
    }`;
  } else {
    const completed = latest.completedAt ?? latest.startedAt;
    const total = latest.symbolsFetched + latest.symbolsFailed;
    primary = `Last refresh: ${formatRelative(completed)} · ${latest.symbolsFetched}/${total || latest.symbolsFetched} symbols`;
  }

  return (
    <div className="flex flex-col text-sm text-muted-foreground">
      <span>{primary}</span>
      <span>Next scheduled refresh: {nextRunLabel}</span>
    </div>
  );
};

export default PriceStatus;
```

- [ ] **Step 2: Verify type-check**

Run: `pnpm type-check`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add features/portfolio/PriceStatus.tsx
git commit -m "feat(portfolio): PriceStatus server component"
```

---

## Task 16: `features/portfolio/RefreshPricesButton.tsx` (client)

**Files:**
- Create: `features/portfolio/RefreshPricesButton.tsx`

- [ ] **Step 1: Implement**

Create `features/portfolio/RefreshPricesButton.tsx`:

```tsx
'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { refreshPricesAction } from './actions/refreshPrices';

const RefreshPricesButton = () => {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const onClick = () => {
    startTransition(async () => {
      const result = await refreshPricesAction();
      if (result.status === 'success') {
        toast.success(`Prices refreshed — ${result.fetched} symbols`);
      } else if (result.status === 'partial') {
        toast.warning(
          `Prices refreshed — ${result.fetched} symbols; skipped: ${result.failed.join(', ')}`
        );
      } else {
        toast.error(`Refresh failed — ${result.message}`);
      }
      router.refresh();
    });
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onClick}
      disabled={pending}
      aria-label="Refresh prices"
    >
      <RefreshCw className={pending ? 'animate-spin' : ''} />
      Refresh prices
    </Button>
  );
};

export default RefreshPricesButton;
```

- [ ] **Step 2: Verify type-check**

Run: `pnpm type-check`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add features/portfolio/RefreshPricesButton.tsx
git commit -m "feat(portfolio): RefreshPricesButton client component"
```

---

## Task 17: Mount the price strip on the Portfolio page

**Files:**
- Modify: `features/portfolio/Portfolio.tsx`

- [ ] **Step 1: Read the current header**

Inspect `features/portfolio/Portfolio.tsx` around the existing header block:

```tsx
<header className="flex items-center gap-2">
  <h1 className="text-2xl font-semibold">Portfolio</h1>
  <Help label="About portfolio">
    Per-account holdings under <code>{prefix}</code> in their native
    commodities, plus the value converted to your default currency.
  </Help>
  <ExportButton href="/api/portfolio/export" />
</header>
```

(There are two such header blocks — one in the empty-state branch and one in the main render. Both get the new strip.)

- [ ] **Step 2: Add the imports**

At the top of `features/portfolio/Portfolio.tsx`, alongside the existing imports, add:

```tsx
import PriceStatus from './PriceStatus';
import RefreshPricesButton from './RefreshPricesButton';
```

- [ ] **Step 3: Mount the strip in both branches**

Replace each of the two `<header>` blocks with the same structure plus a new strip below:

```tsx
<header className="flex flex-col gap-2">
  <div className="flex items-center gap-2">
    <h1 className="text-2xl font-semibold">Portfolio</h1>
    <Help label="About portfolio">
      Per-account holdings under <code>{prefix}</code> in their native
      commodities, plus the value converted to your default currency.
    </Help>
    <ExportButton href="/api/portfolio/export" />
  </div>
  <div className="flex items-start justify-between gap-4">
    <PriceStatus />
    <RefreshPricesButton />
  </div>
</header>
```

- [ ] **Step 4: Verify type-check + a dev render**

Run: `pnpm type-check`
Expected: exits 0.

Run: `pnpm dev` (in a separate terminal), open `http://localhost:3000/portfolio`, confirm the strip renders without errors and the button is clickable.

- [ ] **Step 5: Commit**

```bash
git add features/portfolio/Portfolio.tsx
git commit -m "feat(portfolio): mount price status strip + refresh button"
```

---

## Task 18: Update `PLAN.md`

**Files:**
- Modify: `PLAN.md`

- [ ] **Step 1: Mark the Phase 6 entry**

In `PLAN.md`, under `## Phase 6 — Power features`, **before** the `Forecasting` entry, insert:

```
- [x] **Daily price fetcher** — centralized SQLite cache (`commodity_price` + `price_fetch_run`) populated once per day from cryptocompare's `pricemulti`, projected into each user's `price-db.ledger` via deterministic regeneration. In-process `node-cron` registered through `instrumentation.ts`; manual Refresh button on `/portfolio`. One-time import of any pre-existing `price-db.ledger`. Spec: `docs/superpowers/specs/2026-05-25-price-fetcher-design.md`.
```

- [ ] **Step 2: Commit**

```bash
git add PLAN.md
git commit -m "docs(plan): tick off Phase 6 daily price fetcher"
```

---

## Task 19: Manual smoke test

Not a code change — a verification gate before declaring the feature done. Confirm each item with a screenshot or a log line in the PR description.

- [ ] **Step 1: Boot the app**

Run: `pnpm dev`
Expected: server starts, console contains one `[prices] cron registered (schedule: "0 6 * * *")` line.

- [ ] **Step 2: Verify empty state**

Open `http://localhost:3000/portfolio` while `commodity_price` is empty.
Expected: header strip reads `Last refresh: never · Next scheduled refresh: <tomorrow at 06:00>` and the `Refresh prices` button is enabled.

- [ ] **Step 3: Trigger a refresh**

Click `Refresh prices`.
Expected:
- Button icon spins.
- Toast: `Prices refreshed — N symbols`.
- After the toast, the Portfolio table's "Converted" column shows real numbers for crypto holdings (not the raw native amount).
- `${DATA_DIR}/journals/<userId>/price-db.ledger` exists, starts with `; AUTO-GENERATED by ledger-cli-ui`, and contains `P` lines.

- [ ] **Step 4: Verify lock coalescing**

Click `Refresh prices` twice within ~1 second.
Expected: server logs show exactly one cryptocompare `fetch` outbound URL hit (you can confirm by adding a temporary `console.log('[provider] GET', url)` in `lib/prices/provider.ts#fetchWithRetry` and removing it after — DO NOT commit the log). Both clicks show a success toast.

- [ ] **Step 5: Verify HMR-safe cron registration**

Save an unrelated file (e.g. `features/portfolio/Portfolio.tsx`) to trigger Next's HMR.
Expected: `[prices] cron registered` is printed at most once per cold start; not on every HMR cycle.

- [ ] **Step 6: Verify legacy migration**

Stop the dev server. Manually write the following into `${DATA_DIR}/journals/<userId>/price-db.ledger`:

```
P 2026/01/01 12:00:00 BTC 30000 USD
```

(no banner). Start the server, click `Refresh prices`.
Expected: the file is replaced with a banner+P-line file that contains both `30000` (migrated) and today's fresh price.

- [ ] **Step 7: Verify graceful clobber of edited file**

After the smoke test in step 3, manually edit the file to add `# garbage`. Click `Refresh prices`.
Expected: file is regenerated, garbage gone, banner present.

- [ ] **Step 8: Verify cron disabled mode**

Set `PRICE_REFRESH_ENABLED=false` in `.env` and restart.
Expected: console prints `[prices] cron disabled via PRICE_REFRESH_ENABLED=false`. Refresh button still works (manual path bypasses the env gate).

- [ ] **Step 9: Run the full test suite once**

Run: `pnpm exec vitest run`
Expected: all tests pass.

- [ ] **Step 10: Done — open the PR**

Push the branch, open a PR referencing the spec, and paste the smoke-test checklist above (with verification screenshots / log excerpts) into the PR description.
