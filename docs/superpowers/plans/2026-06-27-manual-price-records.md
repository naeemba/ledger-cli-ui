# Manual Price Records Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user record manual, dated exchange rates for one or more commodities (e.g. KIRT = 0.0000033 USD) on a top-level `/prices` page, merged into the regenerated `price-db.ledger` so ledger conversions and historical valuation work.

**Architecture:** A new per-user `manual_price` table holds dated rates. A `ManualPriceRepository` does CRUD; `PriceService` gains add/list/delete methods and merges manual rows into `regenerateUserPriceDb`. Two one-action-per-file server actions back a batch form + history list on `/prices`. Manual rows render through the existing `formatLedgerDateTime` so the merged price-db is uniform.

**Tech Stack:** Next.js (App Router, RSC + server actions), Drizzle ORM + Postgres, Zod, Vitest, React `useActionState`, existing `Combobox` UI component.

## Global Constraints

- Symbols and quote currencies are normalized via `normalizeCommoditySymbol` (`lib/prices/symbols.ts`): trims, strips quotes, `$`→`USD`, alphanumeric-only, uppercased; returns `null` for invalid input.
- All price timestamps are **UTC**. `formatLedgerDateTime` (`utils/formatDate.ts`) emits `YYYY/MM/DD HH:MM:SS` in UTC.
- Blank time → `pricedAt` is end-of-day `23:59:59Z`; provided time `HH:MM` → `HH:MM:00Z`.
- `price` must be a finite number `> 0`. Column type is `real` (matches `commodity_price`).
- Conflict resolution is "later timestamp wins" (ledger-native). On identical timestamps, manual rows are written **after** fetched rows in the file so ledger uses the manual one.
- One action per file under `features/prices/actions/`. Each mutating action: `requireUser()` → `rateLimit(WRITE, user.id)` → validate → service call → `auditService.record(...)` → `revalidatePath('/prices')`.
- Follow the Repository + Service split: repositories do DB I/O only; business logic (normalization, timestamp building, regeneration) lives in `PriceService`.
- Tests use Vitest with the real test Postgres via `setupTestDb`/`teardownTestDb` from `@/lib/test-utils/db`.
- Never commit with a `Co-Authored-By: Claude` trailer or any Claude/Anthropic attribution line.

---

### Task 1: `manual_price` table + migration

**Files:**
- Create: `db/schema/manualPrice.ts`
- Modify: `db/schema/index.ts`
- Create (generated): `db/migrations/00NN_*.sql`

**Interfaces:**
- Produces: `manualPrice` Drizzle table; `type ManualPrice = typeof manualPrice.$inferSelect` with fields `{ id: number; userId: string; symbol: string; quote: string; price: number; pricedAt: Date; createdAt: Date }`.

- [ ] **Step 1: Write the schema file**

Create `db/schema/manualPrice.ts`:

```ts
import { sql } from 'drizzle-orm';
import { user } from '@naeemba/next-starter/schema';
import {
  pgTable,
  real,
  serial,
  text,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core';

export const manualPrice = pgTable(
  'manual_price',
  {
    id: serial('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    symbol: text('symbol').notNull(),
    quote: text('quote').notNull(),
    price: real('price').notNull(),
    pricedAt: timestamp('priced_at').notNull(),
    createdAt: timestamp('created_at')
      .notNull()
      .default(sql`now()`),
  },
  (t) => [
    unique('manual_price_unique_per_instant').on(
      t.userId,
      t.symbol,
      t.quote,
      t.pricedAt
    ),
  ]
);

export type ManualPrice = typeof manualPrice.$inferSelect;
```

- [ ] **Step 2: Export it from the schema barrel**

In `db/schema/index.ts`, add this line in alphabetical position (after the `auditLog` export):

```ts
export { manualPrice, type ManualPrice } from './manualPrice';
```

- [ ] **Step 3: Generate the migration**

Run: `pnpm db:generate`
Expected: a new file `db/migrations/00NN_*.sql` containing `CREATE TABLE "manual_price"` with the unique constraint, plus an updated `db/migrations/meta/` journal.

- [ ] **Step 4: Apply and verify the migration**

Run: `pnpm db:migrate`
Expected: applies cleanly. Then run `pnpm type-check`
Expected: PASS (no type errors).

- [ ] **Step 5: Commit**

```bash
git add db/schema/manualPrice.ts db/schema/index.ts db/migrations
git commit -m "feat(prices): add manual_price table"
```

---

### Task 2: `ManualPriceRepository`

**Files:**
- Create: `lib/prices/manualRepository.ts`
- Test: `lib/prices/manualRepository.test.ts`

**Interfaces:**
- Consumes: `manualPrice`, `ManualPrice` (Task 1); `DbInstance` from `@/lib/db/connection`.
- Produces:
  - `type ManualPriceInput = { userId: string; symbol: string; quote: string; price: number; pricedAt: Date }`
  - `class ManualPriceRepository`:
    - `upsertMany(rows: ManualPriceInput[]): Promise<void>`
    - `listForUser(userId: string): Promise<ManualPrice[]>` — newest `pricedAt` first
    - `deleteForUser(userId: string, id: number): Promise<void>`

- [ ] **Step 1: Write the failing test**

Create `lib/prices/manualRepository.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ManualPriceRepository } from './manualRepository';
import {
  setupTestDb,
  teardownTestDb,
  type TestDbContext,
} from '@/lib/test-utils/db';

describe('ManualPriceRepository', () => {
  let ctx: TestDbContext;
  let repo: ManualPriceRepository;

  beforeEach(async () => {
    ctx = await setupTestDb('manual-price-');
    await ctx.insertUser('alice', 'alice', 'alice@example.com');
    repo = new ManualPriceRepository(ctx.db);
  });

  afterEach(async () => {
    await teardownTestDb(ctx);
  });

  it('inserts and lists rows newest-first', async () => {
    await repo.upsertMany([
      {
        userId: 'alice',
        symbol: 'KIRT',
        quote: 'USD',
        price: 0.0000033,
        pricedAt: new Date('2026-01-01T23:59:59Z'),
      },
      {
        userId: 'alice',
        symbol: 'KIRT',
        quote: 'USD',
        price: 0.0000040,
        pricedAt: new Date('2026-06-27T23:59:59Z'),
      },
    ]);
    const rows = await repo.listForUser('alice');
    expect(rows.map((r) => r.pricedAt.toISOString())).toEqual([
      '2026-06-27T23:59:59.000Z',
      '2026-01-01T23:59:59.000Z',
    ]);
  });

  it('upserts on (userId, symbol, quote, pricedAt) conflict', async () => {
    const at = new Date('2026-06-27T23:59:59Z');
    await repo.upsertMany([
      { userId: 'alice', symbol: 'KIRT', quote: 'USD', price: 1, pricedAt: at },
    ]);
    await repo.upsertMany([
      { userId: 'alice', symbol: 'KIRT', quote: 'USD', price: 2, pricedAt: at },
    ]);
    const rows = await repo.listForUser('alice');
    expect(rows).toHaveLength(1);
    expect(rows[0].price).toBe(2);
  });

  it('collapses duplicate conflict keys within one batch (last-wins)', async () => {
    const at = new Date('2026-06-27T23:59:59Z');
    await repo.upsertMany([
      { userId: 'alice', symbol: 'KIRT', quote: 'USD', price: 1, pricedAt: at },
      { userId: 'alice', symbol: 'KIRT', quote: 'USD', price: 5, pricedAt: at },
    ]);
    const rows = await repo.listForUser('alice');
    expect(rows).toHaveLength(1);
    expect(rows[0].price).toBe(5);
  });

  it('deleteForUser removes only the owner row', async () => {
    await ctx.insertUser('bob', 'bob', 'bob@example.com');
    const at = new Date('2026-06-27T23:59:59Z');
    await repo.upsertMany([
      { userId: 'alice', symbol: 'KIRT', quote: 'USD', price: 1, pricedAt: at },
      { userId: 'bob', symbol: 'KIRT', quote: 'USD', price: 2, pricedAt: at },
    ]);
    const aliceRow = (await repo.listForUser('alice'))[0];
    await repo.deleteForUser('bob', aliceRow.id); // wrong owner → no-op
    expect(await repo.listForUser('alice')).toHaveLength(1);
    await repo.deleteForUser('alice', aliceRow.id);
    expect(await repo.listForUser('alice')).toHaveLength(0);
    expect(await repo.listForUser('bob')).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test lib/prices/manualRepository.test.ts`
Expected: FAIL — `Cannot find module './manualRepository'`.

- [ ] **Step 3: Write the repository**

Create `lib/prices/manualRepository.ts`:

```ts
import { and, desc, eq, sql } from 'drizzle-orm';
import { manualPrice, type ManualPrice } from '@/db/schema';
import type { DbInstance } from '@/lib/db/connection';

export type ManualPriceInput = {
  userId: string;
  symbol: string;
  quote: string;
  price: number;
  pricedAt: Date;
};

export class ManualPriceRepository {
  constructor(private readonly db: DbInstance) {}

  /** Upsert rows by (userId, symbol, quote, pricedAt) in a single statement. */
  async upsertMany(rows: ManualPriceInput[]): Promise<void> {
    if (rows.length === 0) return;
    // Collapse duplicate conflict keys before the batched upsert: a single
    // ON CONFLICT DO UPDATE that targets the same row twice throws Postgres
    // 21000. Last-wins matches the upsert's intent.
    const deduped = [
      ...new Map(
        rows.map((r) => [
          `${r.userId}|${r.symbol}|${r.quote}|${r.pricedAt.toISOString()}`,
          r,
        ])
      ).values(),
    ];
    await this.db
      .insert(manualPrice)
      .values(deduped)
      .onConflictDoUpdate({
        target: [
          manualPrice.userId,
          manualPrice.symbol,
          manualPrice.quote,
          manualPrice.pricedAt,
        ],
        set: { price: sql`excluded.price` },
      });
  }

  async listForUser(userId: string): Promise<ManualPrice[]> {
    return this.db
      .select()
      .from(manualPrice)
      .where(eq(manualPrice.userId, userId))
      .orderBy(desc(manualPrice.pricedAt), desc(manualPrice.id));
  }

  async deleteForUser(userId: string, id: number): Promise<void> {
    await this.db
      .delete(manualPrice)
      .where(and(eq(manualPrice.userId, userId), eq(manualPrice.id, id)));
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test lib/prices/manualRepository.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/prices/manualRepository.ts lib/prices/manualRepository.test.ts
git commit -m "feat(prices): ManualPriceRepository CRUD"
```

---

### Task 3: Validation schema + timestamp builder

**Files:**
- Create: `lib/prices/manualSchema.ts`
- Test: `lib/prices/manualSchema.test.ts`

**Interfaces:**
- Produces:
  - `manualPriceDraftSchema` (Zod) validating `{ date: string; time?: string; quote: string; rows: { symbol: string; price: number }[] }`.
  - `type ManualPriceDraft = z.infer<typeof manualPriceDraftSchema>`.
  - `buildPricedAt(date: string, time?: string): Date | null` — UTC instant; blank time → `23:59:59Z`.

- [ ] **Step 1: Write the failing test**

Create `lib/prices/manualSchema.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { manualPriceDraftSchema, buildPricedAt } from './manualSchema';

describe('manualPriceDraftSchema', () => {
  const valid = {
    date: '2026-06-27',
    quote: 'USD',
    rows: [{ symbol: 'KIRT', price: 0.0000033 }],
  };

  it('accepts a well-formed draft', () => {
    expect(manualPriceDraftSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects a malformed date', () => {
    expect(
      manualPriceDraftSchema.safeParse({ ...valid, date: '27/06/2026' }).success
    ).toBe(false);
  });

  it('rejects a non-positive price', () => {
    expect(
      manualPriceDraftSchema.safeParse({
        ...valid,
        rows: [{ symbol: 'KIRT', price: 0 }],
      }).success
    ).toBe(false);
  });

  it('rejects an empty rows array', () => {
    expect(
      manualPriceDraftSchema.safeParse({ ...valid, rows: [] }).success
    ).toBe(false);
  });

  it('rejects a bad time format', () => {
    expect(
      manualPriceDraftSchema.safeParse({ ...valid, time: '9am' }).success
    ).toBe(false);
  });

  it('allows an empty-string time (means "no time")', () => {
    expect(
      manualPriceDraftSchema.safeParse({ ...valid, time: '' }).success
    ).toBe(true);
  });
});

describe('buildPricedAt', () => {
  it('defaults blank time to end-of-day UTC', () => {
    expect(buildPricedAt('2026-06-27')?.toISOString()).toBe(
      '2026-06-27T23:59:59.000Z'
    );
    expect(buildPricedAt('2026-06-27', '')?.toISOString()).toBe(
      '2026-06-27T23:59:59.000Z'
    );
  });

  it('uses an explicit time as UTC', () => {
    expect(buildPricedAt('2026-06-27', '14:30')?.toISOString()).toBe(
      '2026-06-27T14:30:00.000Z'
    );
  });

  it('returns null for an unparseable date', () => {
    expect(buildPricedAt('2026-13-40')).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test lib/prices/manualSchema.test.ts`
Expected: FAIL — `Cannot find module './manualSchema'`.

- [ ] **Step 3: Write the schema + builder**

Create `lib/prices/manualSchema.ts`:

```ts
import { z } from 'zod';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

export const manualPriceDraftSchema = z.object({
  date: z.string().regex(DATE_RE, 'Date must be YYYY-MM-DD'),
  time: z
    .union([z.string().regex(TIME_RE, 'Time must be HH:MM'), z.literal('')])
    .optional(),
  quote: z.string().min(1, 'Quote currency is required'),
  rows: z
    .array(
      z.object({
        symbol: z.string().min(1),
        price: z.number().finite().positive(),
      })
    )
    .min(1, 'Add at least one price'),
});

export type ManualPriceDraft = z.infer<typeof manualPriceDraftSchema>;

/**
 * Build the UTC instant a manual rate applies to. Blank time → end-of-day
 * (23:59:59Z) so a date-only rate is authoritative for the whole calendar day
 * and beats any intraday fetched rate. Returns null if the result is invalid.
 */
export const buildPricedAt = (date: string, time?: string): Date | null => {
  const t = time && time.length > 0 ? `${time}:00` : '23:59:59';
  const d = new Date(`${date}T${t}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test lib/prices/manualSchema.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/prices/manualSchema.ts lib/prices/manualSchema.test.ts
git commit -m "feat(prices): manual price draft schema + pricedAt builder"
```

---

### Task 4: `PriceService` manual-price methods + regeneration merge + DI

**Files:**
- Modify: `lib/prices/service.ts`
- Modify: `lib/prices/index.ts`
- Test: `lib/prices/service.test.ts` (add a new `describe` block)

**Interfaces:**
- Consumes: `ManualPriceRepository`, `ManualPriceInput` (Task 2); `ManualPriceDraft`, `buildPricedAt` (Task 3); `normalizeCommoditySymbol`; existing `renderPriceDb` + `CommodityPriceRow`.
- Produces, on `PriceService`:
  - `addManualPrices(userId: string, draft: ManualPriceDraft): Promise<{ ok: true } | { ok: false; formError: string }>`
  - `listManualPrices(userId: string): Promise<ManualPrice[]>`
  - `deleteManualPrice(userId: string, id: number): Promise<void>`
  - `getBaseCurrency(userId: string): Promise<string>` (public)
  - `listCommoditiesForUser(userId: string): Promise<string[]>` (public)
- `Deps` gains `manualRepo: ManualPriceRepository`. `priceService` singleton wires it.

- [ ] **Step 1: Write the failing test**

Append to `lib/prices/service.test.ts` (add the import at the top alongside the existing ones, then the new describe block at the end of the file):

```ts
// add near the other imports
import { ManualPriceRepository } from './manualRepository';
```

```ts
describe('PriceService manual prices', () => {
  let ctx: TestDbContext;
  let service: PriceService;

  const make = () =>
    new PriceService({
      db: ctx.db,
      commodityRepo: new CommodityPriceRepository(ctx.db),
      runRepo: new PriceFetchRunRepository(ctx.db),
      journalRepo: new JournalRepository(ctx.db),
      manualRepo: new ManualPriceRepository(ctx.db),
    });

  beforeEach(async () => {
    __resetPriceLockForTests();
    ctx = await setupTestDb('prices-manual-svc-');
    service = make();
  });

  afterEach(async () => {
    await teardownTestDb(ctx);
    vi.restoreAllMocks();
  });

  const readPriceDb = async (userId: string) =>
    fs.readFile(
      path.join(getJournalDir(userId), 'price-db.ledger'),
      'utf-8'
    );

  it('emits a never-transacted manual symbol into price-db', async () => {
    await seedUser(ctx, 'alice', '2026/01/01 X\n  Assets:Cash  1 BTC\n  Income\n', 'USD');
    const result = await service.addManualPrices('alice', {
      date: '2026-06-27',
      quote: 'USD',
      rows: [{ symbol: 'KIRT', price: 0.0000033 }],
    });
    expect(result).toEqual({ ok: true });
    const file = await readPriceDb('alice');
    expect(file).toContain('KIRT');
    expect(file).toContain('0.0000033');
    expect(file).toContain('2026/06/27 23:59:59');
  });

  it('normalizes $ to USD and rejects pricing a symbol in itself', async () => {
    await seedUser(ctx, 'alice', '2026/01/01 X\n  Assets:Cash  1 BTC\n  Income\n', 'USD');
    const ok = await service.addManualPrices('alice', {
      date: '2026-06-27',
      quote: '$',
      rows: [{ symbol: 'kirt', price: 2 }],
    });
    expect(ok).toEqual({ ok: true });
    expect(await readPriceDb('alice')).toContain('KIRT 2 USD');

    const bad = await service.addManualPrices('alice', {
      date: '2026-06-27',
      quote: 'USD',
      rows: [{ symbol: 'USD', price: 2 }],
    });
    expect(bad.ok).toBe(false);
  });

  it('manual rate beats a same-day fetched rate via end-of-day ordering', async () => {
    await seedUser(ctx, 'alice', '2026/01/01 X\n  Assets:Cash  1 BTC\n  Income\n', 'USD');
    await new CommodityPriceRepository(ctx.db).insert([
      {
        symbol: 'BTC',
        quote: 'USD',
        price: 60000,
        fetchedAt: new Date('2026-06-27T12:00:00Z'),
        fetchedDate: '2026-06-27',
      },
    ]);
    await service.addManualPrices('alice', {
      date: '2026-06-27',
      quote: 'USD',
      rows: [{ symbol: 'BTC', price: 65000 }],
    });
    const file = await readPriceDb('alice');
    // both lines present; the 23:59:59 manual line sorts after the 12:00:00 one
    const idxFetched = file.indexOf('60000');
    const idxManual = file.indexOf('65000');
    expect(idxFetched).toBeGreaterThanOrEqual(0);
    expect(idxManual).toBeGreaterThan(idxFetched);
  });

  it('deleteManualPrice removes the row and regenerates without it', async () => {
    await seedUser(ctx, 'alice', '2026/01/01 X\n  Assets:Cash  1 BTC\n  Income\n', 'USD');
    await service.addManualPrices('alice', {
      date: '2026-06-27',
      quote: 'USD',
      rows: [{ symbol: 'KIRT', price: 3 }],
    });
    const row = (await service.listManualPrices('alice'))[0];
    await service.deleteManualPrice('alice', row.id);
    expect(await service.listManualPrices('alice')).toHaveLength(0);
    expect(await readPriceDb('alice')).not.toContain('KIRT');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test lib/prices/service.test.ts`
Expected: FAIL — `manualRepo` missing from `Deps` / `addManualPrices is not a function`.

- [ ] **Step 3: Add the import and `Deps` field in `service.ts`**

In `lib/prices/service.ts`, add to the imports:

```ts
import { buildPricedAt, type ManualPriceDraft } from './manualSchema';
import type { ManualPriceRepository } from './manualRepository';
import type { CommodityPriceRow } from './formatter';
import type { ManualPrice } from '@/db/schema';
```

Add the field to the `Deps` type:

```ts
type Deps = {
  db: DbInstance;
  commodityRepo: CommodityPriceRepository;
  runRepo: PriceFetchRunRepository;
  journalRepo: JournalRepository;
  manualRepo: ManualPriceRepository;
};
```

- [ ] **Step 4: Merge manual rows into `regenerateUserPriceDb`**

Replace the body of `regenerateUserPriceDb` (currently lines ~59-76) with:

```ts
  async regenerateUserPriceDb(userId: string): Promise<void> {
    const layout = await this.deps.journalRepo.ensureLayout(userId);
    const base = await this.resolveBaseCurrency(userId);
    const all = await this.deps.commodityRepo.listForQuote(base);
    const userSymbols = new Set(
      await this.listNormalizedSymbolsForUser(userId)
    );
    const fetched = all.filter((r) => userSymbols.has(r.symbol));
    const manual = await this.deps.manualRepo.listForUser(userId);
    const manualRows: CommodityPriceRow[] = manual.map((m) => ({
      symbol: m.symbol,
      quote: m.quote,
      price: m.price,
      fetchedAt: m.pricedAt,
      fetchedDate: utcDate(m.pricedAt),
    }));
    // Concatenate fetched-first, then stable-sort by instant: equal timestamps
    // keep fetched before manual, so manual ends up later in the file and wins.
    const merged = [...fetched, ...manualRows].sort(
      (a, b) => a.fetchedAt.getTime() - b.fetchedAt.getTime()
    );
    const body = renderPriceDb(merged);
    const target = path.join(layout.dir, PRICE_DB_NAME);
    await this.deps.journalRepo.writeFileAtomic(target, body);
    try {
      revalidateTag(getJournalCacheTag(userId), 'max');
    } catch {
      // revalidateTag throws outside a Next.js request context (cron, tests).
      // Acceptable — the cache invalidates on the next request.
    }
  }
```

- [ ] **Step 5: Make the two helper methods public**

In `service.ts`, change `private async resolveBaseCurrency` to `async resolveBaseCurrency` and `private async listNormalizedSymbolsForUser` to `async listNormalizedSymbolsForUser` (drop only the `private` keyword on each).

- [ ] **Step 6: Add the manual-price methods**

Add these methods to the `PriceService` class (e.g. after `regenerateUserPriceDb`):

```ts
  async addManualPrices(
    userId: string,
    draft: ManualPriceDraft
  ): Promise<{ ok: true } | { ok: false; formError: string }> {
    const quote = normalizeCommoditySymbol(draft.quote);
    if (!quote) return { ok: false, formError: 'Invalid quote currency' };
    const pricedAt = buildPricedAt(draft.date, draft.time);
    if (!pricedAt) return { ok: false, formError: 'Invalid date or time' };

    const byKey = new Map<
      string,
      { userId: string; symbol: string; quote: string; price: number; pricedAt: Date }
    >();
    for (const row of draft.rows) {
      const symbol = normalizeCommoditySymbol(row.symbol);
      if (!symbol) {
        return { ok: false, formError: `Invalid commodity: ${row.symbol}` };
      }
      if (symbol === quote) {
        return { ok: false, formError: `Cannot price ${symbol} in itself` };
      }
      byKey.set(symbol, { userId, symbol, quote, price: row.price, pricedAt });
    }

    await this.deps.manualRepo.upsertMany([...byKey.values()]);
    await this.regenerateUserPriceDb(userId);
    return { ok: true };
  }

  async listManualPrices(userId: string): Promise<ManualPrice[]> {
    return this.deps.manualRepo.listForUser(userId);
  }

  async deleteManualPrice(userId: string, id: number): Promise<void> {
    await this.deps.manualRepo.deleteForUser(userId, id);
    await this.regenerateUserPriceDb(userId);
  }

  async getBaseCurrency(userId: string): Promise<string> {
    return this.resolveBaseCurrency(userId);
  }

  async listCommoditiesForUser(userId: string): Promise<string[]> {
    return this.listNormalizedSymbolsForUser(userId);
  }
```

- [ ] **Step 7: Wire the dependency in the singleton**

In `lib/prices/index.ts`, add the import and repository, and pass it into the service:

```ts
import { ManualPriceRepository } from './manualRepository';
```

```ts
export const manualPriceRepository = new ManualPriceRepository(db);
export const priceService = new PriceService({
  db,
  commodityRepo: commodityPriceRepository,
  runRepo: priceFetchRunRepository,
  journalRepo: journalRepository,
  manualRepo: manualPriceRepository,
});
```

Also add a re-export near the others:

```ts
export { ManualPriceRepository } from './manualRepository';
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `pnpm test lib/prices/service.test.ts`
Expected: PASS — existing `refreshAll` tests plus the 4 new manual-price tests.

- [ ] **Step 9: Run the full prices suite + type-check**

Run: `pnpm test lib/prices && pnpm type-check`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add lib/prices/service.ts lib/prices/index.ts lib/prices/service.test.ts
git commit -m "feat(prices): add manual price service methods + merge into price-db"
```

---

### Task 5: Server actions + audit actions

**Files:**
- Modify: `lib/audit/schema.ts`
- Create: `features/prices/actions/types.ts`
- Create: `features/prices/actions/addManualPrices.ts`
- Create: `features/prices/actions/deleteManualPrice.ts`
- Create: `features/prices/actions/index.ts`

**Interfaces:**
- Consumes: `priceService` (Task 4); `manualPriceDraftSchema` (Task 3); `requireUser`, `rateLimit`/`WRITE`/`RATE_LIMIT_MESSAGE`, `auditService`/`auditRequestMeta`, `revalidatePath`.
- Produces:
  - `type PriceActionState = { ok: boolean; formError?: string }`
  - `addManualPricesAction(prev: PriceActionState | null, formData: FormData): Promise<PriceActionState>`
  - `deleteManualPriceAction(formData: FormData): Promise<void>`

- [ ] **Step 1: Add the audit actions**

In `lib/audit/schema.ts`, add two entries to the `AUDIT_ACTIONS` array (after `'journal.import'`):

```ts
  'price.add',
  'price.delete',
```

(Without this, `auditEventSchema` would silently drop the events — actions are validated against this enum.)

- [ ] **Step 2: Write the action-state type**

Create `features/prices/actions/types.ts`:

```ts
export type PriceActionState = {
  ok: boolean;
  formError?: string;
};
```

- [ ] **Step 3: Write the add action**

Create `features/prices/actions/addManualPrices.ts`:

```ts
'use server';

import { revalidatePath } from 'next/cache';
import type { PriceActionState } from './types';
import { auditService, auditRequestMeta } from '@/lib/audit';
import { requireUser } from '@/lib/auth/require-user';
import { manualPriceDraftSchema } from '@/lib/prices/manualSchema';
import { priceService } from '@/lib/prices';
import { rateLimit, WRITE, RATE_LIMIT_MESSAGE } from '@/lib/rate-limit';

export async function addManualPricesAction(
  _prev: PriceActionState | null,
  formData: FormData
): Promise<PriceActionState> {
  const user = await requireUser();
  if (!rateLimit(WRITE, user.id).allowed) {
    return { ok: false, formError: RATE_LIMIT_MESSAGE };
  }

  const draftJson = formData.get('draft');
  if (typeof draftJson !== 'string') {
    return { ok: false, formError: 'Missing price payload' };
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(draftJson);
  } catch {
    return { ok: false, formError: 'Price payload is not valid JSON' };
  }

  const parsed = manualPriceDraftSchema.safeParse(parsedJson);
  if (!parsed.success) {
    return { ok: false, formError: 'Please fix the highlighted fields' };
  }

  const result = await priceService.addManualPrices(user.id, parsed.data);
  await auditService.record(user.id, {
    action: 'price.add',
    result: result.ok ? 'success' : 'failure',
    detail: result.ok ? { count: parsed.data.rows.length } : undefined,
    ...(await auditRequestMeta()),
  });
  if (!result.ok) return { ok: false, formError: result.formError };

  revalidatePath('/prices');
  return { ok: true };
}
```

- [ ] **Step 4: Write the delete action**

Create `features/prices/actions/deleteManualPrice.ts`:

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { auditService, auditRequestMeta } from '@/lib/audit';
import { requireUser } from '@/lib/auth/require-user';
import { priceService } from '@/lib/prices';
import { rateLimit, WRITE } from '@/lib/rate-limit';

export async function deleteManualPriceAction(
  formData: FormData
): Promise<void> {
  const user = await requireUser();
  if (!rateLimit(WRITE, user.id).allowed) return;

  const raw = formData.get('id');
  const id = typeof raw === 'string' ? Number(raw) : NaN;
  if (!Number.isInteger(id) || id <= 0) return;

  await priceService.deleteManualPrice(user.id, id);
  await auditService.record(user.id, {
    action: 'price.delete',
    result: 'success',
    ...(await auditRequestMeta()),
  });
  revalidatePath('/prices');
}
```

- [ ] **Step 5: Write the barrel**

Create `features/prices/actions/index.ts`:

```ts
export { addManualPricesAction } from './addManualPrices';
export { deleteManualPriceAction } from './deleteManualPrice';
export type { PriceActionState } from './types';
```

- [ ] **Step 6: Verify type-check + lint**

Run: `pnpm type-check && pnpm lint`
Expected: PASS (no type errors, no lint errors). The action logic is covered by the service tests in Task 4; these are thin wrappers.

- [ ] **Step 7: Commit**

```bash
git add lib/audit/schema.ts features/prices/actions
git commit -m "feat(prices): add/delete manual price server actions"
```

---

### Task 6: `/prices` page + `PricesView`

**Files:**
- Create: `app/prices/page.tsx`
- Create: `features/prices/PricesView.tsx`
- Create: `features/prices/index.ts`

**Interfaces:**
- Consumes: `priceService` (`listManualPrices`, `listCommoditiesForUser`, `getBaseCurrency`); `requireUser`; `ManualPrice`; the action barrel (Task 5); `Combobox`; `formatLedgerDateTime`.
- Produces: a server page that loads data and renders `<PricesView prices commodities baseCurrency />`.

- [ ] **Step 1: Write the page shell**

Create `app/prices/page.tsx`:

```tsx
import { PricesView } from '@/features/prices';
import { requireUser } from '@/lib/auth/require-user';
import { priceService } from '@/lib/prices';

export const dynamic = 'force-dynamic';

const PricesPage = async () => {
  const user = await requireUser();
  const [prices, commodities, baseCurrency] = await Promise.all([
    priceService.listManualPrices(user.id),
    priceService.listCommoditiesForUser(user.id),
    priceService.getBaseCurrency(user.id),
  ]);

  return (
    <PricesView
      prices={prices}
      commodities={commodities}
      baseCurrency={baseCurrency}
    />
  );
};

export default PricesPage;
```

- [ ] **Step 2: Write the client view**

Create `features/prices/PricesView.tsx`:

```tsx
'use client';

import { Trash2 } from 'lucide-react';
import { useActionState, useState } from 'react';
import Combobox from '@/components/Combobox/Combobox';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ManualPrice } from '@/db/schema';
import {
  addManualPricesAction,
  deleteManualPriceAction,
  type PriceActionState,
} from '@/features/prices/actions';
import { formatLedgerDateTime } from '@/utils/formatDate';

type Row = { symbol: string; price: string };

type Props = {
  prices: ManualPrice[];
  commodities: string[];
  baseCurrency: string;
};

const todayUtc = () => new Date().toISOString().slice(0, 10);

export const PricesView = ({ prices, commodities, baseCurrency }: Props) => {
  const [state, formAction, isPending] = useActionState<
    PriceActionState,
    FormData
  >(addManualPricesAction, { ok: false });

  const [date, setDate] = useState(todayUtc());
  const [time, setTime] = useState('');
  const [quote, setQuote] = useState(baseCurrency);
  const [rows, setRows] = useState<Row[]>([{ symbol: '', price: '' }]);

  const updateRow = (i: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const addRow = () => setRows((rs) => [...rs, { symbol: '', price: '' }]);
  const removeRow = (i: number) =>
    setRows((rs) => (rs.length > 1 ? rs.filter((_, j) => j !== i) : rs));

  const draft = JSON.stringify({
    date,
    time: time || undefined,
    quote,
    rows: rows
      .filter((r) => r.symbol.trim() && r.price.trim())
      .map((r) => ({ symbol: r.symbol.trim(), price: Number(r.price) })),
  });

  return (
    <div className="mx-auto w-full max-w-3xl space-y-8 p-4">
      <header>
        <h1 className="text-2xl font-semibold">Prices</h1>
        <p className="text-muted-foreground text-sm">
          Record exchange rates for commodities (e.g. KIRT) your price provider
          doesn&apos;t cover. Each rate is dated, so historical reports use the
          rate in effect at the time.
        </p>
      </header>

      <form action={formAction} className="space-y-4 rounded-lg border p-4">
        <input type="hidden" name="draft" value={draft} />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor="price-date">Date</Label>
            <Input
              id="price-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="price-time">Time (optional)</Label>
            <Input
              id="price-time"
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label>Quote currency</Label>
            <Combobox
              value={quote}
              onChange={setQuote}
              options={commodities}
              placeholder="USD"
              allowFreeText
            />
          </div>
        </div>

        <div className="space-y-2">
          {rows.map((row, i) => (
            <div key={i} className="flex items-end gap-2">
              <div className="flex-1 space-y-1">
                {i === 0 && <Label>Commodity</Label>}
                <Combobox
                  value={row.symbol}
                  onChange={(v) => updateRow(i, { symbol: v })}
                  options={commodities}
                  placeholder="KIRT"
                  allowFreeText
                />
              </div>
              <div className="flex-1 space-y-1">
                {i === 0 && <Label htmlFor={`price-${i}`}>Rate</Label>}
                <Input
                  id={`price-${i}`}
                  type="number"
                  step="any"
                  min="0"
                  inputMode="decimal"
                  value={row.price}
                  onChange={(e) => updateRow(i, { price: e.target.value })}
                  placeholder="0.0000033"
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Remove row"
                onClick={() => removeRow(i)}
                disabled={rows.length === 1}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={addRow}>
            Add another commodity
          </Button>
        </div>

        {state.formError && (
          <p className="text-destructive text-sm">{state.formError}</p>
        )}
        {state.ok && (
          <p className="text-sm text-green-600">Prices saved.</p>
        )}

        <Button type="submit" disabled={isPending}>
          {isPending ? 'Saving…' : 'Save prices'}
        </Button>
      </form>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">History</h2>
        {prices.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No manual prices yet.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground text-left">
                <th className="py-1">When</th>
                <th>Commodity</th>
                <th className="text-right">Rate</th>
                <th>Quote</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {prices.map((p) => (
                <tr key={p.id} className="border-t">
                  <td className="py-1">
                    {formatLedgerDateTime(new Date(p.pricedAt))}
                  </td>
                  <td>{p.symbol}</td>
                  <td className="text-right tabular-nums">{p.price}</td>
                  <td>{p.quote}</td>
                  <td className="text-right">
                    <form action={deleteManualPriceAction}>
                      <input type="hidden" name="id" value={p.id} />
                      <Button
                        type="submit"
                        variant="ghost"
                        size="icon"
                        aria-label={`Delete ${p.symbol} rate`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
};
```

- [ ] **Step 3: Write the feature barrel**

Create `features/prices/index.ts`:

```ts
export { PricesView } from './PricesView';
```

- [ ] **Step 4: Verify imports exist**

Confirm `@/components/ui/input`, `@/components/ui/label`, and `@/components/ui/button` exist (they are referenced by existing forms). Then run `pnpm type-check`.
Expected: PASS. (If `Combobox` is a default export — it is — the `import Combobox from '@/components/Combobox/Combobox'` form is correct.)

- [ ] **Step 5: Run lint + build the route**

Run: `pnpm lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/prices features/prices/PricesView.tsx features/prices/index.ts
git commit -m "feat(prices): /prices page with batch add form + history"
```

---

### Task 7: Navigation entry

**Files:**
- Modify: `components/nav/config.ts`

**Interfaces:**
- Consumes: the `/prices` route (Task 6); `getNavSections()` structure.

- [ ] **Step 1: Import the icon**

In `components/nav/config.ts`, add `TrendingUp` to the `lucide-react` import (alphabetical, after `Settings`/before `Users` — keep the existing ordering style):

```ts
  TrendingUp,
```

- [ ] **Step 2: Add the nav item**

In the `journal` section's `items` array (after the `import` item, before the section closes), add:

```ts
        {
          id: 'prices',
          title: 'Prices',
          href: '/prices',
          match: 'exact',
          description: 'Record exchange rates for commodities like KIRT.',
          icon: TrendingUp,
          keywords: ['exchange', 'rate', 'commodity', 'currency', 'price'],
        },
```

- [ ] **Step 3: Verify type-check**

Run: `pnpm type-check`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add components/nav/config.ts
git commit -m "feat(prices): add Prices nav item"
```

---

## Final verification

- [ ] **Run the full prices test suite:** `pnpm test lib/prices`
- [ ] **Type-check the whole project:** `pnpm type-check`
- [ ] **Lint:** `pnpm lint`
- [ ] **Manual smoke test** (`pnpm dev`): navigate to `/prices`, add a KIRT→USD rate with a blank time, confirm it appears in History, confirm `data/journals/<userId>/price-db.ledger` contains `P <today> 23:59:59 KIRT <rate> USD`, then delete it and confirm it's gone from both the list and the file.

---

## Self-review notes (addressed)

- **Spec coverage:** per-user table (T1), repository CRUD (T2), Zod validation + end-of-day default (T3), service add/list/delete + merge-into-price-db + always-emit-manual + manual-wins ordering (T4), one-action-per-file with auth/rate-limit/audit (T5), top-level `/prices` page with batch form + autocomplete-allow-new + history+delete (T6), nav entry (T7). All spec sections map to a task.
- **Audit gap closed:** `price.add`/`price.delete` added to `AUDIT_ACTIONS` (T5 Step 1) — without it the audit writes would be silently dropped.
- **Type consistency:** `addManualPrices` returns `{ ok: true } | { ok: false; formError }` everywhere; `PriceActionState` is `{ ok; formError? }`; `deleteManualPriceAction` is `(FormData) => Promise<void>` (plain form action, no `useActionState`); `manualRepo` added to `Deps` and the singleton together.
- **Out of scope (YAGNI), per spec:** no inline edit, no CSV import, no per-row quote, no new `components/ui` primitives, no new audit *activity-type grouping* (events still recorded and visible under "all").
