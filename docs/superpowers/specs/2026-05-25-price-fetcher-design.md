# Daily Price Fetcher (Design)

Status: approved during brainstorming, awaiting implementation plan.
Date: 2026-05-25.

## Goal

Port the standalone `fetch_prices.sh` / `fetch_prices.py` workflow from `/Users/sharp/workspace/personal/accounting` into the app as a first-class feature. Replace the hand-run shell script with:

- A **shared SQLite price cache** (`commodity_price`) populated once per day from `cryptocompare`'s `pricemulti` endpoint, covering the union of all users' (symbols × base currency) pairs.
- A **per-user `price-db.ledger` file** that is a deterministic projection of the shared cache, regenerated atomically on every refresh.
- An **in-process daily cron** registered through Next.js's `instrumentation.ts` hook, plus a manual **"Refresh prices"** button on the existing Portfolio page.

The user stops thinking about prices: the cron does the work, the Portfolio page always shows current values, and `ledger -X <base>` Just Works for every report.

## Scope

In:

- New `commodity_price` and `price_fetch_run` SQLite tables.
- A new `lib/prices/` module (Repository + Service + schema + provider + scheduler + formatter), following the existing `lib/journal/` and `lib/templates/` shape.
- A new `instrumentation.ts` at repo root that registers the cron (idempotent under HMR).
- A `node-cron` dependency.
- A one-time migration that imports any pre-existing `price-db.ledger` lines into the shared cache before the first regeneration overwrites the file.
- A header strip + `RefreshPricesButton` on the existing `/portfolio` page surfacing last-run status and a manual trigger.
- A server action under `features/portfolio/actions/refreshPrices.ts`, per the one-action-per-file convention.
- Two new env vars (`PRICE_REFRESH_HOUR`, `PRICE_REFRESH_ENABLED`) wired into the `lib/env` Zod schema.
- Vitest coverage of every pure function (symbols, formatter, migration parser, provider with mocked `fetch`), the repository against a fresh in-memory SQLite, and the service composing them.

Out (named explicitly so they don't creep in):

- Per-user provider configuration. Cryptocompare is the only supported provider.
- An API key / authenticated cryptocompare tier — the public `min-api` endpoint is sufficient at our request volume.
- External / system cron triggers via a public route. The in-process cron is the only scheduler.
- A general "manual price override" UI. Manual `P` directives belong in the user's main journal (the regenerated file's banner documents this).
- Historical backfill from cryptocompare's `histo` endpoints when a day is missed. We only fetch *current* prices.
- Per-user timezones for the cron. Server-local time is the only schedule reference.
- A "Prices" admin / debug page. Last-run status surfaces on the Portfolio header strip.
- Per-user base currency editing (already shipped in `2026-05-24-base-currency-selector-design.md` — we consume `getBaseCurrency()`).
- Rate-limit / quota handling on the API endpoint shape. We coalesce concurrent refreshes with a single in-process lock; nothing more.

## Architecture overview

New module `lib/prices/`:

- `lib/prices/provider.ts` — `fetchPrices(pairs, opts?)`: HTTP client for cryptocompare `pricemulti`. No fs, no db. Pure HTTP + parsing. One retry on 429/5xx; 10s timeout via `AbortSignal.timeout`.
- `lib/prices/symbols.ts` — `normalizeCommoditySymbol(raw)`: quote/whitespace stripping, `$ → USD` mapping, dropping unknowns. Pure function.
- `lib/prices/formatter.ts` — `renderPriceDb(rows)`: turns `CommodityPriceRow[]` into the `price-db.ledger` body (banner + `P` lines). Deterministic; tmpfile+rename produces byte-identical output for the same input.
- `lib/prices/repository.ts` — `CommodityPriceRepository`: `insert(rows)`, `listForQuote(quote)`, `listActiveQuotePairs()`. `PriceFetchRunRepository`: `insert(run)`, `latest()`. CRUD only.
- `lib/prices/service.ts` — `PriceService`: `refreshAll()` (lock-coalesced), `regenerateUserPriceDb(userId)`, `getLastRun()`, plus the one-time migration entry point. The only seam consumers depend on.
- `lib/prices/lock.ts` — `withPriceLock(fn)`: module-scoped promise singleton that coalesces concurrent refreshes into one in-flight call.
- `lib/prices/scheduler.ts` — `registerPriceCron()`: idempotent `node-cron` registration; reads `PRICE_REFRESH_HOUR`; honours `PRICE_REFRESH_ENABLED=false`.
- `lib/prices/migration.ts` — `parseLegacyPriceDb(text)`: parses pre-existing `price-db.ledger` `P` lines into `CommodityPriceRow[]`. Idempotent — the banner check in the service is what guards it from re-running.
- `lib/prices/index.ts` — module surface.

Touched:

- `db/schema/commodityPrice.ts` (new) + `db/schema/priceFetchRun.ts` (new) + `db/schema/index.ts` exports.
- `instrumentation.ts` (new at repo root) — Next.js startup hook.
- `lib/env/index.ts` — adds `PRICE_REFRESH_HOUR`, `PRICE_REFRESH_ENABLED` to the Zod schema.
- `lib/journal/repository.ts` — already exposes `listCommodities(userId)` from the base-currency work; reused here unchanged.
- `features/portfolio/Portfolio.tsx` — mounts the new `<PriceStatus />` + `<RefreshPricesButton />` strip above the existing holdings table.
- `features/portfolio/RefreshPricesButton.tsx` (new, client).
- `features/portfolio/PriceStatus.tsx` (new, server).
- `features/portfolio/actions/refreshPrices.ts` (new, server action).
- `.env.example` — documents the two new vars.
- `package.json` — `node-cron` and its types.
- `PLAN.md` — Phase 6 gains `Daily price fetcher (in-process cron + Portfolio refresh button)`, marked complete on landing.

Nothing in the auth flow, journal mutation pipeline, transaction parser, or other report pages changes.

## Section 1 — Data model

`db/schema/commodityPrice.ts`:

```ts
import { sqliteTable, integer, text, real, unique } from 'drizzle-orm/sqlite-core';

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
    unique('commodity_price_unique_per_day').on(t.symbol, t.quote, t.fetchedDate),
  ],
);

export type CommodityPriceRow = typeof commodityPrice.$inferSelect;
```

Notes:

- **`fetchedAt` vs `fetchedDate`** — `fetchedAt` is the precise timestamp the row was fetched (rendered into the `P` line so ledger sees a real time). `fetchedDate` is `YYYY-MM-DD` derived from `fetchedAt` in the user's server-local TZ; it backs the unique index so multiple intra-day refreshes (cron retry + manual button) collapse to one row per pair per day.
- Re-running the cron or hitting the button N times in a day **upserts** rather than appending. The service does `INSERT … ON CONFLICT(symbol, quote, fetched_date) DO UPDATE SET price = excluded.price, fetched_at = excluded.fetched_at`. Idempotent.
- No FK to users — prices are global. The user-scoped projection happens in `regenerateUserPriceDb`.

`db/schema/priceFetchRun.ts`:

```ts
import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core';

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

Notes:

- One row per `refreshAll()` invocation, success or failure. `latest()` is what the Portfolio header strip reads.
- `completedAt` is null while in flight; the Portfolio strip uses it to render a "Running…" state if the user happens to load the page mid-run.
- `errorMessage` is sanitized — the provider strips secrets and absolute paths before persisting (mirrors the `lib/journal/verify.ts` sanitization rule).

## Section 2 — Provider contract

`lib/prices/provider.ts`:

```ts
export type QuotePair = { symbol: string; quote: string };
export type PriceQuote = QuotePair & { price: number; fetchedAt: Date };

export type ProviderResult = {
  quotes: PriceQuote[];
  failed: QuotePair[];
};

export async function fetchPrices(
  pairs: QuotePair[],
  opts?: { signal?: AbortSignal },
): Promise<ProviderResult>;
```

Behavior:

- Groups `pairs` by `quote` (one request per unique tsyms set), then collapses fsyms into a single URL per group, capping the URL length at 2KB and splitting into multiple requests if needed.
- Endpoint: `https://min-api.cryptocompare.com/data/pricemulti?fsyms=<SYMS>&tsyms=<QUOTES>`.
- 10s timeout via `AbortSignal.timeout(10_000)` composed with any caller-supplied signal.
- One retry on HTTP 429 / 5xx with a 1s delay. No further retries — the cron runs daily and the manual button is one click; failures are visible immediately.
- Missing-from-response pairs land in `failed[]`. The service decides whether to mark the run `partial`.
- Returned `PriceQuote.fetchedAt` is the same `Date` instance for every quote in a single `fetchPrices` call (the response timestamp; cryptocompare doesn't supply per-symbol times for this endpoint). The service uses that to compute `fetchedDate`.

Pure HTTP + parsing. No DB, no fs, no env reads. Unit-tested with `vi.fn` on `globalThis.fetch`.

## Section 3 — Symbol normalization

`lib/prices/symbols.ts`:

```ts
export function normalizeCommoditySymbol(raw: string): string | null;
```

Rules (applied in order):

1. Trim, strip surrounding single or double quotes (`'1INCH'` → `1INCH`).
2. Map `$` → `USD`.
3. If the result contains whitespace, `/`, or any character outside `[A-Z0-9]`, return `null` (cryptocompare won't know it).
4. Otherwise return the uppercased symbol.

The service additionally filters out the user's own base currency before calling the provider. The base-currency filter lives in the service (it needs `getBaseCurrency(userId)`), not in `normalizeCommoditySymbol` (which is pure).

Unit-tested fixtures: `'1INCH'`, `$`, `EUR`, `BTC`, `My Stock`, `''`, `'A B'`.

## Section 4 — Service composition

`lib/prices/service.ts`:

```ts
type RefreshResult =
  | { status: 'success'; fetched: number }
  | { status: 'partial'; fetched: number; failed: string[] }
  | { status: 'failed'; message: string };

class PriceService {
  async refreshAll(): Promise<RefreshResult>;
  async regenerateUserPriceDb(userId: string): Promise<void>;
  async getLastRun(): Promise<PriceFetchRun | null>;
}

export const priceService = new PriceService(/* repos + provider + journalRepo */);
```

`refreshAll()` flow (wrapped in `withPriceLock`):

1. Insert a `priceFetchRun` row with `startedAt = now`, `status = 'success'` placeholder; capture the inserted `id` for the final update.
2. Select every row from the `user` table → for each: `journalRepository.listCommodities(userId)` + `getBaseCurrency(userId)` (both already cached via existing helpers). Normalize symbols; drop the user's own base; build the global union set of `QuotePair`s.
3. **First-run migration check.** For each user whose `price-db.ledger` exists and lacks our banner, `parseLegacyPriceDb(text)` → upsert into `commodity_price` (best-effort; parse failures logged but don't fail the run).
4. `provider.fetchPrices(union)` → `{ quotes, failed }`.
5. `commodityPriceRepository.insert(quotes)` (upsert on conflict; transaction).
6. For each user, `regenerateUserPriceDb(userId)` (atomic write + per-user `revalidateTag`).
7. Update the run row: `completedAt = now`, `status = failed.length === 0 ? 'success' : 'partial'`, `symbolsFetched`, `symbolsFailed`, `errorMessage = failed.map(p => \`${p.symbol}/${p.quote}\`).join(', ') || null`.
8. Return `RefreshResult` for the toast.

On thrown error (network / DB / unexpected): catch at the top, update the run row to `status='failed'` with sanitized message, **do not** regenerate any user file (last good file stays), return `{ status: 'failed', message }`.

`regenerateUserPriceDb(userId)`:

1. `journalRepository.ensureLayout(userId)` → resolves `dir`, ensures the journal directory exists.
2. `getBaseCurrency(userId)` → base quote currency.
3. `commodityPriceRepository.listForQuote(base)` → ordered by `fetchedAt ASC`.
4. Filter rows to symbols the user actually holds (intersection with `listCommodities`); this keeps a user's file lean even though the table is global.
5. `renderPriceDb(rows)` → text body.
6. `journalRepository.writeFileAtomic(path.join(dir, PRICE_DB_NAME), body)`.
7. `revalidateTag(getJournalCacheTag(userId))`.

If the user holds no convertible commodities, the file ends up containing just the banner — ledger ignores it (no `P` lines).

## Section 5 — File rendering

`lib/prices/formatter.ts`:

```ts
const BANNER = [
  '; AUTO-GENERATED by ledger-cli-ui price fetcher.',
  '; Do not edit by hand — this file is overwritten on every refresh.',
  '; Manual price overrides belong in your main journal.',
].join('\n');

const BANNER_MARKER = 'AUTO-GENERATED by ledger-cli-ui';

export function renderPriceDb(rows: CommodityPriceRow[]): string {
  const generatedAt = `; Last regenerated: ${new Date().toISOString()}`;
  const lines = rows.map((r) => {
    const d = formatLedgerDateTime(r.fetchedAt); // 'YYYY/MM/DD HH:MM:SS'
    return `P ${d} ${r.symbol} ${r.price} ${r.quote}`;
  });
  return [BANNER, generatedAt, '', ...lines, ''].join('\n');
}

export function hasGeneratedBanner(text: string): boolean {
  return text.includes(BANNER_MARKER);
}
```

- Deterministic given the same rows (the only non-pure bit is `new Date().toISOString()` in the header; that's by design — the user wants to see when the file was last regenerated).
- `formatLedgerDateTime` is added to `utils/formatDate.ts` (existing helper module).
- `hasGeneratedBanner` is the migration guard: any file without the marker is fair game for `parseLegacyPriceDb`.

`lib/prices/migration.ts`:

```ts
export function parseLegacyPriceDb(text: string): CommodityPriceRow[];
```

- Iterates lines; matches `^P\s+(\S+)\s+(\S+)\s+(\S+)\s+(.+?)\s+(\S+)\s*$` (date, time, symbol, price, quote).
- Tolerates the time being optional (`P YYYY/MM/DD SYM PRICE QCCY`).
- Skips comments, blank lines, and malformed entries; logs counts at debug level.
- Returns rows with `fetchedDate` derived from the parsed date. `id` is omitted (auto-assigned on insert).

Idempotency: re-running migration on the same file is a no-op once the banner is present; even if a banner-less file were processed twice, the unique constraint on `(symbol, quote, fetchedDate)` swallows the second pass.

## Section 6 — Scheduling

`lib/prices/scheduler.ts`:

```ts
import cron from 'node-cron';
import { priceService } from './service';

let scheduled: cron.ScheduledTask | null = null;

export function registerPriceCron(): void {
  if (scheduled) return;
  if (process.env.PRICE_REFRESH_ENABLED === 'false') return;
  const hour = Number(process.env.PRICE_REFRESH_HOUR ?? '6');
  const expr = `0 ${hour} * * *`;
  scheduled = cron.schedule(expr, () => {
    void priceService.refreshAll().catch((err) => {
      console.error('[prices] scheduled refresh failed:', err);
    });
  });
}
```

`instrumentation.ts` (repo root):

```ts
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { registerPriceCron } = await import('@/lib/prices/scheduler');
  registerPriceCron();
}
```

- Idempotent — second invocation under HMR or repeated server starts is a no-op.
- Dynamic import keeps `node-cron` out of the edge bundle.
- Disabled in tests via `PRICE_REFRESH_ENABLED=false` (set in `vitest.config.ts`).

`lib/prices/lock.ts`:

```ts
let inflight: Promise<RefreshResult> | null = null;

export function withPriceLock(fn: () => Promise<RefreshResult>): Promise<RefreshResult> {
  if (inflight) return inflight;
  inflight = fn().finally(() => { inflight = null; });
  return inflight;
}
```

Two simultaneous callers (cron + button) get the same in-flight promise; one HTTP call, one toast each.

## Section 7 — UI surface

`features/portfolio/Portfolio.tsx` mounts a header strip above the existing holdings table:

```
┌────────────────────────────────────────────────────────────┐
│ Portfolio                                         [ ? ]    │
│                                                            │
│ Last refresh: 4 hours ago · 12/14 symbols          [↻]    │
│ Next scheduled refresh: tomorrow at 06:00                  │
└────────────────────────────────────────────────────────────┘
```

`features/portfolio/PriceStatus.tsx` (server component):

- Reads `priceService.getLastRun()`.
- Renders:
  - "Last refresh: never" when null.
  - "Last refresh: <relative time> · <fetched>/<fetched+failed> symbols" otherwise.
  - "Refresh failed <relative time> — <sanitized message>" when `status='failed'`.
- Second line shows the next scheduled fire time computed from `PRICE_REFRESH_HOUR`.

`features/portfolio/RefreshPricesButton.tsx` (client):

- shadcn `Button` variant=`outline` size=`sm`, lucide `RefreshCw` icon, `animate-spin` while in flight.
- Calls `refreshPricesAction()`.
- Result branching:
  - `success` → `toast.success('Prices refreshed — N symbols')`.
  - `partial` → `toast.warning('Prices refreshed with skipped symbols: …')`.
  - `failed` → `toast.error('Refresh failed — <message>')`.
- After resolve, `router.refresh()` to pull the regenerated file's effect through to the portfolio table.

`features/portfolio/actions/refreshPrices.ts` (one action per file):

```ts
'use server';
import { requireUser } from '@/lib/auth/guards';
import { priceService, type RefreshResult } from '@/lib/prices';

export async function refreshPricesAction(): Promise<RefreshResult> {
  const user = await requireUser();
  const result = await priceService.refreshAll();
  await priceService.regenerateUserPriceDb(user.id);
  return result;
}
```

Note: `refreshAll()` regenerates *every* user's file in step 6 — including the caller's. The extra `regenerateUserPriceDb` call here exists only to make the caller's file freshness independent of step 6's per-user loop ordering, and is cheap (one DB read + one atomic write).

## Section 8 — Env vars

`lib/env/index.ts` additions:

```ts
PRICE_REFRESH_HOUR: z.coerce.number().int().min(0).max(23).default(6),
PRICE_REFRESH_ENABLED: z
  .union([z.literal('true'), z.literal('false')])
  .default('true')
  .transform((v) => v === 'true'),
```

`.env.example` additions (under a new "Prices" section):

```
# === Prices =================================================================
# Hour-of-day (server-local) when the price-fetch cron runs. 0-23. Default: 6.
PRICE_REFRESH_HOUR=6

# Set to 'false' to disable the in-process cron entirely (useful for tests
# or external schedulers). Defaults to 'true'.
PRICE_REFRESH_ENABLED=true
```

## Section 9 — Testing

Following the existing convention (`*.test.ts` next to source, Vitest, no Next.js runtime).

**Pure functions:**

- `lib/prices/symbols.test.ts` — quote stripping, `$`→`USD`, base-ccy filter (in the service caller, but `normalizeCommoditySymbol` itself returns `null` for whitespace / non-alnum).
- `lib/prices/formatter.test.ts` — banner is present, lines are deterministic for the same row set, empty input returns banner-only output, `hasGeneratedBanner` detects the marker.
- `lib/prices/migration.test.ts` — `parseLegacyPriceDb` with fixture lines (with-time, no-time, malformed, comments). Idempotency under re-run.

**Provider (HTTP mocked):**

- `lib/prices/provider.test.ts` — happy path with `pricemulti` JSON; missing symbol → `failed[]`; 429 → one retry → success; timeout → throws; URL splitting when pair count exceeds the 2KB cap.

**Repository (fresh in-memory SQLite per test):**

- `lib/prices/repository.test.ts` — unique-per-day constraint dedupes on upsert; `listForQuote` ordering; `PriceFetchRunRepository.latest()` returns the most recent row.

**Service (composes everything, `fetch` mocked):**

- `lib/prices/service.test.ts` — `refreshAll` with two users on different base currencies produces one provider call covering the union; `regenerateUserPriceDb` writes banner + lines + ends with trailing newline; `withPriceLock` coalesces concurrent calls (assert one fetch, two callers, same result); failure path inserts `priceFetchRun` with `status='failed'`; first-run migration imports a fixture `price-db.ledger` then regenerates over it.

**Manual smoke test (`pnpm dev`, documented in the PR description):**

1. Hit Portfolio with an empty `commodity_price` table → "Last refresh: never", "Next scheduled refresh: today/tomorrow at 06:00".
2. Click Refresh → toast success, prices appear in the table, file written under `${DATA_DIR}/journals/<userId>/price-db.ledger` containing the banner + `P` lines.
3. Restart dev server → exactly one `registerPriceCron()` log line (idempotent).
4. Click Refresh twice in rapid succession → one HTTP call (verified in the dev-tools Network panel by reading server logs), both clicks get a success toast.
5. Manually edit `price-db.ledger` to insert junk, click Refresh → file regenerated, junk overwritten, banner present.

## Section 10 — Risks & mitigations

- **cryptocompare API outage.** Cron run logs `failed`; portfolio strip surfaces the failure; user's last-good `price-db.ledger` stays in place because we skip the regenerate step on top-level failure. Reports remain accurate to the last successful run.
- **cryptocompare introduces a fiat-only / crypto-only split or breaks `pricemulti`.** Provider is a single file behind a typed contract; swapping to another provider is a one-file change.
- **Bloating `commodity_price` over years.** ~50 unique pairs × 365 days × 10 years ≈ 180k rows. Trivial for SQLite; no maintenance required in this phase.
- **User edits `price-db.ledger` and is surprised it's clobbered.** The banner is the only mitigation in this phase. Manual-override support is explicitly out of scope.
- **Schedule drift across DST.** `node-cron` follows server-local time; we accept one extra / one missing run per DST flip. Not worth special-casing.
- **Sensitive data in `errorMessage`.** Sanitization removes absolute paths and any URL-form query strings before persisting. Mirrors `lib/journal/verify.ts`.
