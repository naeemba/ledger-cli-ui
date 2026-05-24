# Base Currency Selector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single `DEFAULT_CURRENCY` env var with a per-user, per-session base currency: each user picks a saved default through a new `/settings` page and can override it for the current browser via a header combobox. Commodities come from the user's own journal.

**Architecture:** A new `lib/settings/` module (Repository + Service + Zod schema) backs a `userSetting` table. A request-scoped `getBaseCurrency()` resolves in priority order `cookie > saved row > env`. Two new pure helpers parse `ledger commodities` and `ledger balance -X` outputs for the picker list and the missing-rate banner respectively. The 14 existing `getDefaultCurrency()` consumers move to `await getBaseCurrency()`. A new `/settings` page + a header combobox + a banner above the page body land the UI.

**Tech Stack:** TypeScript · Next.js 16 App Router · React Server Components · React.cache · Drizzle ORM + better-sqlite3 · Zod · shadcn/ui (Combobox, Card, Alert, DropdownMenu) · vitest · sonner.

**Reference spec:** `docs/superpowers/specs/2026-05-24-base-currency-selector-design.md`.

---

## File Structure

**Created:**

- `db/schema/userSetting.ts` — Drizzle table definition + inferred type.
- `lib/settings/schema.ts` — `baseCurrencySchema` Zod schema.
- `lib/settings/repository.ts` — `UserSettingRepository` (CRUD, no business logic).
- `lib/settings/service.ts` — `UserSettingService` (passthrough today, room for normalization).
- `lib/settings/index.ts` — module exports + singletons (`userSettingRepository`, `userSettingService`).
- `lib/settings/getBaseCurrency.ts` — `React.cache`-wrapped resolver (cookie > row > env).
- `lib/settings/parseCommodityList.ts` — pure parser of `ledger commodities` stdout.
- `lib/settings/getAvailableCurrencies.ts` — composes `runLedger(['commodities'])` + parser + base pin.
- `lib/settings/parseUnconverted.ts` — pure parser pulling commodity codes out of `ledger balance -X` stdout.
- `lib/settings/getMissingRateCommodities.ts` — composes `runLedger(['balance', ...])` + parser.
- `lib/settings/repository.test.ts`, `lib/settings/service.test.ts`, `lib/settings/schema.test.ts`, `lib/settings/getBaseCurrency.test.ts`, `lib/settings/parseCommodityList.test.ts`, `lib/settings/parseUnconverted.test.ts`.
- `features/settings/actions/setSavedBaseCurrency.ts`
- `features/settings/actions/setSessionBaseCurrency.ts`
- `features/settings/actions/clearSessionBaseCurrency.ts`
- `features/settings/actions/index.ts`
- `features/settings/actions/setSavedBaseCurrency.test.ts`, `features/settings/actions/setSessionBaseCurrency.test.ts`, `features/settings/actions/clearSessionBaseCurrency.test.ts`.
- `features/settings/Settings.tsx`, `features/settings/BaseCurrencyForm.tsx`, `features/settings/index.ts`.
- `app/settings/page.tsx`, `app/settings/loading.tsx`.
- `components/BaseCurrencyPicker/BaseCurrencyPicker.tsx`, `components/BaseCurrencyPicker/index.ts`.
- `components/BaseCurrencyBanner/BaseCurrencyBanner.tsx`, `components/BaseCurrencyBanner/index.ts`.

**Modified:**

- `db/schema/index.ts` — export `userSetting`.
- `db/migrations/` — new Drizzle-generated migration creating the `userSetting` table.
- `lib/test-utils/db.ts` — extend `setupTestDb` to also create the `userSetting` table (so all suites share schema). Already does this for `user`; we follow the same shape used in `lib/templates/repository.test.ts` (table created in the suite's `beforeEach`).
- `app/balance/page.tsx`, `app/balance/[from]/[to]/page.tsx`, `app/debts/page.tsx`, `app/accounts/[account]/page.tsx`, `app/registers/monthly/[account]/page.tsx`, `features/payees/Payees.tsx`, `features/transactions/EditTransaction.tsx`, `features/transactions/NewTransaction.tsx`, `features/monthlyComparison/MonthlyComparison.tsx`, `features/monthlyComparison/MonthlyComparison.utils.ts`, `features/reconcile/Reconcile.tsx`, `features/netWorth/NetWorth.tsx`, `features/dashboard/Dashboard.tsx`, `features/portfolio/Portfolio.tsx` — swap `getDefaultCurrency()` → `await getBaseCurrency()`.
- `components/AppShell/AppShell.tsx` — mount `<BaseCurrencyBanner />` between `<AppHeader />` and the page slot.
- `components/Header/AppHeader.tsx` — mount `<BaseCurrencyPicker />` and add a `Settings` `DropdownMenuItem` above the existing `Sign out`.
- `components/nav/config.ts` — add an `account` section with a `Settings` entry.
- `.env.example` — update the `DEFAULT_CURRENCY` comment.

**Deleted:**

- `utils/getDefaultCurrency.ts`.

**Design deviation from spec (intentional):** The spec section 2 places `listCommodities` on `JournalRepository`. Existing `JournalRepository` methods are all filesystem CRUD; shell-outs happen via the `utils/runLedger.ts` wrapper. To avoid a circular import (`JournalRepository → runLedger → journalRepository`) and to keep the repo focused on its current responsibility, the shell-out + parsing live in `lib/settings/getAvailableCurrencies.ts` (composing `runLedger` and a pure parser). Functionally identical; the caching still flows through `runLedger`'s mtime-keyed wrapper.

---

## Task 1: `userSetting` schema + migration

**Files:**
- Create: `db/schema/userSetting.ts`
- Modify: `db/schema/index.ts`
- Create: `db/migrations/<generated>_*.sql` (via `pnpm db:generate`)

- [ ] **Step 1: Write the schema file**

Create `db/schema/userSetting.ts`:

```ts
import { sql } from 'drizzle-orm';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { user } from './user';

export const userSetting = sqliteTable('userSetting', {
  userId: text('userId')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  baseCurrency: text('baseCurrency').notNull(),
  updatedAt: integer('updatedAt', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
});

export type UserSetting = typeof userSetting.$inferSelect;
```

- [ ] **Step 2: Re-export from the schema barrel**

Edit `db/schema/index.ts` — add the export alphabetically next to `template`:

```ts
export { template } from './template';
export { user } from './user';
export { userSetting } from './userSetting';
export { verification } from './verification';
```

- [ ] **Step 3: Generate the migration**

Run: `pnpm db:generate`
Expected: a new file appears under `db/migrations/` (e.g. `0007_<name>.sql`) containing a `CREATE TABLE "userSetting"` statement that matches the schema above. Inspect it once.

- [ ] **Step 4: Apply the migration locally**

Run: `pnpm db:migrate`
Expected: completes without error.

- [ ] **Step 5: Type-check**

Run: `pnpm type-check`
Expected: passes.

- [ ] **Step 6: Commit**

```bash
git add db/schema/userSetting.ts db/schema/index.ts db/migrations/
git commit -m "feat(settings): userSetting table for per-user preferences"
```

---

## Task 2: `baseCurrencySchema` (Zod) + tests

**Files:**
- Create: `lib/settings/schema.ts`
- Create: `lib/settings/schema.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/settings/schema.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { baseCurrencySchema } from './schema';

describe('baseCurrencySchema', () => {
  it.each([
    ['USD'],
    ['EUR'],
    ['Kirt'],
    ['My Coin'],
    ['  USD  '], // trims
  ])('accepts %s', (input) => {
    const parsed = baseCurrencySchema.parse(input);
    expect(parsed.length).toBeGreaterThan(0);
  });

  it.each([
    [''],
    ['   '],
    ['x'.repeat(33)],
    ['bad\x00ccy'],
    ['bad\nccy'],
  ])('rejects %s', (input) => {
    expect(() => baseCurrencySchema.parse(input)).toThrow();
  });

  it('trims surrounding whitespace', () => {
    expect(baseCurrencySchema.parse('  USD  ')).toBe('USD');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test lib/settings/schema.test.ts`
Expected: FAIL — `schema.ts` does not exist yet.

- [ ] **Step 3: Write the schema**

Create `lib/settings/schema.ts`:

```ts
import { z } from 'zod';

export const baseCurrencySchema = z
  .string()
  .trim()
  .min(1, 'Currency is required')
  .max(32, 'Currency code is too long')
  .regex(
    /^[^\x00-\x1f]+$/,
    'Currency code may not contain control characters'
  );

export type BaseCurrency = z.infer<typeof baseCurrencySchema>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test lib/settings/schema.test.ts`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/settings/schema.ts lib/settings/schema.test.ts
git commit -m "feat(settings): baseCurrency zod schema"
```

---

## Task 3: `UserSettingRepository` + tests

**Files:**
- Create: `lib/settings/repository.ts`
- Create: `lib/settings/repository.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/settings/repository.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { UserSettingRepository } from './repository';
import * as schema from '@/db/schema';
import {
  setupTestDb,
  teardownTestDb,
  type TestDbContext,
} from '@/lib/test-utils/db';

const USER_SETTING_TABLE = `
  CREATE TABLE IF NOT EXISTS "userSetting" (
    "userId" text PRIMARY KEY NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
    "baseCurrency" text NOT NULL,
    "updatedAt" integer NOT NULL DEFAULT (unixepoch())
  );
`;

describe('UserSettingRepository', () => {
  let ctx: TestDbContext;
  let repo: UserSettingRepository;

  beforeEach(async () => {
    ctx = await setupTestDb('settings-');
    ctx.sqlite.exec(USER_SETTING_TABLE);
    ctx.sqlite
      .prepare(`INSERT INTO "user" ("id","name","email") VALUES (?,?,?)`)
      .run('alice', 'Alice', 'alice@example.com');
    repo = new UserSettingRepository(drizzle(ctx.sqlite, { schema }));
  });

  afterEach(async () => {
    await teardownTestDb(ctx);
  });

  it('get returns null when no row', async () => {
    expect(await repo.get('alice')).toBeNull();
  });

  it('upsert creates a row on first call', async () => {
    await repo.upsertBaseCurrency('alice', 'EUR');
    const row = await repo.get('alice');
    expect(row?.baseCurrency).toBe('EUR');
    expect(row?.userId).toBe('alice');
  });

  it('upsert updates an existing row in place', async () => {
    await repo.upsertBaseCurrency('alice', 'EUR');
    await repo.upsertBaseCurrency('alice', 'JPY');
    const row = await repo.get('alice');
    expect(row?.baseCurrency).toBe('JPY');
  });

  it('cascade-deletes when the user row is deleted', async () => {
    await repo.upsertBaseCurrency('alice', 'EUR');
    ctx.sqlite.prepare(`DELETE FROM "user" WHERE id = ?`).run('alice');
    expect(await repo.get('alice')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test lib/settings/repository.test.ts`
Expected: FAIL — `repository.ts` does not exist.

- [ ] **Step 3: Write the repository**

Create `lib/settings/repository.ts`:

```ts
import { eq } from 'drizzle-orm';
import { userSetting, type UserSetting } from '@/db/schema/userSetting';
import type { DbInstance } from '@/lib/db/connection';

export class UserSettingRepository {
  constructor(private readonly db: DbInstance) {}

  async get(userId: string): Promise<UserSetting | null> {
    const row = this.db
      .select()
      .from(userSetting)
      .where(eq(userSetting.userId, userId))
      .get();
    return row ?? null;
  }

  async upsertBaseCurrency(userId: string, value: string): Promise<void> {
    this.db
      .insert(userSetting)
      .values({ userId, baseCurrency: value })
      .onConflictDoUpdate({
        target: userSetting.userId,
        set: { baseCurrency: value, updatedAt: new Date() },
      })
      .run();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test lib/settings/repository.test.ts`
Expected: all 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/settings/repository.ts lib/settings/repository.test.ts
git commit -m "feat(settings): UserSettingRepository with upsert + cascade"
```

---

## Task 4: `UserSettingService` + `lib/settings/index.ts` + service test

**Files:**
- Create: `lib/settings/service.ts`
- Create: `lib/settings/service.test.ts`
- Create: `lib/settings/index.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/settings/service.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { UserSettingRepository } from './repository';
import { UserSettingService } from './service';
import * as schema from '@/db/schema';
import {
  setupTestDb,
  teardownTestDb,
  type TestDbContext,
} from '@/lib/test-utils/db';

const USER_SETTING_TABLE = `
  CREATE TABLE IF NOT EXISTS "userSetting" (
    "userId" text PRIMARY KEY NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
    "baseCurrency" text NOT NULL,
    "updatedAt" integer NOT NULL DEFAULT (unixepoch())
  );
`;

describe('UserSettingService', () => {
  let ctx: TestDbContext;
  let service: UserSettingService;

  beforeEach(async () => {
    ctx = await setupTestDb('settings-svc-');
    ctx.sqlite.exec(USER_SETTING_TABLE);
    ctx.sqlite
      .prepare(`INSERT INTO "user" ("id","name","email") VALUES (?,?,?)`)
      .run('alice', 'Alice', 'alice@example.com');
    const repo = new UserSettingRepository(drizzle(ctx.sqlite, { schema }));
    service = new UserSettingService(repo);
  });

  afterEach(async () => {
    await teardownTestDb(ctx);
  });

  it('saveBaseCurrency round-trips through get', async () => {
    await service.saveBaseCurrency('alice', 'EUR');
    const row = await service.get('alice');
    expect(row?.baseCurrency).toBe('EUR');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test lib/settings/service.test.ts`
Expected: FAIL — `service.ts` does not exist.

- [ ] **Step 3: Write the service**

Create `lib/settings/service.ts`:

```ts
import type { UserSettingRepository } from './repository';
import type { UserSetting } from '@/db/schema/userSetting';

export class UserSettingService {
  constructor(private readonly repo: UserSettingRepository) {}

  async get(userId: string): Promise<UserSetting | null> {
    return this.repo.get(userId);
  }

  async saveBaseCurrency(userId: string, value: string): Promise<void> {
    await this.repo.upsertBaseCurrency(userId, value);
  }
}
```

- [ ] **Step 4: Write the module barrel**

Create `lib/settings/index.ts`:

```ts
import { UserSettingRepository } from './repository';
import { UserSettingService } from './service';
import { db } from '@/lib/db';

export const userSettingRepository = new UserSettingRepository(db);
export const userSettingService = new UserSettingService(userSettingRepository);

export { UserSettingRepository } from './repository';
export { UserSettingService } from './service';
export { baseCurrencySchema, type BaseCurrency } from './schema';
export { getBaseCurrency } from './getBaseCurrency';
export { getAvailableCurrencies } from './getAvailableCurrencies';
export { getMissingRateCommodities } from './getMissingRateCommodities';
```

> The three `get*` exports reference files that don't exist yet — that's fine because nothing imports `@/lib/settings` yet. The barrel will resolve once Tasks 5–8 land. We add the imports now so we don't have to revisit this file later.

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test lib/settings/service.test.ts`
Expected: PASS.

- [ ] **Step 6: Type-check (expect failure on the dangling barrel imports)**

Run: `pnpm type-check`
Expected: FAIL — three "cannot find module" errors for the not-yet-created `getBaseCurrency`, `getAvailableCurrencies`, `getMissingRateCommodities`. This is the only intentionally-broken state in the plan; resolved by Tasks 5–7. **Do not commit yet — combine this commit with Task 5 to keep main green.**

- [ ] **Step 7: Stage but don't commit**

```bash
git add lib/settings/service.ts lib/settings/service.test.ts lib/settings/index.ts
# Do not commit — Task 5 will land before any commit.
```

---

## Task 5: `getBaseCurrency` resolver + tests

**Files:**
- Create: `lib/settings/getBaseCurrency.ts`
- Create: `lib/settings/getBaseCurrency.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/settings/getBaseCurrency.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const cookieGet = vi.fn();
const getOptionalUser = vi.fn();
const repoGet = vi.fn();

vi.mock('next/headers', () => ({
  cookies: async () => ({ get: cookieGet }),
}));

vi.mock('@/lib/auth/require-user', () => ({
  getOptionalUser: () => getOptionalUser(),
}));

vi.mock('./index', () => ({
  userSettingRepository: { get: (id: string) => repoGet(id) },
}));

vi.mock('@/lib/env', () => ({
  env: { DEFAULT_CURRENCY: 'USD' },
}));

beforeEach(() => {
  cookieGet.mockReset();
  getOptionalUser.mockReset();
  repoGet.mockReset();
});

describe('getBaseCurrency', () => {
  it('returns the cookie value when present and valid', async () => {
    cookieGet.mockReturnValue({ value: 'EUR' });
    const { getBaseCurrency } = await import('./getBaseCurrency');
    expect(await getBaseCurrency()).toBe('EUR');
    expect(repoGet).not.toHaveBeenCalled();
    expect(getOptionalUser).not.toHaveBeenCalled();
  });

  it('falls through a malformed cookie to the saved row', async () => {
    cookieGet.mockReturnValue({ value: 'bad\x00ccy' });
    getOptionalUser.mockResolvedValue({ id: 'alice' });
    repoGet.mockResolvedValue({ baseCurrency: 'JPY' });
    vi.resetModules();
    const { getBaseCurrency } = await import('./getBaseCurrency');
    expect(await getBaseCurrency()).toBe('JPY');
  });

  it('returns the saved row when no cookie is set', async () => {
    cookieGet.mockReturnValue(undefined);
    getOptionalUser.mockResolvedValue({ id: 'alice' });
    repoGet.mockResolvedValue({ baseCurrency: 'GBP' });
    vi.resetModules();
    const { getBaseCurrency } = await import('./getBaseCurrency');
    expect(await getBaseCurrency()).toBe('GBP');
  });

  it('falls back to env when no cookie and no saved row', async () => {
    cookieGet.mockReturnValue(undefined);
    getOptionalUser.mockResolvedValue({ id: 'alice' });
    repoGet.mockResolvedValue(null);
    vi.resetModules();
    const { getBaseCurrency } = await import('./getBaseCurrency');
    expect(await getBaseCurrency()).toBe('USD');
  });

  it('falls back to env for unauthenticated requests', async () => {
    cookieGet.mockReturnValue(undefined);
    getOptionalUser.mockResolvedValue(null);
    vi.resetModules();
    const { getBaseCurrency } = await import('./getBaseCurrency');
    expect(await getBaseCurrency()).toBe('USD');
    expect(repoGet).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test lib/settings/getBaseCurrency.test.ts`
Expected: FAIL — `getBaseCurrency.ts` does not exist.

- [ ] **Step 3: Write the resolver**

Create `lib/settings/getBaseCurrency.ts`:

```ts
import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { env } from '@/lib/env';
import { getOptionalUser } from '@/lib/auth/require-user';
import { userSettingRepository } from './index';
import { baseCurrencySchema } from './schema';

export const COOKIE_NAME = 'baseCurrency';

export const getBaseCurrency = cache(async (): Promise<string> => {
  const jar = await cookies();
  const cookieValue = jar.get(COOKIE_NAME)?.value;
  if (cookieValue) {
    const parsed = baseCurrencySchema.safeParse(cookieValue);
    if (parsed.success) return parsed.data;
  }

  const user = await getOptionalUser();
  if (user) {
    const row = await userSettingRepository.get(user.id);
    if (row) return row.baseCurrency;
  }

  return env.DEFAULT_CURRENCY;
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test lib/settings/getBaseCurrency.test.ts`
Expected: all 5 tests PASS.

- [ ] **Step 5: Type-check**

Run: `pnpm type-check`
Expected: PASS (the two remaining barrel exports — `getAvailableCurrencies`, `getMissingRateCommodities` — still point at missing files; remove their lines from `lib/settings/index.ts` temporarily, OR add the stub files below first).

Pragmatic choice: comment out the two `export { getAvailableCurrencies }` and `export { getMissingRateCommodities }` lines in `lib/settings/index.ts` now. Restore them in Tasks 6 and 7.

- [ ] **Step 6: Commit**

```bash
git add lib/settings/service.ts lib/settings/service.test.ts lib/settings/index.ts lib/settings/getBaseCurrency.ts lib/settings/getBaseCurrency.test.ts
git commit -m "feat(settings): service + request-scoped base currency resolver"
```

---

## Task 6: `parseCommodityList` + `getAvailableCurrencies`

**Files:**
- Create: `lib/settings/parseCommodityList.ts`
- Create: `lib/settings/parseCommodityList.test.ts`
- Create: `lib/settings/getAvailableCurrencies.ts`
- Modify: `lib/settings/index.ts` (uncomment the `getAvailableCurrencies` export)

- [ ] **Step 1: Write the failing test**

Create `lib/settings/parseCommodityList.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseCommodityList } from './parseCommodityList';

describe('parseCommodityList', () => {
  it('returns an empty array for empty input', () => {
    expect(parseCommodityList('', 'USD')).toEqual(['USD']);
  });

  it('parses one commodity per line', () => {
    expect(parseCommodityList('USD\nEUR\nJPY\n', 'USD')).toEqual([
      'USD',
      'EUR',
      'JPY',
    ]);
  });

  it('strips matched surrounding double quotes', () => {
    expect(parseCommodityList('USD\n"My Coin"\nEUR\n', 'USD')).toEqual([
      'USD',
      'EUR',
      'My Coin',
    ]);
  });

  it('skips blank lines and trims whitespace', () => {
    expect(parseCommodityList('  USD  \n\n  EUR\n', 'USD')).toEqual([
      'USD',
      'EUR',
    ]);
  });

  it('deduplicates case-sensitively', () => {
    expect(parseCommodityList('USD\nEUR\nUSD\n', 'USD')).toEqual([
      'USD',
      'EUR',
    ]);
  });

  it('sorts the rest case-insensitively with the base pinned first', () => {
    expect(parseCommodityList('jpy\nEUR\nAUD\n', 'USD')).toEqual([
      'USD',
      'AUD',
      'EUR',
      'jpy',
    ]);
  });

  it('appends the base even when absent from the input', () => {
    expect(parseCommodityList('EUR\n', 'USD')).toEqual(['USD', 'EUR']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test lib/settings/parseCommodityList.test.ts`
Expected: FAIL — file does not exist.

- [ ] **Step 3: Write the parser**

Create `lib/settings/parseCommodityList.ts`:

```ts
/**
 * Parses the stdout of `ledger commodities` into a deduplicated, sorted list
 * with `base` pinned to the front. Strips one optional pair of surrounding
 * double quotes (ledger emits "My Coin" for whitespace-containing names).
 */
export const parseCommodityList = (stdout: string, base: string): string[] => {
  const collator = new Intl.Collator(undefined, { sensitivity: 'base' });
  const seen = new Set<string>();
  const out: string[] = [];

  for (const raw of stdout.split('\n')) {
    let line = raw.trim();
    if (!line) continue;
    if (line.startsWith('"') && line.endsWith('"') && line.length >= 2) {
      line = line.slice(1, -1);
    }
    if (!line) continue;
    if (seen.has(line)) continue;
    seen.add(line);
    out.push(line);
  }

  const rest = out.filter((c) => c !== base).sort(collator.compare);
  return [base, ...rest];
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test lib/settings/parseCommodityList.test.ts`
Expected: all 7 tests PASS.

- [ ] **Step 5: Write the composing helper**

Create `lib/settings/getAvailableCurrencies.ts`:

```ts
import 'server-only';
import { cache } from 'react';
import runLedger from '@/utils/runLedger';
import { getBaseCurrency } from './getBaseCurrency';
import { parseCommodityList } from './parseCommodityList';

export const getAvailableCurrencies = cache(
  async (): Promise<{ currencies: string[]; base: string }> => {
    const [stdout, base] = await Promise.all([
      runLedger(['commodities']),
      getBaseCurrency(),
    ]);
    return { currencies: parseCommodityList(stdout, base), base };
  }
);
```

- [ ] **Step 6: Restore the export in the barrel**

Edit `lib/settings/index.ts` — uncomment / add:

```ts
export { getAvailableCurrencies } from './getAvailableCurrencies';
```

- [ ] **Step 7: Type-check**

Run: `pnpm type-check`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add lib/settings/parseCommodityList.ts lib/settings/parseCommodityList.test.ts lib/settings/getAvailableCurrencies.ts lib/settings/index.ts
git commit -m "feat(settings): list available currencies from ledger commodities"
```

---

## Task 7: `parseUnconverted` + `getMissingRateCommodities`

**Files:**
- Create: `lib/settings/parseUnconverted.ts`
- Create: `lib/settings/parseUnconverted.test.ts`
- Create: `lib/settings/getMissingRateCommodities.ts`
- Modify: `lib/settings/index.ts` (uncomment the `getMissingRateCommodities` export)

`ledger balance --flat --no-total -X <base>` emits one line per account, ending with `<account>` and beginning with the converted amount. Example output for a USD base:

```
            $1,234.50  Assets:Checking
              €100.00  Assets:Brokerage   ; un-convertible
```

When ledger cannot convert a posting it leaves the commodity in its native form. Multi-commodity rows can stack:

```
            $1,234.50
              €100.00  Assets:Brokerage
```

The parser must collect every commodity token that is NOT the base.

- [ ] **Step 1: Write the failing test**

Create `lib/settings/parseUnconverted.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseUnconverted } from './parseUnconverted';

describe('parseUnconverted', () => {
  it('returns empty when everything converted to base', () => {
    const stdout = `
            $1,234.50  Assets:Checking
            $-200.00  Liabilities:Card
    `;
    expect(parseUnconverted(stdout, 'USD')).toEqual([]);
  });

  it('collects a single un-convertible commodity', () => {
    const stdout = `
            $1,234.50  Assets:Checking
              €100.00  Assets:Brokerage
    `;
    expect(parseUnconverted(stdout, 'USD')).toEqual(['EUR']);
  });

  it('handles stacked multi-commodity rows', () => {
    const stdout = `
            $1,234.50
              €100.00
              ¥5,000   Assets:Mixed
    `;
    expect(parseUnconverted(stdout, 'USD')).toEqual(['EUR', 'JPY']);
  });

  it('handles ledger-style symbols and named commodities', () => {
    const stdout = `
            $50.00 Assets:Checking
            10 Kirt Assets:Local
            "My Coin" 5  Assets:Crypto
    `;
    expect(parseUnconverted(stdout, 'USD')).toEqual(['Kirt', 'My Coin']);
  });

  it('returns empty for empty stdout', () => {
    expect(parseUnconverted('', 'USD')).toEqual([]);
  });

  it('deduplicates and sorts case-insensitively', () => {
    const stdout = `
              €100 Assets:A
              €200 Assets:B
              ¥5,000 Assets:C
    `;
    expect(parseUnconverted(stdout, 'USD')).toEqual(['EUR', 'JPY']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test lib/settings/parseUnconverted.test.ts`
Expected: FAIL — file does not exist.

- [ ] **Step 3: Write the parser**

Create `lib/settings/parseUnconverted.ts`:

```ts
const SYMBOL_TO_CODE: Record<string, string> = {
  $: 'USD',
  '€': 'EUR',
  '£': 'GBP',
  '¥': 'JPY',
  '₹': 'INR',
  '₽': 'RUB',
  '₩': 'KRW',
};

/**
 * Extracts the set of commodity codes appearing in the stdout of
 * `ledger balance --flat --no-total -X <base>` that are NOT the base.
 * Ledger prints amounts as either `<symbol><number>` (e.g. `$1,234.50`,
 * `€100.00`) or `<number> <code>` (e.g. `10 Kirt`, `"My Coin" 5`).
 */
export const parseUnconverted = (stdout: string, base: string): string[] => {
  const collator = new Intl.Collator(undefined, { sensitivity: 'base' });
  const found = new Set<string>();

  for (const rawLine of stdout.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;

    // Strip trailing account (last whitespace-separated token starting with a letter — accounts cannot start with digits/symbols).
    // We just scan all tokens and pluck commodities; accounts are alphanumeric/colon, won't match the patterns below.

    // 1. <symbol><digits>     e.g. "$1,234.50", "€100.00"
    for (const m of line.matchAll(/([\p{Sc}])(-?[\d,]+(?:\.\d+)?)/gu)) {
      const code = SYMBOL_TO_CODE[m[1]] ?? m[1];
      if (code !== base) found.add(code);
    }

    // 2. <digits> <code>      e.g. "10 Kirt", "5,000 EUR"
    for (const m of line.matchAll(/(-?[\d,]+(?:\.\d+)?)\s+([A-Za-z][\w-]*)/g)) {
      const code = m[2];
      if (code !== base && !/^[A-Za-z]+:[A-Za-z]/.test(code)) {
        found.add(code);
      }
    }

    // 3. "Quoted name" <digits>   e.g. `"My Coin" 5`
    for (const m of line.matchAll(/"([^"]+)"\s+-?[\d,]+(?:\.\d+)?/g)) {
      const code = m[1];
      if (code !== base) found.add(code);
    }
  }

  return Array.from(found).sort(collator.compare);
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test lib/settings/parseUnconverted.test.ts`
Expected: all 6 tests PASS. If a test fails, adjust the regex (the symbol set or the code-token pattern) and re-run — do not weaken the test.

- [ ] **Step 5: Write the composing helper**

Create `lib/settings/getMissingRateCommodities.ts`:

```ts
import 'server-only';
import { cache } from 'react';
import runLedger from '@/utils/runLedger';
import { getBaseCurrency } from './getBaseCurrency';
import { parseUnconverted } from './parseUnconverted';

export const getMissingRateCommodities = cache(
  async (): Promise<{ unconverted: string[] }> => {
    const base = await getBaseCurrency();
    const stdout = await runLedger([
      'balance',
      '--flat',
      '--no-total',
      '-X',
      base,
    ]);
    return { unconverted: parseUnconverted(stdout, base) };
  }
);
```

- [ ] **Step 6: Restore the export in the barrel**

Edit `lib/settings/index.ts` — uncomment / add:

```ts
export { getMissingRateCommodities } from './getMissingRateCommodities';
```

- [ ] **Step 7: Type-check**

Run: `pnpm type-check`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add lib/settings/parseUnconverted.ts lib/settings/parseUnconverted.test.ts lib/settings/getMissingRateCommodities.ts lib/settings/index.ts
git commit -m "feat(settings): detect commodities ledger could not convert"
```

---

## Task 8: Migrate the 14 call sites + delete `getDefaultCurrency`

**Files:**
- Modify: 14 files listed in the spec section 6.
- Delete: `utils/getDefaultCurrency.ts`.
- Modify: `.env.example` (comment update).

Each call site changes shape from:

```ts
import getDefaultCurrency from '@/utils/getDefaultCurrency';
// inside an async function:
const currency = getDefaultCurrency() ?? 'USD';
```

to:

```ts
import { getBaseCurrency } from '@/lib/settings';
// inside an async function:
const currency = await getBaseCurrency();
```

Drop the `?? 'USD'` — `getBaseCurrency()` already returns a non-empty string.

`features/monthlyComparison/MonthlyComparison.utils.ts` is the one exception: it is a synchronous helper. Refactor:

Before:

```ts
import getDefaultCurrency from '@/utils/getDefaultCurrency';

export const getCashFlow = async (...) => {
  const currency = getDefaultCurrency() ?? 'USD';
  // ...
};
```

After:

```ts
export const getCashFlow = async (currency: string, ...) => {
  // ...
};
```

Callers in `features/monthlyComparison/MonthlyComparison.tsx` already resolve `currency` — they now pass it as the first argument to `getCashFlow`.

- [ ] **Step 1: Migrate the report pages**

Edit, one file at a time, in this order. After each, run `pnpm type-check` — keeps the working tree compiling:

  1. `app/balance/page.tsx`
  2. `app/balance/[from]/[to]/page.tsx`
  3. `app/debts/page.tsx`
  4. `app/accounts/[account]/page.tsx`
  5. `app/registers/monthly/[account]/page.tsx`
  6. `features/payees/Payees.tsx`
  7. `features/netWorth/NetWorth.tsx`
  8. `features/dashboard/Dashboard.tsx`
  9. `features/portfolio/Portfolio.tsx`
  10. `features/reconcile/Reconcile.tsx`

  In each: swap the import line, swap the assignment line. No other changes.

- [ ] **Step 2: Migrate the transaction form pages**

Edit `features/transactions/EditTransaction.tsx` and `features/transactions/NewTransaction.tsx`. The local `defaultCurrency` variable stays — only its source changes:

```ts
const defaultCurrency = await getBaseCurrency();
```

The prop passed into `<TransactionForm>` does not change shape.

- [ ] **Step 3: Refactor `MonthlyComparison`**

Edit `features/monthlyComparison/MonthlyComparison.utils.ts`: remove the import of `getDefaultCurrency`; add `currency: string` as a parameter to whichever exported function currently calls it (`getCashFlow` or similar — match the actual signature). Remove the body line that calls `getDefaultCurrency`.

Edit `features/monthlyComparison/MonthlyComparison.tsx`: import `getBaseCurrency`, resolve `currency` once at the top of the async server component, and pass it into the helper call. Use the same `currency` for `formatAmount`.

- [ ] **Step 4: Delete the old helper**

```bash
git rm utils/getDefaultCurrency.ts
```

- [ ] **Step 5: Type-check**

Run: `pnpm type-check`
Expected: PASS — no remaining references to `getDefaultCurrency`.

- [ ] **Step 6: Lint**

Run: `pnpm lint`
Expected: PASS (no unused imports left).

- [ ] **Step 7: Re-run the full test suite**

Run: `pnpm test`
Expected: all existing tests still PASS. Tests that asserted on currency strings should still work because `getBaseCurrency()` returns the same env default in test contexts.

- [ ] **Step 8: Update `.env.example`**

Edit `.env.example` — replace the `DEFAULT_CURRENCY` comment:

Before:
```
# Currency used for `-X` conversions in ledger calls. Defaults to USD.
DEFAULT_CURRENCY=USD
```

After:
```
# Fallback base currency for users who haven't set one in /settings.
# Active resolution order: session cookie > userSetting row > this value.
DEFAULT_CURRENCY=USD
```

- [ ] **Step 9: Commit**

```bash
git add app/ features/ .env.example
git rm utils/getDefaultCurrency.ts
git commit -m "refactor(settings): replace DEFAULT_CURRENCY env reads with getBaseCurrency"
```

---

## Task 9: `setSavedBaseCurrency` server action + test

**Files:**
- Create: `features/settings/actions/setSavedBaseCurrency.ts`
- Create: `features/settings/actions/setSavedBaseCurrency.test.ts`
- Create: `features/settings/actions/index.ts`

- [ ] **Step 1: Write the failing test**

Create `features/settings/actions/setSavedBaseCurrency.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const requireUser = vi.fn();
const saveBaseCurrency = vi.fn();
const revalidatePath = vi.fn();

vi.mock('@/lib/auth/require-user', () => ({
  requireUser: () => requireUser(),
}));

vi.mock('@/lib/settings', () => ({
  userSettingService: { saveBaseCurrency: (...a: unknown[]) => saveBaseCurrency(...a) },
  baseCurrencySchema: { safeParse: (v: unknown) =>
    typeof v === 'string' && v.trim().length > 0
      ? { success: true, data: v.trim() }
      : { success: false, error: new Error('bad') } },
}));

vi.mock('next/cache', () => ({
  revalidatePath: (...a: unknown[]) => revalidatePath(...a),
}));

beforeEach(() => {
  requireUser.mockReset();
  saveBaseCurrency.mockReset();
  revalidatePath.mockReset();
});

describe('setSavedBaseCurrencyAction', () => {
  it('saves the validated value and revalidates layouts', async () => {
    requireUser.mockResolvedValue({ id: 'alice' });
    const { setSavedBaseCurrencyAction } = await import('./setSavedBaseCurrency');
    const result = await setSavedBaseCurrencyAction('EUR');
    expect(result).toEqual({ ok: true });
    expect(saveBaseCurrency).toHaveBeenCalledWith('alice', 'EUR');
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout');
  });

  it('rejects an empty value without saving', async () => {
    requireUser.mockResolvedValue({ id: 'alice' });
    vi.resetModules();
    const { setSavedBaseCurrencyAction } = await import('./setSavedBaseCurrency');
    const result = await setSavedBaseCurrencyAction('');
    expect(result.ok).toBe(false);
    expect(saveBaseCurrency).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test features/settings/actions/setSavedBaseCurrency.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write the action**

Create `features/settings/actions/setSavedBaseCurrency.ts`:

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/require-user';
import { baseCurrencySchema, userSettingService } from '@/lib/settings';

export type SetSavedBaseCurrencyResult =
  | { ok: true }
  | { ok: false; message: string };

export const setSavedBaseCurrencyAction = async (
  value: unknown
): Promise<SetSavedBaseCurrencyResult> => {
  const parsed = baseCurrencySchema.safeParse(value);
  if (!parsed.success) {
    return { ok: false, message: 'Invalid currency code.' };
  }
  const user = await requireUser();
  await userSettingService.saveBaseCurrency(user.id, parsed.data);
  revalidatePath('/', 'layout');
  return { ok: true };
};
```

- [ ] **Step 4: Write the barrel**

Create `features/settings/actions/index.ts`:

```ts
export {
  setSavedBaseCurrencyAction,
  type SetSavedBaseCurrencyResult,
} from './setSavedBaseCurrency';
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test features/settings/actions/setSavedBaseCurrency.test.ts`
Expected: both tests PASS.

- [ ] **Step 6: Commit**

```bash
git add features/settings/actions/setSavedBaseCurrency.ts features/settings/actions/setSavedBaseCurrency.test.ts features/settings/actions/index.ts
git commit -m "feat(settings): server action to save base currency"
```

---

## Task 10: `setSessionBaseCurrency` + `clearSessionBaseCurrency` actions + tests

**Files:**
- Create: `features/settings/actions/setSessionBaseCurrency.ts`
- Create: `features/settings/actions/setSessionBaseCurrency.test.ts`
- Create: `features/settings/actions/clearSessionBaseCurrency.ts`
- Create: `features/settings/actions/clearSessionBaseCurrency.test.ts`
- Modify: `features/settings/actions/index.ts`

- [ ] **Step 1: Write the failing tests**

Create `features/settings/actions/setSessionBaseCurrency.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const cookieSet = vi.fn();
const revalidatePath = vi.fn();

vi.mock('next/headers', () => ({
  cookies: async () => ({ set: cookieSet }),
}));

vi.mock('next/cache', () => ({
  revalidatePath: (...a: unknown[]) => revalidatePath(...a),
}));

vi.mock('@/lib/settings', () => ({
  baseCurrencySchema: { safeParse: (v: unknown) =>
    typeof v === 'string' && v.trim().length > 0
      ? { success: true, data: v.trim() }
      : { success: false, error: new Error('bad') } },
}));

beforeEach(() => {
  cookieSet.mockReset();
  revalidatePath.mockReset();
});

describe('setSessionBaseCurrencyAction', () => {
  it('writes a long-lived lax cookie and revalidates', async () => {
    const { setSessionBaseCurrencyAction } = await import('./setSessionBaseCurrency');
    const result = await setSessionBaseCurrencyAction('EUR');
    expect(result).toEqual({ ok: true });
    expect(cookieSet).toHaveBeenCalledWith('baseCurrency', 'EUR', expect.objectContaining({
      maxAge: 60 * 60 * 24 * 365,
      sameSite: 'lax',
      path: '/',
    }));
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout');
  });

  it('rejects an invalid value without writing the cookie', async () => {
    vi.resetModules();
    const { setSessionBaseCurrencyAction } = await import('./setSessionBaseCurrency');
    const result = await setSessionBaseCurrencyAction('');
    expect(result.ok).toBe(false);
    expect(cookieSet).not.toHaveBeenCalled();
  });
});
```

Create `features/settings/actions/clearSessionBaseCurrency.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const cookieDelete = vi.fn();
const revalidatePath = vi.fn();

vi.mock('next/headers', () => ({
  cookies: async () => ({ delete: cookieDelete }),
}));

vi.mock('next/cache', () => ({
  revalidatePath: (...a: unknown[]) => revalidatePath(...a),
}));

beforeEach(() => {
  cookieDelete.mockReset();
  revalidatePath.mockReset();
});

describe('clearSessionBaseCurrencyAction', () => {
  it('deletes the cookie and revalidates layouts', async () => {
    const { clearSessionBaseCurrencyAction } = await import('./clearSessionBaseCurrency');
    await clearSessionBaseCurrencyAction();
    expect(cookieDelete).toHaveBeenCalledWith('baseCurrency');
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test features/settings/actions/`
Expected: both files FAIL (modules don't exist).

- [ ] **Step 3: Write the actions**

Create `features/settings/actions/setSessionBaseCurrency.ts`:

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { baseCurrencySchema } from '@/lib/settings';
import { COOKIE_NAME } from '@/lib/settings/getBaseCurrency';

export type SetSessionBaseCurrencyResult =
  | { ok: true }
  | { ok: false; message: string };

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export const setSessionBaseCurrencyAction = async (
  value: unknown
): Promise<SetSessionBaseCurrencyResult> => {
  const parsed = baseCurrencySchema.safeParse(value);
  if (!parsed.success) return { ok: false, message: 'Invalid currency code.' };

  const jar = await cookies();
  jar.set(COOKIE_NAME, parsed.data, {
    maxAge: ONE_YEAR_SECONDS,
    sameSite: 'lax',
    httpOnly: false,
    path: '/',
  });
  revalidatePath('/', 'layout');
  return { ok: true };
};
```

Create `features/settings/actions/clearSessionBaseCurrency.ts`:

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { COOKIE_NAME } from '@/lib/settings/getBaseCurrency';

export const clearSessionBaseCurrencyAction = async (): Promise<void> => {
  const jar = await cookies();
  jar.delete(COOKIE_NAME);
  revalidatePath('/', 'layout');
};
```

- [ ] **Step 4: Update the barrel**

Edit `features/settings/actions/index.ts`:

```ts
export {
  setSavedBaseCurrencyAction,
  type SetSavedBaseCurrencyResult,
} from './setSavedBaseCurrency';
export {
  setSessionBaseCurrencyAction,
  type SetSessionBaseCurrencyResult,
} from './setSessionBaseCurrency';
export { clearSessionBaseCurrencyAction } from './clearSessionBaseCurrency';
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm test features/settings/actions/`
Expected: all 3 PASS.

- [ ] **Step 6: Commit**

```bash
git add features/settings/actions/
git commit -m "feat(settings): session-cookie override + clear actions"
```

---

## Task 11: `BaseCurrencyBanner` component + mount in `AppShell`

**Files:**
- Create: `components/BaseCurrencyBanner/BaseCurrencyBanner.tsx`
- Create: `components/BaseCurrencyBanner/index.ts`
- Modify: `components/AppShell/AppShell.tsx`

`AppShell` is currently a client component (uses `usePathname`). The banner is a server component. Render the banner as `children`-passthrough from the layout so the boundary stays correct: `app/layout.tsx` renders `<AppShell><BaseCurrencyBanner />{children}</AppShell>`, and `AppShell` slots both into its body.

- [ ] **Step 1: Write the banner**

Create `components/BaseCurrencyBanner/BaseCurrencyBanner.tsx`:

```tsx
import { Info } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  getBaseCurrency,
  getMissingRateCommodities,
} from '@/lib/settings';

const BaseCurrencyBanner = async () => {
  const [base, { unconverted }] = await Promise.all([
    getBaseCurrency(),
    getMissingRateCommodities(),
  ]);

  if (unconverted.length === 0) return null;

  return (
    <Alert className="mx-auto mt-4 w-full max-w-7xl">
      <Info className="size-4" />
      <AlertDescription>
        Some amounts couldn&apos;t be converted to <strong>{base}</strong>.
        Missing exchange rates from:{' '}
        <strong>{unconverted.join(', ')}</strong>. Affected reports show
        original currencies inline.
      </AlertDescription>
    </Alert>
  );
};

export default BaseCurrencyBanner;
```

Create `components/BaseCurrencyBanner/index.ts`:

```ts
export { default } from './BaseCurrencyBanner';
```

- [ ] **Step 2: Wire it into the layout (not AppShell)**

Open `app/layout.tsx`. Find where `<AppShell>{children}</AppShell>` is rendered. Change to:

```tsx
import BaseCurrencyBanner from '@/components/BaseCurrencyBanner';
// ...
<AppShell>
  <BaseCurrencyBanner />
  {children}
</AppShell>
```

The banner is a server component, rendered inside the client `AppShell` as a passed child — perfectly legal in App Router.

- [ ] **Step 3: Run dev server and smoke-test**

Run (in another terminal): `pnpm dev`
Open: `http://localhost:3002/` (per the project's PORT)
Expected: with a journal that has no missing rates, no banner. To force a banner, temporarily add a EUR posting to a fixture or set `DEFAULT_CURRENCY=EUR` (no `P` directives → un-convertible USD). Verify banner copy.

- [ ] **Step 4: Type-check + lint**

Run: `pnpm type-check && pnpm lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/BaseCurrencyBanner/ app/layout.tsx
git commit -m "feat(settings): banner surfaces commodities ledger could not convert"
```

---

## Task 12: `BaseCurrencyPicker` component + mount in `AppHeader`

**Files:**
- Create: `components/BaseCurrencyPicker/BaseCurrencyPicker.tsx`
- Create: `components/BaseCurrencyPicker/index.ts`
- Modify: `components/Header/AppHeader.tsx`

The header is a client component but the helpers it needs are server-only. Resolution: introduce a small server wrapper (`BaseCurrencyPickerSlot`) that resolves the data and renders the client picker.

- [ ] **Step 1: Write the client picker**

Create `components/BaseCurrencyPicker/BaseCurrencyPicker.tsx`:

```tsx
'use client';

import { useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import Combobox from '@/components/Combobox/Combobox';
import {
  clearSessionBaseCurrencyAction,
  setSessionBaseCurrencyAction,
} from '@/features/settings/actions';

type Props = {
  current: string;
  available: string[];
  savedDefault: string | null;
};

const BaseCurrencyPicker = ({ current, available, savedDefault }: Props) => {
  const [pending, startTransition] = useTransition();
  const overridden = savedDefault !== null && current !== savedDefault;

  const onChange = (next: string) => {
    if (next === current) return;
    startTransition(async () => {
      const result = await setSessionBaseCurrencyAction(next);
      if (!result.ok) toast.error(result.message);
    });
  };

  const onReset = () => {
    startTransition(async () => {
      await clearSessionBaseCurrencyAction();
    });
  };

  return (
    <div className="flex items-center gap-1.5">
      <Combobox
        value={current}
        onChange={onChange}
        options={available}
        triggerClassName="min-w-[120px]"
        placeholder={current}
        allowFreeText={false}
      />
      {overridden && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onReset}
          disabled={pending}
          title={`Reset to your saved default (${savedDefault})`}
        >
          Reset
        </Button>
      )}
    </div>
  );
};

export default BaseCurrencyPicker;
```

Create `components/BaseCurrencyPicker/index.ts`:

```ts
export { default } from './BaseCurrencyPicker';
export { default as BaseCurrencyPickerSlot } from './BaseCurrencyPickerSlot';
```

- [ ] **Step 2: Write the server slot**

Create `components/BaseCurrencyPicker/BaseCurrencyPickerSlot.tsx`:

```tsx
import 'server-only';
import { getOptionalUser } from '@/lib/auth/require-user';
import {
  getAvailableCurrencies,
  userSettingRepository,
} from '@/lib/settings';
import BaseCurrencyPicker from './BaseCurrencyPicker';

const BaseCurrencyPickerSlot = async () => {
  const [{ currencies, base }, user] = await Promise.all([
    getAvailableCurrencies(),
    getOptionalUser(),
  ]);
  if (!user) return null;
  const row = await userSettingRepository.get(user.id);
  return (
    <BaseCurrencyPicker
      current={base}
      available={currencies}
      savedDefault={row?.baseCurrency ?? null}
    />
  );
};

export default BaseCurrencyPickerSlot;
```

- [ ] **Step 3: Mount the slot in the header**

The header is a client component, so the picker slot must come in as a prop or children. The cleanest seam: introduce a small server component above the header. Edit `components/AppShell/AppShell.tsx` and `components/Header/AppHeader.tsx`:

- Change `AppHeader` to accept a `slot?: React.ReactNode` prop and render it next to `CommandPaletteTrigger`:

```tsx
type Props = { slot?: React.ReactNode };
const AppHeader = ({ slot }: Props) => {
  // ... existing body ...
  // In the right-hand cluster:
  // <div className="ml-auto flex items-center gap-2">
  //   {slot}
  //   <CommandPaletteTrigger />
  //   ...
```

- In `AppShell`, accept a `headerSlot?: React.ReactNode` prop and forward it:

```tsx
const AppShell = ({ children, headerSlot }: {
  children: React.ReactNode;
  headerSlot?: React.ReactNode;
}) => {
  // ... isAuthPage branch unchanged ...
  return (
    <TooltipProvider>
      <CommandPaletteProvider>
        <SidebarProvider>
          <AppSidebar />
          <SidebarInset>
            <AppHeader slot={headerSlot} />
            {/* ... */}
```

- In `app/layout.tsx`, pass the picker:

```tsx
import { BaseCurrencyPickerSlot } from '@/components/BaseCurrencyPicker';
// ...
<AppShell headerSlot={<BaseCurrencyPickerSlot />}>
  <BaseCurrencyBanner />
  {children}
</AppShell>
```

- [ ] **Step 4: Dev-server smoke test**

Run: `pnpm dev`. Visit `/`. Confirm:
  - Picker shows the current base (e.g. `USD`).
  - Opening it lists the journal's commodities, sorted, with `USD` pinned first.
  - Selecting another commodity (e.g. `EUR`) immediately updates the page totals (currencies recompute via `-X`).
  - A `Reset` button appears next to the picker after the change; clicking it reverts.

- [ ] **Step 5: Type-check + lint**

Run: `pnpm type-check && pnpm lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add components/BaseCurrencyPicker/ components/Header/AppHeader.tsx components/AppShell/AppShell.tsx app/layout.tsx
git commit -m "feat(settings): header picker for session currency override"
```

---

## Task 13: `/settings` page + form + nav config + user-menu link

**Files:**
- Create: `app/settings/page.tsx`
- Create: `app/settings/loading.tsx`
- Create: `features/settings/Settings.tsx`
- Create: `features/settings/BaseCurrencyForm.tsx`
- Create: `features/settings/index.ts`
- Modify: `components/nav/config.ts`
- Modify: `components/Header/AppHeader.tsx`

- [ ] **Step 1: Write the form (client)**

Create `features/settings/BaseCurrencyForm.tsx`:

```tsx
'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import Combobox from '@/components/Combobox/Combobox';
import { Button } from '@/components/ui/button';
import { setSavedBaseCurrencyAction } from '@/features/settings/actions';

type Props = {
  initial: string;
  options: string[];
};

const BaseCurrencyForm = ({ initial, options }: Props) => {
  const [value, setValue] = useState(initial);
  const [pending, startTransition] = useTransition();

  const onSave = () => {
    startTransition(async () => {
      const result = await setSavedBaseCurrencyAction(value);
      if (result.ok) toast.success('Default currency saved');
      else toast.error(result.message);
    });
  };

  return (
    <div className="flex items-end gap-3">
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium">Default currency</label>
        <Combobox
          value={value}
          onChange={setValue}
          options={options}
          triggerClassName="min-w-[180px]"
          allowFreeText={false}
        />
      </div>
      <Button onClick={onSave} disabled={pending || value === initial}>
        Save
      </Button>
    </div>
  );
};

export default BaseCurrencyForm;
```

- [ ] **Step 2: Write the page wrapper (server)**

Create `features/settings/Settings.tsx`:

```tsx
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import BaseCurrencyForm from './BaseCurrencyForm';
import { clearSessionBaseCurrencyAction } from './actions';

type Props = {
  base: string;
  currencies: string[];
  savedDefault: string | null;
  envFallback: string;
};

const Settings = ({ base, currencies, savedDefault, envFallback }: Props) => {
  const overrideActive =
    (savedDefault !== null && base !== savedDefault) ||
    (savedDefault === null && base !== envFallback);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle>Base currency</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <BaseCurrencyForm
            initial={savedDefault ?? envFallback}
            options={currencies}
          />
          {overrideActive && (
            <Alert>
              <AlertDescription className="flex items-center justify-between gap-3">
                <span>
                  You&apos;re currently viewing reports in <strong>{base}</strong>.
                  This overrides your saved default.
                </span>
                <form action={clearSessionBaseCurrencyAction}>
                  <Button type="submit" variant="outline" size="sm">
                    Clear session override
                  </Button>
                </form>
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Settings;
```

Create `features/settings/index.ts`:

```ts
export { default as Settings } from './Settings';
export * from './actions';
```

- [ ] **Step 3: Write the route**

Create `app/settings/page.tsx`:

```tsx
import { requireUser } from '@/lib/auth/require-user';
import { env } from '@/lib/env';
import {
  getAvailableCurrencies,
  userSettingRepository,
} from '@/lib/settings';
import { Settings } from '@/features/settings';

const SettingsPage = async () => {
  const user = await requireUser();
  const [{ currencies, base }, row] = await Promise.all([
    getAvailableCurrencies(),
    userSettingRepository.get(user.id),
  ]);
  return (
    <Settings
      base={base}
      currencies={currencies}
      savedDefault={row?.baseCurrency ?? null}
      envFallback={env.DEFAULT_CURRENCY}
    />
  );
};

export default SettingsPage;
```

Create `app/settings/loading.tsx`:

```tsx
import PageSkeleton from '@/components/PageSkeleton';

const Loading = () => <PageSkeleton hasChart={false} rows={4} />;
export default Loading;
```

(Match the existing `PageSkeleton` API used by other routes — if its props differ from `hasChart` / `rows`, copy the shape used by `app/balance/loading.tsx`.)

- [ ] **Step 4: Add nav entry**

Edit `components/nav/config.ts` — append a new section:

```ts
import { Settings } from 'lucide-react'; // add to imports
// ...
return [
  // existing sections,
  {
    id: 'account',
    title: 'Account',
    items: [
      {
        id: 'settings',
        title: 'Settings',
        href: '/settings',
        description: 'Personal preferences like base currency.',
        icon: Settings,
        keywords: ['preferences', 'currency', 'profile'],
      },
    ],
  },
];
```

- [ ] **Step 5: Add user-menu link**

Edit `components/Header/AppHeader.tsx`. In the user `DropdownMenu`, add a `DropdownMenuItem` linking to `/settings` above the existing `Sign out`:

```tsx
import { Settings as SettingsIcon } from 'lucide-react'; // add to imports
// ...
<DropdownMenuItem render={<Link href="/settings" />}>
  <SettingsIcon className="size-4" /> Settings
</DropdownMenuItem>
<DropdownMenuItem onSelect={() => signOut()}>
  <LogOutIcon className="size-4" /> Sign out
</DropdownMenuItem>
```

(Match the existing `DropdownMenuItem` patterns in the file — props may differ slightly; copy the shape of the existing sign-out item.)

- [ ] **Step 6: Dev-server smoke test**

Run: `pnpm dev`. Visit `/settings`:
  - Form lists available currencies, defaults to either the saved row or env fallback.
  - Save flashes a sonner toast and changes the active base.
  - If the user toggles via the header picker first, `/settings` shows the "session override active" alert with a clear button.
  - Sidebar shows the new "Account → Settings" item.
  - User-menu dropdown links to `/settings`.
  - Cmd/Ctrl-K command palette finds "Settings".

- [ ] **Step 7: Type-check + lint + test**

Run: `pnpm type-check && pnpm lint && pnpm test`
Expected: PASS across the board.

- [ ] **Step 8: Commit**

```bash
git add app/settings/ features/settings/ components/nav/config.ts components/Header/AppHeader.tsx
git commit -m "feat(settings): /settings page with base currency form"
```

---

## Task 14: PLAN.md update

**Files:**
- Modify: `PLAN.md`

- [ ] **Step 1: Add the feature under Phase 6**

Edit `PLAN.md`. In the Phase 6 section, add a new bullet (alphabetical placement, near the existing `Commodity / portfolio view`):

```md
- [x] **Base currency selector** — per-user `userSetting.baseCurrency` (SQLite) plus a long-lived `baseCurrency` session cookie. Resolution: cookie > setting > env `DEFAULT_CURRENCY`. New `/settings` page (form), new header combobox (session override + Reset), new banner above the page body listing commodities ledger couldn't convert. The 14 prior `getDefaultCurrency()` consumers migrated to `await getBaseCurrency()`. Currencies are sourced from `ledger commodities`. See spec `docs/superpowers/specs/2026-05-24-base-currency-selector-design.md`.
```

- [ ] **Step 2: Commit**

```bash
git add PLAN.md
git commit -m "docs(plan): tick off Phase 6 base currency selector"
```

---

## Self-Review

Run after writing the plan:

**1. Spec coverage:**
- Spec section 1 (data model & helpers) → Tasks 1, 2, 3, 4. ✓
- Spec section 2 (currency discovery) → Task 6 (with the documented deviation: helper lives in `lib/settings/` rather than on `JournalRepository`). ✓
- Spec section 3 (resolution & cookie write path) → Tasks 5, 9, 10. ✓
- Spec section 4 (header combobox + settings page) → Tasks 12, 13. ✓
- Spec section 5 (missing-rate banner) → Task 11 (parser is Task 7, mount is Task 11). ✓
- Spec section 6 (migration of 14 sites) → Task 8. ✓
- Spec section 7 (testing) → tests embedded in every task. ✓

**2. Placeholder scan:** no `TBD`/`TODO`/`fill in details`; every step shows complete code or a complete command.

**3. Type consistency:**
- `getBaseCurrency()` — same signature in Tasks 5, 11, 12, 13, and all migrated call sites in Task 8.
- `getAvailableCurrencies()` — Task 6 returns `{ currencies: string[]; base: string }`; consumers in Tasks 12 (Slot), 13 (Settings page) destructure both keys. ✓
- `userSettingRepository.get(userId)` returns `UserSetting | null`; consumers in Tasks 12 (Slot), 13 (page) handle null via `row?.baseCurrency ?? null`. ✓
- `setSessionBaseCurrencyAction(value: unknown)` — Tasks 10 and 12 (picker). ✓
- `COOKIE_NAME` exported from `lib/settings/getBaseCurrency.ts` — Tasks 5, 10. ✓

**4. Open issue (call out, not fix here):** `parseUnconverted` assumes ledger emits the SI-style $/€/£/¥/₹/₽/₩ symbols. Journals using other symbols (₿, ₺, etc.) will see those symbols in the banner verbatim instead of human-readable codes. Acceptable v1 behavior — they're still distinguishable. If this becomes a problem, extend `SYMBOL_TO_CODE` in a follow-up.

---

## Execution Handoff
