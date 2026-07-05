# CoinGecko Price Provider + Commodity Mapping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the dead CryptoCompare price fetcher with CoinGecko, driven by a per-user symbol→provider mapping, so every priceable commodity resolves correctly and unpriceable local commodities (Iranian gold coins, custom assets) fall to manual entry instead of silently failing.

**Architecture:** A per-user `commodity_mapping` table records each symbol's `kind` (`crypto` | `fiat` | `manual`) and `providerId` (CoinGecko id, ISO fiat code, or null). A classifier auto-fills mappings for unseen symbols (ISO-fiat set → CoinGecko market-cap-ranked coin list → manual fallback). The provider issues **one** CoinGecko `/simple/price` request in USD: crypto ids resolve directly, fiat commodities resolve via a tether pivot. Prices are always stored quoted in **USD** — the pricing base is forced to USD (existing USDT users migrated). A `CommodityCombobox` backed by a server search action (CoinGecko `/search` proxy) lets users pick the exact coin at point of use, and a Currencies screen reconciles existing/unmapped symbols.

**Tech Stack:** Next.js (App Router, server actions), Drizzle ORM + Postgres, Zod, Vitest, `cmdk` (via existing `Combobox`), `node-cron`, pino.

## Global Constraints

- No abbreviations in identifiers (spell out fully; canonical acronyms `id`/`url`/`json`/`usd`/`api` allowed). Copy verbatim from CLAUDE.md naming rules.
- No self-reference to any AI tool in code, comments, commits, or docs.
- Commit messages: Conventional Commits, no `Co-Authored-By` trailer, no tool attribution.
- Pricing base currency = **USD**. Every stored `commodity_price.quote` and generated `P` directive is `USD`.
- CoinGecko free/demo tier: no API key required for `/simple/price`, `/coins/markets`, `/search`. Rate limit ~30 req/min — one daily batch + debounced/cached search stays well under.
- Provider issues the **minimum** number of HTTP calls (one `/simple/price` per URL-length chunk), never one-per-pair.
- Drizzle-kit is scoped by `tablesFilter` in `drizzle.config.ts` — every new app table MUST be added to that array or migrations ignore it.
- All server actions call `requireUser()` from `@/lib/auth/require-user` and rate-limit writes via `@/lib/rate-limit`.

---

## File Structure

**New files:**
- `lib/prices/fiat.ts` — ISO-4217 ∩ CoinGecko supported fiat set + `isFiatCode()`.
- `lib/prices/coingecko/coinCache.ts` — cached CoinGecko coin universe (symbol→id by market cap) + `/search` proxy.
- `lib/prices/coingecko/coinCache.test.ts`
- `lib/prices/classify.ts` — `classifyCommodity(symbol, deps)` → `{ kind, providerId }`.
- `lib/prices/classify.test.ts`
- `lib/prices/mappingRepository.ts` — `CommodityMappingRepository` (CRUD for `commodity_mapping`).
- `lib/prices/mappingRepository.test.ts`
- `db/schema/commodityMapping.ts` — Drizzle table.
- `features/currencies/actions/searchCommodities.ts` — server search action (CoinGecko `/search` + fiat + manual).
- `features/currencies/actions/upsertMapping.ts` — persist a user's mapping.
- `features/currencies/actions/listMappings.ts` — list in-use symbols with current mapping.
- `features/currencies/actions/types.ts`
- `features/currencies/actions/index.ts`
- `features/currencies/CurrenciesView.tsx` — reconcile/manage screen (client).
- `components/CommodityCombobox/CommodityCombobox.tsx` — rich combobox (server search, shows name+symbol+rank).
- `app/currencies/page.tsx` — route shell.

**Modified files:**
- `lib/prices/provider.ts` — rewrite for CoinGecko `/simple/price` + fiat pivot. New export `fetchPricesUsd`.
- `lib/prices/provider.test.ts` — rewrite for CoinGecko shape.
- `lib/prices/service.ts:148-219` (`runOnce`) + `resolveBaseCurrency` — build fetch plan from mappings; force USD.
- `lib/prices/index.ts` — export new repo/provider symbols.
- `lib/env/index.ts:59-64` — add `COINGECKO_API_BASE` (default public), drop nothing.
- `db/schema/index.ts` — export `commodityMapping`.
- `drizzle.config.ts:14-24` — add `commodity_mapping` to `tablesFilter`.
- `features/transactions/entry/typeForms/fields.tsx:99-117` (`CurrencyCombobox`) — optionally back with `CommodityCombobox` + persist mapping on pick.
- `features/prices/PricesView.tsx:122-125` — symbol input uses `CommodityCombobox`.
- `lib/prices/scheduler.ts` + `lib/prices/symbols.ts` doc comments — drop CryptoCompare references.

---

## Task 1: Supported fiat set

**Files:**
- Create: `lib/prices/fiat.ts`
- Test: `lib/prices/fiat.test.ts`

**Interfaces:**
- Produces: `SUPPORTED_FIAT: ReadonlySet<string>` (uppercase ISO codes CoinGecko can quote), `isFiatCode(symbol: string): boolean`.

- [ ] **Step 1: Write the failing test**

```typescript
// lib/prices/fiat.test.ts
import { describe, it, expect } from 'vitest';
import { isFiatCode, SUPPORTED_FIAT } from './fiat';

describe('isFiatCode', () => {
  it('recognizes CoinGecko-quotable fiats (case-insensitive)', () => {
    for (const code of ['USD', 'EUR', 'TRY', 'AUD', 'CAD', 'GEL', 'gel']) {
      expect(isFiatCode(code)).toBe(true);
    }
  });
  it('rejects crypto and local symbols', () => {
    for (const code of ['BTC', 'ADA', 'KIRT', 'SEKKE', 'NIM']) {
      expect(isFiatCode(code)).toBe(false);
    }
  });
  it('exposes USD in the set', () => {
    expect(SUPPORTED_FIAT.has('USD')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run lib/prices/fiat.test.ts`
Expected: FAIL — `Cannot find module './fiat'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// lib/prices/fiat.ts
/**
 * ISO-4217 fiat codes CoinGecko can quote via `vs_currencies`. This is the
 * intersection of ISO-4217 with CoinGecko's supported_vs_currencies, pinned as
 * a static list so classification needs no network call. Extend as needed; a
 * fiat absent here falls through to the crypto/manual classifier.
 */
export const SUPPORTED_FIAT: ReadonlySet<string> = new Set([
  'USD', 'EUR', 'TRY', 'AUD', 'CAD', 'GEL', 'GBP', 'JPY', 'CHF', 'CNY',
  'INR', 'RUB', 'BRL', 'ZAR', 'KRW', 'MXN', 'SEK', 'NOK', 'DKK', 'PLN',
  'HKD', 'SGD', 'NZD', 'AED', 'SAR', 'THB', 'IDR', 'MYR', 'PHP', 'CZK',
  'HUF', 'ILS', 'CLP', 'BHD', 'KWD', 'VND', 'UAH', 'NGN', 'ARS', 'BDT',
]);

export const isFiatCode = (symbol: string): boolean =>
  SUPPORTED_FIAT.has(symbol.trim().toUpperCase());
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run lib/prices/fiat.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/prices/fiat.ts lib/prices/fiat.test.ts
git commit -m "feat(prices): add CoinGecko-supported fiat set"
```

---

## Task 2: CoinGecko coin cache + search proxy

**Files:**
- Create: `lib/prices/coingecko/coinCache.ts`
- Test: `lib/prices/coingecko/coinCache.test.ts`
- Modify: `lib/env/index.ts:53-64` (add `COINGECKO_API_BASE`)

**Interfaces:**
- Consumes: `env.COINGECKO_API_BASE`.
- Produces:
  - `getCoinSymbolMap(opts?: { signal?: AbortSignal }): Promise<Map<string, string>>` — uppercase symbol → CoinGecko id, highest-market-cap winner per symbol. Cached in-process with a 24h TTL.
  - `searchCoins(query: string, opts?): Promise<CoinSearchHit[]>` — proxy of CoinGecko `/search`.
  - `type CoinSearchHit = { id: string; symbol: string; name: string; marketCapRank: number | null; thumb: string | null }`.
  - `resetCoinCache(): void` — test seam.

- [ ] **Step 1: Add env var**

In `lib/env/index.ts`, inside the `.extend({...})` block near the `// Prices` group (line 59), add:

```typescript
    // Prices
    COINGECKO_API_BASE: z.string().url().default('https://api.coingecko.com/api/v3'),
    PRICE_REFRESH_HOUR: z.coerce.number().int().min(0).max(23).default(6),
```

- [ ] **Step 2: Write the failing test**

```typescript
// lib/prices/coingecko/coinCache.test.ts
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { getCoinSymbolMap, searchCoins, resetCoinCache } from './coinCache';

const ok = (body: unknown): Response =>
  ({ ok: true, status: 200, json: async () => body }) as Response;

describe('coinCache', () => {
  beforeEach(() => resetCoinCache());
  afterEach(() => vi.restoreAllMocks());

  it('maps a symbol to its highest-market-cap id', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      ok([
        { id: 'cardano', symbol: 'ada', market_cap_rank: 16 },
        { id: 'cardano-wormhole', symbol: 'ada', market_cap_rank: 3000 },
        { id: 'bitcoin', symbol: 'btc', market_cap_rank: 1 },
      ])
    );
    const map = await getCoinSymbolMap();
    expect(map.get('ADA')).toBe('cardano');
    expect(map.get('BTC')).toBe('bitcoin');
  });

  it('caches within TTL (one fetch for two calls)', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(ok([{ id: 'bitcoin', symbol: 'btc', market_cap_rank: 1 }]));
    await getCoinSymbolMap();
    await getCoinSymbolMap();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('normalizes /search hits', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      ok({
        coins: [
          { id: 'cardano', name: 'Cardano', symbol: 'ADA', market_cap_rank: 16, thumb: 't.png' },
        ],
      })
    );
    const hits = await searchCoins('cardano');
    expect(hits[0]).toEqual({
      id: 'cardano', symbol: 'ADA', name: 'Cardano', marketCapRank: 16, thumb: 't.png',
    });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm exec vitest run lib/prices/coingecko/coinCache.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Write minimal implementation**

```typescript
// lib/prices/coingecko/coinCache.ts
import { env } from '@/lib/env';

export type CoinSearchHit = {
  id: string;
  symbol: string;
  name: string;
  marketCapRank: number | null;
  thumb: string | null;
};

type MarketCoin = { id: string; symbol: string; market_cap_rank: number | null };
type SearchResponse = {
  coins?: Array<{
    id: string;
    name: string;
    symbol: string;
    market_cap_rank: number | null;
    thumb: string | null;
  }>;
};

const TTL_MS = 24 * 60 * 60 * 1000;
const MARKET_PAGES = 4; // 4 * 250 = top 1000 coins by market cap
const TIMEOUT_MS = 15_000;

let cached: { at: number; map: Map<string, string> } | null = null;
let inFlight: Promise<Map<string, string>> | null = null;

export const resetCoinCache = (): void => {
  cached = null;
  inFlight = null;
};

const nowMs = (): number => Date.now();

const fetchJson = async (url: string, signal?: AbortSignal): Promise<unknown> => {
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  const merged = signal ? AbortSignal.any([signal, timeout]) : timeout;
  const res = await fetch(url, { signal: merged });
  if (!res.ok) throw new Error(`CoinGecko ${res.status} for ${url}`);
  return res.json();
};

const buildMap = async (signal?: AbortSignal): Promise<Map<string, string>> => {
  const map = new Map<string, string>();
  // Walk top pages by descending market cap; first-writer-wins per symbol means
  // the highest-cap coin claims an ambiguous ticker (e.g. ADA → cardano).
  for (let page = 1; page <= MARKET_PAGES; page++) {
    const url = `${env.COINGECKO_API_BASE}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=${page}`;
    const rows = (await fetchJson(url, signal)) as MarketCoin[];
    if (!Array.isArray(rows) || rows.length === 0) break;
    for (const row of rows) {
      const key = row.symbol?.toUpperCase();
      if (key && !map.has(key)) map.set(key, row.id);
    }
  }
  return map;
};

export const getCoinSymbolMap = async (
  opts?: { signal?: AbortSignal }
): Promise<Map<string, string>> => {
  if (cached && nowMs() - cached.at < TTL_MS) return cached.map;
  if (inFlight) return inFlight;
  inFlight = buildMap(opts?.signal)
    .then((map) => {
      cached = { at: nowMs(), map };
      return map;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
};

export const searchCoins = async (
  query: string,
  opts?: { signal?: AbortSignal }
): Promise<CoinSearchHit[]> => {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const url = `${env.COINGECKO_API_BASE}/search?query=${encodeURIComponent(trimmed)}`;
  const body = (await fetchJson(url, opts?.signal)) as SearchResponse;
  return (body.coins ?? []).map((c) => ({
    id: c.id,
    symbol: c.symbol,
    name: c.name,
    marketCapRank: c.market_cap_rank ?? null,
    thumb: c.thumb ?? null,
  }));
};
```

> Note: `Date.now()` is used here (production code, not a workflow script) — that constraint only applies to Workflow scripts.

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm exec vitest run lib/prices/coingecko/coinCache.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add lib/prices/coingecko/coinCache.ts lib/prices/coingecko/coinCache.test.ts lib/env/index.ts
git commit -m "feat(prices): add CoinGecko coin cache and search proxy"
```

---

## Task 3: Commodity classifier

**Files:**
- Create: `lib/prices/classify.ts`
- Test: `lib/prices/classify.test.ts`

**Interfaces:**
- Consumes: `isFiatCode` (Task 1), a `Map<string,string>` symbol→id (Task 2 shape).
- Produces:
  - `type CommodityKind = 'crypto' | 'fiat' | 'manual'`
  - `type Classification = { kind: CommodityKind; providerId: string | null }`
  - `classifyCommodity(symbol: string, coinMap: Map<string, string>): Classification`

- [ ] **Step 1: Write the failing test**

```typescript
// lib/prices/classify.test.ts
import { describe, it, expect } from 'vitest';
import { classifyCommodity } from './classify';

const coinMap = new Map<string, string>([
  ['BTC', 'bitcoin'],
  ['ADA', 'cardano'],
  ['NIM', 'nimiq'], // collides with the Iranian half gold-coin
]);

describe('classifyCommodity', () => {
  it('classifies known fiat first, before any coin match', () => {
    expect(classifyCommodity('EUR', coinMap)).toEqual({ kind: 'fiat', providerId: 'EUR' });
    expect(classifyCommodity('gel', coinMap)).toEqual({ kind: 'fiat', providerId: 'GEL' });
  });
  it('classifies a market-cap-ranked coin as crypto', () => {
    expect(classifyCommodity('btc', coinMap)).toEqual({ kind: 'crypto', providerId: 'bitcoin' });
    expect(classifyCommodity('ADA', coinMap)).toEqual({ kind: 'crypto', providerId: 'cardano' });
  });
  it('falls through to manual for unknown symbols', () => {
    expect(classifyCommodity('KIRT', coinMap)).toEqual({ kind: 'manual', providerId: null });
    expect(classifyCommodity('SEKKE', coinMap)).toEqual({ kind: 'manual', providerId: null });
  });
});
```

Note: this test documents that the *auto* classifier maps `NIM`→crypto (Nimiq). That collision is why a user-set mapping override exists (Tasks 4/8/10); the classifier alone cannot know the user means gold. `NIM` is intentionally NOT asserted here.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run lib/prices/classify.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```typescript
// lib/prices/classify.ts
import { isFiatCode } from './fiat';

export type CommodityKind = 'crypto' | 'fiat' | 'manual';
export type Classification = { kind: CommodityKind; providerId: string | null };

/**
 * Auto-classify a normalized commodity symbol against reference data. Order is
 * deliberate: fiat is checked before the coin list because some ISO codes also
 * exist as low-cap tokens. A symbol that is neither a supported fiat nor a
 * ranked coin is `manual` — the user must supply its price.
 *
 * This is a best-effort default. Ticker namespaces overlap (a real coin can
 * share a symbol with a user's local commodity, e.g. NIM/Nimiq), so a user-set
 * mapping always overrides this result upstream.
 */
export const classifyCommodity = (
  symbol: string,
  coinMap: Map<string, string>
): Classification => {
  const upper = symbol.trim().toUpperCase();
  if (isFiatCode(upper)) return { kind: 'fiat', providerId: upper };
  const id = coinMap.get(upper);
  if (id) return { kind: 'crypto', providerId: id };
  return { kind: 'manual', providerId: null };
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run lib/prices/classify.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/prices/classify.ts lib/prices/classify.test.ts
git commit -m "feat(prices): add commodity classifier (fiat/crypto/manual)"
```

---

## Task 4: commodity_mapping table + repository + migration

**Files:**
- Create: `db/schema/commodityMapping.ts`
- Modify: `db/schema/index.ts:6`, `drizzle.config.ts:14-24`
- Create: `lib/prices/mappingRepository.ts`
- Test: `lib/prices/mappingRepository.test.ts`

**Interfaces:**
- Produces:
  - Table `commodity_mapping` columns: `id serial pk`, `userId text -> user.id cascade`, `symbol text`, `kind text`, `providerId text null`, `source text` (`'auto' | 'user'`), `updatedAt timestamp`. Unique `(userId, symbol)`.
  - `type CommodityMapping = typeof commodityMapping.$inferSelect`
  - `class CommodityMappingRepository` with:
    - `listForUser(userId: string): Promise<CommodityMapping[]>`
    - `mapForUser(userId: string): Promise<Map<string, CommodityMapping>>` (keyed by symbol)
    - `upsert(row: { userId; symbol; kind; providerId; source }): Promise<void>` (conflict on `(userId, symbol)`, updates kind/providerId/source/updatedAt)
    - `upsertMany(rows): Promise<void>`

- [ ] **Step 1: Write the schema**

```typescript
// db/schema/commodityMapping.ts
import { sql } from 'drizzle-orm';
import { user } from '@naeemba/next-starter/schema';
import { pgTable, serial, text, timestamp, unique } from 'drizzle-orm/pg-core';

export const commodityMapping = pgTable(
  'commodity_mapping',
  {
    id: serial('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    symbol: text('symbol').notNull(),
    // 'crypto' | 'fiat' | 'manual'
    kind: text('kind').notNull(),
    // CoinGecko id (crypto), ISO fiat code (fiat), or null (manual).
    providerId: text('provider_id'),
    // 'auto' = filled by the classifier; 'user' = explicitly chosen. A 'user'
    // row is never overwritten by the classifier.
    source: text('source').notNull().default('auto'),
    updatedAt: timestamp('updated_at')
      .notNull()
      .default(sql`now()`),
  },
  (t) => [unique('commodity_mapping_unique_per_symbol').on(t.userId, t.symbol)]
);

export type CommodityMapping = typeof commodityMapping.$inferSelect;
```

- [ ] **Step 2: Register the table**

In `db/schema/index.ts`, add after the `commodityPrice` export (line 6):

```typescript
export { commodityMapping, type CommodityMapping } from './commodityMapping';
```

In `drizzle.config.ts`, add `'commodity_mapping'` to the `tablesFilter` array (line 14-24).

- [ ] **Step 3: Write the failing repository test**

```typescript
// lib/prices/mappingRepository.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { CommodityMappingRepository } from './mappingRepository';
import { makeTestDb, seedUser } from '@/test/db'; // follow existing repo test harness

describe('CommodityMappingRepository', () => {
  let repo: CommodityMappingRepository;
  let userId: string;

  beforeEach(async () => {
    const db = await makeTestDb();
    userId = await seedUser(db);
    repo = new CommodityMappingRepository(db);
  });

  it('upserts and lists by user', async () => {
    await repo.upsert({ userId, symbol: 'BTC', kind: 'crypto', providerId: 'bitcoin', source: 'auto' });
    const rows = await repo.listForUser(userId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ symbol: 'BTC', kind: 'crypto', providerId: 'bitcoin' });
  });

  it('overwrites on conflict (userId, symbol)', async () => {
    await repo.upsert({ userId, symbol: 'NIM', kind: 'crypto', providerId: 'nimiq', source: 'auto' });
    await repo.upsert({ userId, symbol: 'NIM', kind: 'manual', providerId: null, source: 'user' });
    const map = await repo.mapForUser(userId);
    expect(map.get('NIM')).toMatchObject({ kind: 'manual', providerId: null, source: 'user' });
  });
});
```

> If no `@/test/db` harness exists, inspect `lib/prices/repository.test.ts` for the project's DB-test setup and mirror it. Do NOT invent a harness — reuse whatever `repository.test.ts` uses.

- [ ] **Step 4: Run test to verify it fails**

Run: `pnpm exec vitest run lib/prices/mappingRepository.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 5: Write the repository**

```typescript
// lib/prices/mappingRepository.ts
import { eq, sql } from 'drizzle-orm';
import { commodityMapping, type CommodityMapping } from '@/db/schema';
import type { DbInstance } from '@/lib/db/connection';

export type CommodityMappingInput = {
  userId: string;
  symbol: string;
  kind: string;
  providerId: string | null;
  source: 'auto' | 'user';
};

export class CommodityMappingRepository {
  constructor(private readonly db: DbInstance) {}

  async listForUser(userId: string): Promise<CommodityMapping[]> {
    return this.db
      .select()
      .from(commodityMapping)
      .where(eq(commodityMapping.userId, userId))
      .orderBy(commodityMapping.symbol);
  }

  async mapForUser(userId: string): Promise<Map<string, CommodityMapping>> {
    const rows = await this.listForUser(userId);
    return new Map(rows.map((r) => [r.symbol, r]));
  }

  async upsert(row: CommodityMappingInput): Promise<void> {
    await this.upsertMany([row]);
  }

  async upsertMany(rows: CommodityMappingInput[]): Promise<void> {
    if (rows.length === 0) return;
    const deduped = [
      ...new Map(rows.map((r) => [`${r.userId}|${r.symbol}`, r])).values(),
    ];
    await this.db
      .insert(commodityMapping)
      .values(deduped)
      .onConflictDoUpdate({
        target: [commodityMapping.userId, commodityMapping.symbol],
        set: {
          kind: sql`excluded.kind`,
          providerId: sql`excluded.provider_id`,
          source: sql`excluded.source`,
          updatedAt: sql`now()`,
        },
      });
  }
}
```

- [ ] **Step 6: Generate + run the migration**

Run: `pnpm db:generate`
Expected: a new SQL file under `db/migrations/` creating `commodity_mapping`.
Run: `pnpm db:migrate`
Expected: applies cleanly against the dev database.

- [ ] **Step 7: Run test to verify it passes**

Run: `pnpm exec vitest run lib/prices/mappingRepository.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add db/schema/commodityMapping.ts db/schema/index.ts drizzle.config.ts db/migrations lib/prices/mappingRepository.ts lib/prices/mappingRepository.test.ts
git commit -m "feat(prices): add per-user commodity_mapping table and repository"
```

---

## Task 5: Rewrite provider for CoinGecko (USD base + fiat pivot)

**Files:**
- Modify (rewrite): `lib/prices/provider.ts`
- Modify (rewrite): `lib/prices/provider.test.ts`

**Interfaces:**
- Consumes: `env.COINGECKO_API_BASE`.
- Produces (replaces `fetchPrices`/`QuotePair`):
  - `type CryptoTarget = { symbol: string; id: string }`
  - `type FiatTarget = { symbol: string; code: string }` (code = uppercase ISO)
  - `type FetchPlan = { crypto: CryptoTarget[]; fiat: FiatTarget[] }`
  - `type PriceQuote = { symbol: string; quote: 'USD'; price: number; fetchedAt: Date }`
  - `type ProviderResult = { quotes: PriceQuote[]; failed: { symbol: string }[] }`
  - `fetchPricesUsd(plan: FetchPlan, opts?: { signal?: AbortSignal }): Promise<ProviderResult>`

Pricing math (all in USD): crypto `price = resp[id].usd`. Fiat commodity F: `price = resp.tether.usd / resp.tether[Flower]` (value of 1 F in USD via the tether pivot). `tether` is always added to the ids so the pivot is available whenever fiat targets exist.

- [ ] **Step 1: Write the failing test (rewrite the file)**

```typescript
// lib/prices/provider.test.ts
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { fetchPricesUsd } from './provider';

const ok = (body: unknown, status = 200): Response =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

describe('fetchPricesUsd', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-05T06:00:00.000Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('resolves crypto ids to USD prices in one request', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      ok({ bitcoin: { usd: 62655 }, cardano: { usd: 0.19 } })
    );
    const result = await fetchPricesUsd({
      crypto: [
        { symbol: 'BTC', id: 'bitcoin' },
        { symbol: 'ADA', id: 'cardano' },
      ],
      fiat: [],
    });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(result.quotes).toEqual([
      { symbol: 'BTC', quote: 'USD', price: 62655, fetchedAt: expect.any(Date) },
      { symbol: 'ADA', quote: 'USD', price: 0.19, fetchedAt: expect.any(Date) },
    ]);
    expect(result.failed).toEqual([]);
  });

  it('prices a fiat commodity via the tether pivot', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      ok({ tether: { usd: 0.999108, eur: 0.873613 } })
    );
    const result = await fetchPricesUsd({
      crypto: [],
      fiat: [{ symbol: 'EUR', code: 'EUR' }],
    });
    // 1 EUR in USD = tether.usd / tether.eur
    expect(result.quotes[0].symbol).toBe('EUR');
    expect(result.quotes[0].quote).toBe('USD');
    expect(result.quotes[0].price).toBeCloseTo(0.999108 / 0.873613, 6);
    expect(result.failed).toEqual([]);
  });

  it('marks unresolved crypto as failed', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(ok({ bitcoin: { usd: 62655 } }));
    const result = await fetchPricesUsd({
      crypto: [
        { symbol: 'BTC', id: 'bitcoin' },
        { symbol: 'GHOST', id: 'ghostcoin' },
      ],
      fiat: [],
    });
    expect(result.quotes).toHaveLength(1);
    expect(result.failed).toEqual([{ symbol: 'GHOST' }]);
  });

  it('marks fiat as failed when tether pivot is missing', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(ok({ tether: { usd: 1 } }));
    const result = await fetchPricesUsd({
      crypto: [],
      fiat: [{ symbol: 'GEL', code: 'GEL' }],
    });
    expect(result.failed).toEqual([{ symbol: 'GEL' }]);
  });

  it('returns empty without fetching for an empty plan', async () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    const result = await fetchPricesUsd({ crypto: [], fiat: [] });
    expect(spy).not.toHaveBeenCalled();
    expect(result).toEqual({ quotes: [], failed: [] });
  });

  it('retries once on 429', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(ok({}, 429))
      .mockResolvedValueOnce(ok({ bitcoin: { usd: 62655 } }));
    const p = fetchPricesUsd({ crypto: [{ symbol: 'BTC', id: 'bitcoin' }], fiat: [] });
    await vi.advanceTimersByTimeAsync(1000);
    const result = await p;
    expect(spy).toHaveBeenCalledTimes(2);
    expect(result.quotes).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run lib/prices/provider.test.ts`
Expected: FAIL — `fetchPricesUsd` not exported.

- [ ] **Step 3: Write the implementation (replace file contents)**

```typescript
// lib/prices/provider.ts
import { env } from '@/lib/env';

export type CryptoTarget = { symbol: string; id: string };
export type FiatTarget = { symbol: string; code: string };
export type FetchPlan = { crypto: CryptoTarget[]; fiat: FiatTarget[] };

export type PriceQuote = {
  symbol: string;
  quote: 'USD';
  price: number;
  fetchedAt: Date;
};
export type ProviderResult = { quotes: PriceQuote[]; failed: { symbol: string }[] };

type SimplePriceResponse = Record<string, Record<string, number>>;

const MAX_URL_LENGTH = 2000;
const TIMEOUT_MS = 10_000;
const TETHER_ID = 'tether';

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Fetch every commodity price in USD from CoinGecko's `/simple/price`. Crypto
 * ids resolve directly; fiat commodities resolve via the tether pivot
 * (1 unit F in USD = tether.usd / tether.<f>). One request per URL-length
 * chunk; one retry on 429/5xx. `fetchedAt` is a single instant per call so the
 * caller can dedupe upserts by it.
 */
export const fetchPricesUsd = async (
  plan: FetchPlan,
  opts?: { signal?: AbortSignal }
): Promise<ProviderResult> => {
  if (plan.crypto.length === 0 && plan.fiat.length === 0) {
    return { quotes: [], failed: [] };
  }
  const fetchedAt = new Date();

  const vsSet = new Set<string>(['usd']);
  for (const f of plan.fiat) vsSet.add(f.code.toLowerCase());
  const vs = Array.from(vsSet);

  const ids = new Set<string>(plan.crypto.map((c) => c.id));
  if (plan.fiat.length > 0) ids.add(TETHER_ID);

  // Merge all id → quote responses across chunks.
  const merged: SimplePriceResponse = {};
  for (const idChunk of chunkIds(Array.from(ids), vs)) {
    const url =
      `${env.COINGECKO_API_BASE}/simple/price` +
      `?ids=${encodeURIComponent(idChunk.join(','))}` +
      `&vs_currencies=${encodeURIComponent(vs.join(','))}`;
    const body = await fetchWithRetry(url, opts?.signal);
    if (body) Object.assign(merged, body);
  }

  const quotes: PriceQuote[] = [];
  const failed: { symbol: string }[] = [];

  for (const c of plan.crypto) {
    const price = merged[c.id]?.usd;
    if (typeof price === 'number' && Number.isFinite(price)) {
      quotes.push({ symbol: c.symbol, quote: 'USD', price, fetchedAt });
    } else {
      failed.push({ symbol: c.symbol });
    }
  }

  const tetherUsd = merged[TETHER_ID]?.usd;
  for (const f of plan.fiat) {
    const perFiat = merged[TETHER_ID]?.[f.code.toLowerCase()];
    if (
      typeof tetherUsd === 'number' &&
      typeof perFiat === 'number' &&
      Number.isFinite(tetherUsd) &&
      Number.isFinite(perFiat) &&
      perFiat > 0
    ) {
      quotes.push({ symbol: f.symbol, quote: 'USD', price: tetherUsd / perFiat, fetchedAt });
    } else {
      failed.push({ symbol: f.symbol });
    }
  }

  return { quotes, failed };
};

const chunkIds = (ids: string[], vs: string[]): string[][] => {
  const overhead =
    `${env.COINGECKO_API_BASE}/simple/price?ids=&vs_currencies=`.length +
    encodeURIComponent(vs.join(',')).length;
  const budget = MAX_URL_LENGTH - overhead;
  const chunks: string[][] = [];
  let current: string[] = [];
  let len = 0;
  for (const id of ids) {
    const add = (current.length === 0 ? 0 : 1) + encodeURIComponent(id).length;
    if (len + add > budget && current.length > 0) {
      chunks.push(current);
      current = [];
      len = 0;
    }
    current.push(id);
    len += add;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
};

const fetchWithRetry = async (
  url: string,
  signal: AbortSignal | undefined
): Promise<SimplePriceResponse | null> => {
  for (let attempt = 0; attempt < 2; attempt++) {
    const timeout = AbortSignal.timeout(TIMEOUT_MS);
    const merged = signal ? AbortSignal.any([signal, timeout]) : timeout;
    try {
      const res = await fetch(url, { signal: merged });
      if (res.ok) return (await res.json()) as SimplePriceResponse;
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

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run lib/prices/provider.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/prices/provider.ts lib/prices/provider.test.ts
git commit -m "feat(prices): rewrite provider for CoinGecko USD prices with fiat pivot"
```

---

## Task 6: Service integration — plan from mappings, force USD

**Files:**
- Modify: `lib/prices/service.ts` (imports; `resolveBaseCurrency`; `runOnce` lines 148-219; add `buildFetchPlan` + `ensureMappings`)
- Modify: `lib/prices/index.ts` (construct with `mappingRepo`)
- Test: `lib/prices/service.test.ts` (extend/rewrite the fetch-plan expectations)

**Interfaces:**
- Consumes: `CommodityMappingRepository` (Task 4), `getCoinSymbolMap` (Task 2), `classifyCommodity` (Task 3), `fetchPricesUsd`/`FetchPlan` (Task 5).
- Produces: `Deps` gains `mappingRepo: CommodityMappingRepository`. New private `buildFetchPlan(userSymbolsByUser): Promise<FetchPlan>` and `ensureMappings(userId, symbols): Promise<Map<string, CommodityMapping>>`. `resolveBaseCurrency` returns `'USD'` unconditionally (pricing base is USD).

- [ ] **Step 1: Wire the new dependency**

In `lib/prices/index.ts`, add:

```typescript
import { CommodityMappingRepository } from './mappingRepository';
// ...
export const commodityMappingRepository = new CommodityMappingRepository(db);
export const priceService = new PriceService({
  db,
  commodityRepo: commodityPriceRepository,
  runRepo: priceFetchRunRepository,
  journalRepo: journalRepository,
  manualRepo: manualPriceRepository,
  mappingRepo: commodityMappingRepository,
});
// ...append to the re-export block:
export { CommodityMappingRepository } from './mappingRepository';
export { fetchPricesUsd } from './provider';
export type { FetchPlan, PriceQuote, ProviderResult } from './provider';
```

Remove the old `export { fetchPrices } ...` and `export type { QuotePair, ... }` lines (those symbols no longer exist).

- [ ] **Step 2: Update the service — imports and Deps**

In `lib/prices/service.ts` replace the provider import (line 11) and add new imports:

```typescript
import { fetchPricesUsd, type FetchPlan } from './provider';
import type { CommodityMappingRepository } from './mappingRepository';
import { getCoinSymbolMap } from './coingecko/coinCache';
import { classifyCommodity } from './classify';
import type { CommodityMapping } from '@/db/schema';
```

Add to the `Deps` type (line 51-57):

```typescript
  mappingRepo: CommodityMappingRepository;
```

- [ ] **Step 3: Force USD base**

Replace `resolveBaseCurrency` (lines 228-235) with:

```typescript
  // Pricing base is USD: CoinGecko cannot quote USDT, so all fetched prices are
  // stored in USD and journals value with `-X USD`. Kept as a method so callers
  // (price-DB regeneration, prices UI) share one source of truth.
  async resolveBaseCurrency(_userId: string): Promise<string> {
    return 'USD';
  }
```

> `regenerateUserPriceDb` calls `listForQuote(base)` — with base `'USD'` it now reads the USD rows. No other change needed there.

- [ ] **Step 4: Add mapping + plan builders**

Add these private methods to `PriceService`:

```typescript
  /**
   * Ensure every in-use symbol has a mapping row. Symbols with no row are
   * auto-classified and persisted as source='auto'. Existing rows (auto or
   * user) are left untouched so a user override is never clobbered.
   */
  private async ensureMappings(
    userId: string,
    symbols: string[]
  ): Promise<Map<string, CommodityMapping>> {
    const existing = await this.deps.mappingRepo.mapForUser(userId);
    const missing = symbols.filter((s) => !existing.has(s));
    if (missing.length > 0) {
      const coinMap = await getCoinSymbolMap();
      await this.deps.mappingRepo.upsertMany(
        missing.map((symbol) => {
          const { kind, providerId } = classifyCommodity(symbol, coinMap);
          return { userId, symbol, kind, providerId, source: 'auto' as const };
        })
      );
      return this.deps.mappingRepo.mapForUser(userId);
    }
    return existing;
  }

  private planFromMappings(
    mappings: Iterable<CommodityMapping>,
    into: FetchPlan,
    seen: Set<string>
  ): void {
    for (const m of mappings) {
      if (m.kind === 'crypto' && m.providerId) {
        const key = `c:${m.providerId}`;
        if (!seen.has(key)) {
          seen.add(key);
          into.crypto.push({ symbol: m.symbol, id: m.providerId });
        }
      } else if (m.kind === 'fiat' && m.providerId) {
        const key = `f:${m.symbol}`;
        if (!seen.has(key)) {
          seen.add(key);
          into.fiat.push({ symbol: m.symbol, code: m.providerId });
        }
      }
      // kind === 'manual' → skipped: user supplies the price.
    }
  }
```

- [ ] **Step 5: Rewrite the fetch section of `runOnce`**

Replace the pairs-building + fetch block (lines 162-182) with:

```typescript
      const plan: FetchPlan = { crypto: [], fiat: [] };
      const seen = new Set<string>();
      for (const userId of users) {
        const symbols = await this.listNormalizedSymbolsForUser(userId);
        const filtered = symbols.filter((s) => s !== 'USD');
        const mappings = await this.ensureMappings(userId, filtered);
        this.planFromMappings(
          filtered.map((s) => mappings.get(s)).filter((m): m is CommodityMapping => Boolean(m)),
          plan,
          seen
        );
      }

      const result = await fetchPricesUsd(plan);

      await this.deps.commodityRepo.insert(
        result.quotes.map((q) => ({
          symbol: q.symbol,
          quote: q.quote,
          price: q.price,
          fetchedAt: q.fetchedAt,
          fetchedDate: utcDate(q.fetchedAt),
        }))
      );
```

The `result.failed.map((p) => p.symbol)` line (188) still works — `failed` is `{ symbol }[]`. No further change to the run-status logic.

- [ ] **Step 6: Update the service test**

In `lib/prices/service.test.ts`, the existing tests mock the provider and assert the union of pairs. Update them: mock `fetchPricesUsd` (not `fetchPrices`), seed `commodity_mapping` rows (or let `ensureMappings` classify via a mocked `getCoinSymbolMap`), and assert the built `FetchPlan` has the expected `crypto`/`fiat` targets and that `manual`-kind symbols are excluded. Mirror the existing mocking style in that file (it already stubs deps).

Add one new test:

```typescript
it('excludes manual-kind symbols from the fetch plan', async () => {
  // Arrange: user holds BTC (crypto) and KIRT (manual mapping).
  // Mock getCoinSymbolMap → { BTC: 'bitcoin' }; seed mapping KIRT→manual.
  // Act: runOnce.
  // Assert: fetchPricesUsd called with crypto:[{symbol:'BTC',id:'bitcoin'}], fiat:[]
  //         and KIRT never appears in the plan or failed list.
});
```

- [ ] **Step 7: Run the service + provider suites**

Run: `pnpm exec vitest run lib/prices`
Expected: PASS. Fix any remaining `fetchPrices`/`QuotePair` references the compiler flags.

- [ ] **Step 8: Commit**

```bash
git add lib/prices/service.ts lib/prices/index.ts lib/prices/service.test.ts
git commit -m "feat(prices): drive fetch from per-user commodity mappings, base USD"
```

---

## Task 7: Migrate existing base currency USDT → USD

**Files:**
- Create: `db/migrations/NNNN_base_currency_usd.sql` (hand-written data migration; drizzle-kit generates schema DDL only)

**Interfaces:**
- Consumes: nothing. Produces: existing `userSetting.baseCurrency = 'USDT'` rows become `'USD'`.

- [ ] **Step 1: Write the data migration**

Create a new numbered SQL file after the Task 4 migration:

```sql
-- Pricing base is now USD (CoinGecko cannot quote USDT). Repoint existing
-- users off USDT so `-X USD` valuation finds the regenerated price rows.
UPDATE "userSetting" SET "baseCurrency" = 'USD' WHERE "baseCurrency" = 'USDT';
```

> Confirm the exact drizzle journal format: look at an existing file in `db/migrations/` and match its header/meta convention so `drizzle-kit migrate` records it. If drizzle-kit refuses hand-authored files, instead add this UPDATE to the app's startup/one-shot path or run it via `psql` during deploy and document it in the PR. Verify against `db/migrations/meta/_journal.json`.

- [ ] **Step 2: Apply and verify**

Run: `pnpm db:migrate`
Then verify no USDT bases remain (dev DB):
Run: `pnpm exec drizzle-kit ...` — or query directly. Expected: `SELECT count(*) FROM "userSetting" WHERE "baseCurrency"='USDT'` returns 0.

- [ ] **Step 3: Commit**

```bash
git add db/migrations
git commit -m "chore(prices): migrate base currency from USDT to USD"
```

---

## Task 8: Server actions — search, list, upsert mapping

**Files:**
- Create: `features/currencies/actions/types.ts`, `searchCommodities.ts`, `listMappings.ts`, `upsertMapping.ts`, `index.ts`

**Interfaces:**
- Consumes: `requireUser`, `rateLimit`, `searchCoins`/`CoinSearchHit` (Task 2), `SUPPORTED_FIAT` (Task 1), `commodityMappingRepository` + `priceService` (Task 6), `normalizeCommoditySymbol`.
- Produces:
  - `type CommoditySuggestion = { symbol: string; kind: 'crypto' | 'fiat' | 'manual'; providerId: string | null; label: string; detail: string | null }`
  - `searchCommoditiesAction(query: string): Promise<CommoditySuggestion[]>`
  - `type MappingRow = { symbol: string; kind: string; providerId: string | null; source: string; inUse: boolean }`
  - `listMappingsAction(): Promise<MappingRow[]>`
  - `upsertMappingAction(input: { symbol: string; kind: 'crypto' | 'fiat' | 'manual'; providerId: string | null }): Promise<{ ok: true } | { ok: false; message: string }>`

- [ ] **Step 1: Types**

```typescript
// features/currencies/actions/types.ts
export type CommodityKind = 'crypto' | 'fiat' | 'manual';

export type CommoditySuggestion = {
  symbol: string;
  kind: CommodityKind;
  providerId: string | null;
  label: string;       // e.g. "Cardano"
  detail: string | null; // e.g. "ADA · rank 16"
};

export type MappingRow = {
  symbol: string;
  kind: string;
  providerId: string | null;
  source: string;
  inUse: boolean;
};

export type UpsertMappingResult = { ok: true } | { ok: false; message: string };
```

- [ ] **Step 2: Search action**

```typescript
// features/currencies/actions/searchCommodities.ts
'use server';

import type { CommoditySuggestion } from './types';
import { requireUser } from '@/lib/auth/require-user';
import { SUPPORTED_FIAT } from '@/lib/prices/fiat';
import { searchCoins } from '@/lib/prices/coingecko/coinCache';
import { rateLimit, READ, RATE_LIMIT_MESSAGE } from '@/lib/rate-limit';

export async function searchCommoditiesAction(
  query: string
): Promise<CommoditySuggestion[]> {
  const user = await requireUser();
  if (!rateLimit(READ, user.id).allowed) return [];

  const q = query.trim();
  if (!q) return [];
  const upper = q.toUpperCase();

  const suggestions: CommoditySuggestion[] = [];

  // Fiat matches first (short, exact-ish).
  for (const code of SUPPORTED_FIAT) {
    if (code.startsWith(upper)) {
      suggestions.push({
        symbol: code, kind: 'fiat', providerId: code,
        label: `${code} (fiat)`, detail: null,
      });
    }
  }

  // Crypto from CoinGecko, ranked.
  try {
    const hits = await searchCoins(q);
    for (const h of hits.slice(0, 15)) {
      suggestions.push({
        symbol: h.symbol.toUpperCase(),
        kind: 'crypto',
        providerId: h.id,
        label: h.name,
        detail: `${h.symbol.toUpperCase()}${h.marketCapRank ? ` · rank ${h.marketCapRank}` : ''}`,
      });
    }
  } catch {
    // CoinGecko unreachable → still offer fiat + manual below.
  }

  // Always offer an explicit manual mapping for the typed symbol.
  suggestions.push({
    symbol: upper, kind: 'manual', providerId: null,
    label: `Use "${upper}" as a manual commodity`, detail: 'price entered by hand',
  });

  return suggestions;
}
```

> Confirm `READ` exists in `@/lib/rate-limit` (alongside `WRITE`). If only `WRITE` exists, reuse `WRITE` or add a `READ` bucket following the existing pattern in that file.

- [ ] **Step 3: List + upsert actions**

```typescript
// features/currencies/actions/listMappings.ts
'use server';

import type { MappingRow } from './types';
import { requireUser } from '@/lib/auth/require-user';
import { commodityMappingRepository, priceService } from '@/lib/prices';

export async function listMappingsAction(): Promise<MappingRow[]> {
  const user = await requireUser();
  const [mappings, symbols] = await Promise.all([
    commodityMappingRepository.listForUser(user.id),
    priceService.listNormalizedSymbolsForUser(user.id),
  ]);
  const inUse = new Set(symbols);
  const bySymbol = new Map(mappings.map((m) => [m.symbol, m]));
  // Union of mapped symbols and in-use symbols so unmapped-in-use rows surface.
  const allSymbols = new Set<string>([...bySymbol.keys(), ...inUse]);
  return [...allSymbols]
    .filter((s) => s !== 'USD')
    .sort()
    .map((symbol) => {
      const m = bySymbol.get(symbol);
      return {
        symbol,
        kind: m?.kind ?? 'unmapped',
        providerId: m?.providerId ?? null,
        source: m?.source ?? 'none',
        inUse: inUse.has(symbol),
      };
    });
}
```

```typescript
// features/currencies/actions/upsertMapping.ts
'use server';

import type { UpsertMappingResult } from './types';
import { auditService, auditRequestMeta } from '@/lib/audit';
import { requireUser } from '@/lib/auth/require-user';
import { commodityMappingRepository, priceService } from '@/lib/prices';
import { normalizeCommoditySymbol } from '@/lib/prices/symbols';
import { rateLimit, WRITE, RATE_LIMIT_MESSAGE } from '@/lib/rate-limit';
import { revalidatePath } from 'next/cache';

export async function upsertMappingAction(input: {
  symbol: string;
  kind: 'crypto' | 'fiat' | 'manual';
  providerId: string | null;
}): Promise<UpsertMappingResult> {
  const user = await requireUser();
  if (!rateLimit(WRITE, user.id).allowed) {
    return { ok: false, message: RATE_LIMIT_MESSAGE };
  }
  const symbol = normalizeCommoditySymbol(input.symbol);
  if (!symbol) return { ok: false, message: 'Invalid commodity symbol' };
  if ((input.kind === 'crypto' || input.kind === 'fiat') && !input.providerId) {
    return { ok: false, message: 'A crypto or fiat mapping needs a provider id' };
  }

  await commodityMappingRepository.upsert({
    userId: user.id,
    symbol,
    kind: input.kind,
    providerId: input.kind === 'manual' ? null : input.providerId,
    source: 'user',
  });
  await auditService.record(user.id, {
    action: 'price.map',
    result: 'success',
    detail: { symbol, kind: input.kind },
    ...(await auditRequestMeta()),
  });
  revalidatePath('/currencies');
  return { ok: true };
}
```

```typescript
// features/currencies/actions/index.ts
export { searchCommoditiesAction } from './searchCommodities';
export { listMappingsAction } from './listMappings';
export { upsertMappingAction } from './upsertMapping';
export type * from './types';
```

- [ ] **Step 4: Verify compile + typecheck**

Run: `pnpm lint && pnpm exec tsc --noEmit`
Expected: no errors. Confirm `auditService` accepts the `'price.map'` action string — if the action union is a closed type, add `'price.map'` to it following the existing `'price.add'` definition.

- [ ] **Step 5: Commit**

```bash
git add features/currencies/actions
git commit -m "feat(currencies): add search, list, and upsert mapping server actions"
```

---

## Task 9: CommodityCombobox component

**Files:**
- Create: `components/CommodityCombobox/CommodityCombobox.tsx`

**Interfaces:**
- Consumes: `searchCommoditiesAction` + `CommoditySuggestion` (Task 8), existing `cmdk` primitives used by `components/Combobox/Combobox.tsx` (mirror its Popover/CommandDialog structure).
- Produces:
  - `type Props = { value: string; onSelect: (s: CommoditySuggestion) => void; onFreeText?: (raw: string) => void; placeholder?: string; triggerClassName?: string }`
  - Default export `CommodityCombobox`.

Behavior: debounced (250ms) call to `searchCommoditiesAction` as the user types; render suggestions grouped (fiat, crypto, manual) showing `label` + `detail`; on pick call `onSelect(suggestion)`; Enter on raw text with no pick calls `onFreeText?.(raw)`.

- [ ] **Step 1: Build the component**

Copy the structure of `components/Combobox/Combobox.tsx` (Popover on desktop, `CommandDialog` on mobile, `cmdk` `CommandPrimitive`), but replace the static client-side filtered `options: string[]` with an async, debounced `searchCommoditiesAction(query)` result list. Render each item with primary `label` and muted `detail`. Key each item by `${kind}:${symbol}:${providerId ?? ''}` (a symbol can appear as both crypto and manual). Show a "Searching…" state while the transition is pending (`useTransition`).

```typescript
// components/CommodityCombobox/CommodityCombobox.tsx
'use client';

import { useEffect, useState, useTransition } from 'react';
import { searchCommoditiesAction } from '@/features/currencies/actions';
import type { CommoditySuggestion } from '@/features/currencies/actions';
// ...import the same cmdk / Popover primitives Combobox.tsx uses

type Props = {
  value: string;
  onSelect: (suggestion: CommoditySuggestion) => void;
  onFreeText?: (raw: string) => void;
  placeholder?: string;
  triggerClassName?: string;
};

export default function CommodityCombobox({ value, onSelect, onFreeText, placeholder, triggerClassName }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CommoditySuggestion[]>([]);
  const [isPending, startSearch] = useTransition();

  useEffect(() => {
    const q = query.trim();
    if (!q) { setResults([]); return; }
    const handle = setTimeout(() => {
      startSearch(async () => setResults(await searchCommoditiesAction(q)));
    }, 250);
    return () => clearTimeout(handle);
  }, [query]);

  // Render: trigger button showing `value || placeholder`; on open, a command
  // input bound to `query`; list of `results` keyed by kind:symbol:providerId,
  // each row = <div>{label}</div><span class="muted">{detail}</span>; onSelect
  // fires props.onSelect and closes; a footer "Use \"{query}\"" item calls
  // props.onFreeText when present. Mirror Combobox.tsx's open/close + mobile
  // dialog handling exactly.
  return null; // replace with the JSX described above
}
```

> This is the one component with real UI surface. Follow `components/Combobox/Combobox.tsx` line-for-line for the Popover/dialog/keyboard behavior; only the data source (async search vs static filter) and the row rendering (label+detail vs plain string) differ. Do not invent new primitives.

- [ ] **Step 2: Typecheck + lint**

Run: `pnpm lint && pnpm exec tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add components/CommodityCombobox
git commit -m "feat(currencies): add CommodityCombobox backed by server search"
```

---

## Task 10: Currencies management / reconcile screen

**Files:**
- Create: `app/currencies/page.tsx`, `features/currencies/CurrenciesView.tsx`

**Interfaces:**
- Consumes: `listMappingsAction`/`MappingRow` + `upsertMappingAction` (Task 8), `CommodityCombobox` (Task 9), `requireUser`.
- Produces: a page at `/currencies` listing every in-use + mapped symbol, its resolved kind/target, an "unmapped/auto" badge, and an inline `CommodityCombobox` to set/override each mapping.

- [ ] **Step 1: Route shell**

```typescript
// app/currencies/page.tsx
import CurrenciesView from '@/features/currencies/CurrenciesView';
import { requireUser } from '@/lib/auth/require-user';
import { listMappingsAction } from '@/features/currencies/actions';

export default async function CurrenciesPage() {
  await requireUser();
  const rows = await listMappingsAction();
  return <CurrenciesView rows={rows} />;
}
```

- [ ] **Step 2: Client view**

Follow `features/prices/PricesView.tsx` structure (`'use client'`, `useTransition`, per-row action, result handling). Render a table: `Symbol | In use | Mapped to | Source | Action`. For each row, a `CommodityCombobox` whose `onSelect` calls `upsertMappingAction({ symbol: row.symbol, kind: s.kind, providerId: s.providerId })` inside a transition, then updates local row state on `ok`. Highlight rows where `kind === 'unmapped'` or `source === 'auto'` (these are the ones needing user confirmation — the reconcile list). Show a small legend explaining crypto/fiat/manual.

```typescript
// features/currencies/CurrenciesView.tsx
'use client';

import { useState, useTransition } from 'react';
import CommodityCombobox from '@/components/CommodityCombobox/CommodityCombobox';
import { upsertMappingAction, type MappingRow } from '@/features/currencies/actions';

export default function CurrenciesView({ rows: initial }: { rows: MappingRow[] }) {
  const [rows, setRows] = useState(initial);
  const [isSaving, startSave] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const setMapping = (symbol: string, kind: MappingRow['kind'], providerId: string | null) => {
    startSave(async () => {
      const result = await upsertMappingAction({ symbol, kind: kind as 'crypto' | 'fiat' | 'manual', providerId });
      if (!result.ok) { setError(result.message); return; }
      setError(null);
      setRows((prev) => prev.map((r) => (r.symbol === symbol ? { ...r, kind, providerId, source: 'user' } : r)));
    });
  };

  // Render the table described above; wire each row's CommodityCombobox.onSelect
  // to setMapping(row.symbol, s.kind, s.providerId). Reconcile-first ordering:
  // unmapped/auto rows on top.
  return null; // replace with the table JSX
}
```

- [ ] **Step 3: Add a nav entry**

Add a `/currencies` link wherever `/prices` is linked in the app's navigation (grep for `href="/prices"` and mirror it).

- [ ] **Step 4: Manual verification**

Run: `pnpm dev`, sign in, open `/currencies`. Expected: your 22 symbols listed; KIRT/SEKKE show `manual`, crypto show `crypto` with a CoinGecko id, NIM shows `crypto`→nimiq (auto) which you can override to `manual` via the combobox. Confirm the override persists on reload.

- [ ] **Step 5: Commit**

```bash
git add app/currencies features/currencies/CurrenciesView.tsx
git commit -m "feat(currencies): add mapping management and reconcile screen"
```

---

## Task 11: Wire point-of-use pickers to persist mappings

**Files:**
- Modify: `features/prices/PricesView.tsx:122-125` (symbol row input)
- Modify: `features/transactions/entry/typeForms/fields.tsx:99-117` (`CurrencyCombobox`)

**Interfaces:**
- Consumes: `CommodityCombobox` (Task 9), `upsertMappingAction` (Task 8).
- Produces: on picking a suggestion in either place, the chosen mapping persists (fire-and-forget within a transition) so a symbol is mapped the first time it is used — the "never happens again" guarantee.

- [ ] **Step 1: Prices view symbol input**

Replace the row-level `Combobox` (PricesView.tsx:122-125) with `CommodityCombobox`:

```typescript
<CommodityCombobox
  value={row.symbol}
  placeholder="KIRT"
  onSelect={(s) => {
    updateRow(i, { symbol: s.symbol });
    startPersist(() => upsertMappingAction({ symbol: s.symbol, kind: s.kind, providerId: s.providerId }));
  }}
  onFreeText={(raw) => updateRow(i, { symbol: raw.toUpperCase() })}
/>
```

Add a `const [, startPersist] = useTransition();` near the top. Free-text keeps working (no mapping persisted until a real pick — the classifier still covers it at fetch time).

- [ ] **Step 2: Entry-form currency picker (optional-but-recommended)**

`CurrencyCombobox` in `fields.tsx` currently wraps the static `Combobox` with `options`. Keep the static fast path for the common base currencies, but when the user types a symbol not in `options`, offer the `CommodityCombobox` search + persist on pick. Minimal version: swap to `CommodityCombobox`, keep `onSelect` updating `fields.currency` and persisting the mapping. Preserve the existing `defaultCurrency` behavior.

> If wiring into the entry draft lifecycle proves invasive (the entry form is a live draft, not a commit), it is acceptable to persist the mapping on pick only (the combobox `onSelect`), independent of whether the transaction is saved. Mapping and transaction are decoupled — a mapping is safe to store the moment a symbol is chosen.

- [ ] **Step 3: Manual verification**

Run: `pnpm dev`. Add a manual price for a new symbol via `/prices`, pick a coin from the dropdown, then open `/currencies` and confirm the mapping was recorded as `source: 'user'`.

- [ ] **Step 4: Typecheck + commit**

Run: `pnpm lint && pnpm exec tsc --noEmit`

```bash
git add features/prices/PricesView.tsx features/transactions/entry/typeForms/fields.tsx
git commit -m "feat(currencies): persist commodity mapping at point of use"
```

---

## Task 12: Cleanup, docs, and end-to-end verification

**Files:**
- Modify: `lib/prices/symbols.ts:1-5` (doc comment), `lib/prices/scheduler.ts` (no code change; verify), `REVIEW.md` / `PLAN.md` if they reference the price fetcher.

- [ ] **Step 1: Drop stale CryptoCompare references**

Update the `normalizeCommoditySymbol` doc comment (symbols.ts:1-5) to say "provider-compatible symbol" rather than "cryptocompare-compatible". Grep the repo for `cryptocompare` / `pricemulti` / `min-api` and remove any lingering references in comments/docs.

Run: `grep -rin "cryptocompare\|pricemulti\|min-api" lib features app docs`
Expected after edits: no matches.

- [ ] **Step 2: Full suite + typecheck + lint**

Run: `pnpm exec vitest run && pnpm lint && pnpm exec tsc --noEmit`
Expected: all green.

- [ ] **Step 3: End-to-end fetch against the real API (staging/dev)**

Trigger one refresh (e.g. a dev-only route or a script that calls `priceService.refreshAll()`), then inspect: `price_fetch_run` latest row is `success` or `partial` with `symbols_fetched > 0`, and `commodity_price` has USD-quoted rows for the crypto + fiat symbols. Manual/local symbols (KIRT/SEKKE) must NOT appear in `failed`.

- [ ] **Step 4: Commit**

```bash
git add lib/prices/symbols.ts docs
git commit -m "chore(prices): drop CryptoCompare references and finalize docs"
```

---

## Self-Review

**Spec coverage:**
- CoinGecko one-request batch → Task 5 (`fetchPricesUsd`, one `/simple/price` per chunk). ✓
- USD base + fiat tether pivot → Task 5 (pivot math) + Task 6 (`resolveBaseCurrency`→USD) + Task 7 (data migration). ✓
- Symbol→id ambiguity (ADA=3) → Task 2 (market-cap winner). ✓
- NIM collision override → Task 4 (per-user table) + Task 8/10 (user upsert overrides auto). ✓
- KIRT/SEKKE/NIM as manual, no false failures → Task 3 (manual fallback) + Task 6 (manual excluded from plan). ✓
- Autocomplete at point of use → Task 8 (search action) + Task 9 (CommodityCombobox) + Task 11 (persist on pick). ✓
- Reconcile existing symbols → Task 10 (Currencies screen). ✓
- External/raw journal edits still safe → Task 6 (`ensureMappings` auto-classifies any unmapped in-use symbol at fetch time). ✓

**Open items the implementer must confirm against the codebase (flagged inline, not placeholders):**
- DB test harness for repository tests (Task 4) — reuse whatever `lib/prices/repository.test.ts` uses.
- `READ` rate-limit bucket existence (Task 8) — reuse `WRITE` if absent.
- `auditService` action union accepting `'price.map'` (Task 8).
- drizzle-kit hand-authored data-migration acceptance (Task 7) — fallback documented.
- Exact `cmdk`/Popover primitives (Task 9) — copy from `components/Combobox/Combobox.tsx`.

**Type consistency:** `CommodityKind` = `'crypto'|'fiat'|'manual'` used identically across Tasks 3, 8, 9. `FetchPlan`/`PriceQuote` from Task 5 consumed unchanged in Task 6. `CommoditySuggestion` from Task 8 consumed in Tasks 9/11. `MappingRow` from Task 8 consumed in Task 10.
