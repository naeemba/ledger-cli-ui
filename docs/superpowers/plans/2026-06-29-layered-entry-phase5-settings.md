# Layered Transaction Entry — Phase 5 (Settings: tab order & default) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each user a persisted preference for the order of the three transaction-entry tabs (Types · Form · Raw), where the first tab is the default the entry shell opens on.

**Architecture:** A pure, unit-tested ordering core lives in `lib/transactions/entryTabs.ts` (tab-id list, zod schema, normalize/parse/serialize). The order persists as a comma-joined string in a new nullable `entryTabOrder` column on the existing `userSetting` table, written through the existing `UserSettingRepository`/`UserSettingService` and a new `setEntryTabOrderAction`, read back by a cached `getEntryTabOrder()` server helper. The `TransactionEntry` client shell already owns `active` tab state and a `TABS` registry; Phase 5 makes that registry order-driven via a new `tabOrder` prop, and the `NewTransaction`/`EditTransaction` server components pass the persisted order. A small `EntryTabOrderForm` in Settings lets the user reorder the three tabs with up/down controls.

**Tech Stack:** Next.js (App Router, server actions), React 19 (`useReducer`/`useState`/`useTransition`), Drizzle ORM + Postgres (PGlite in tests), Zod, Vitest + `renderToStaticMarkup` (node env, no jsdom), Tailwind, shadcn/ui.

## Global Constraints

- The ledger file stays the source of truth; a transaction's type is inferred from posting shape, never stored. (Unchanged by this phase — Phase 5 touches only UI tab ordering, never journal output.)
- All three tabs (`types`, `form`, `raw`) remain always-present regardless of stored order. Ordering never hides a tab.
- Default order for users with no preference is **`Types · Form · Raw`** (`['types', 'form', 'raw']`).
- Tab ordering is a pure, unit-testable helper; persistence mirrors the base-currency mechanism (`userSetting` table → `UserSettingRepository` → `UserSettingService` → `getBaseCurrency`-style cached reader → `setSavedBaseCurrencyAction`-style server action).
- No self-reference in any artifact (commits, comments, docs): write as if a human authored it. No `Co-Authored-By`/"Generated with" trailers.
- Tests: pure logic gets exhaustive unit tests; interactive client components get static smoke tests via `renderToStaticMarkup` (node env). DB code uses `setupTestDb`/`teardownTestDb` (PGlite, real migrations applied from `db/migrations`).
- Run a single test file with `pnpm test <path>`; narrow to one case with `pnpm test <path> -t "<name>"`. Lint with `pnpm lint`.

---

### Task 1: Pure entry-tab-order core

**Files:**
- Create: `lib/transactions/entryTabs.ts`
- Test: `lib/transactions/entryTabs.test.ts`

**Interfaces:**
- Consumes: `zod` (`z`).
- Produces:
  - `TAB_IDS: readonly ['types', 'form', 'raw']`
  - `type TabId = 'types' | 'form' | 'raw'`
  - `DEFAULT_TAB_ORDER: TabId[]` (= `['types', 'form', 'raw']`)
  - `entryTabOrderSchema: z.ZodArray<z.ZodEnum<...>>` — validates an array whose every element is a known `TabId`
  - `normalizeTabOrder(order: readonly string[] | null | undefined): TabId[]` — the pure orderer: keeps valid ids in given order (de-duped), then appends any missing canonical ids in `DEFAULT_TAB_ORDER` order. Always returns all three. (This is the roadmap's `orderTabs` helper, realized over ids.)
  - `parseEntryTabOrder(raw: string | null | undefined): TabId[]` — splits a stored comma string and normalizes; `null`/empty → `DEFAULT_TAB_ORDER`
  - `serializeEntryTabOrder(order: readonly TabId[]): string` — normalizes then comma-joins (storage form)

- [ ] **Step 1: Write the failing test**

Create `lib/transactions/entryTabs.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  TAB_IDS,
  DEFAULT_TAB_ORDER,
  entryTabOrderSchema,
  normalizeTabOrder,
  parseEntryTabOrder,
  serializeEntryTabOrder,
} from './entryTabs';

describe('entryTabs constants', () => {
  it('exposes the three canonical tab ids and default order', () => {
    expect(TAB_IDS).toEqual(['types', 'form', 'raw']);
    expect(DEFAULT_TAB_ORDER).toEqual(['types', 'form', 'raw']);
  });
});

describe('normalizeTabOrder', () => {
  it('returns the default order for null/undefined/empty', () => {
    expect(normalizeTabOrder(null)).toEqual(['types', 'form', 'raw']);
    expect(normalizeTabOrder(undefined)).toEqual(['types', 'form', 'raw']);
    expect(normalizeTabOrder([])).toEqual(['types', 'form', 'raw']);
  });

  it('honors a full custom permutation', () => {
    expect(normalizeTabOrder(['raw', 'types', 'form'])).toEqual([
      'raw',
      'types',
      'form',
    ]);
  });

  it('appends missing tabs in default order', () => {
    expect(normalizeTabOrder(['raw'])).toEqual(['raw', 'types', 'form']);
  });

  it('drops unknown ids and de-duplicates', () => {
    expect(normalizeTabOrder(['raw', 'bogus', 'raw', 'form'])).toEqual([
      'raw',
      'form',
      'types',
    ]);
  });
});

describe('parse/serialize round-trip', () => {
  it('parseEntryTabOrder splits and normalizes a stored string', () => {
    expect(parseEntryTabOrder('raw,form,types')).toEqual([
      'raw',
      'form',
      'types',
    ]);
    expect(parseEntryTabOrder(null)).toEqual(['types', 'form', 'raw']);
    expect(parseEntryTabOrder('')).toEqual(['types', 'form', 'raw']);
  });

  it('serializeEntryTabOrder produces a normalized comma string', () => {
    expect(serializeEntryTabOrder(['raw', 'types', 'form'])).toBe(
      'raw,types,form'
    );
    expect(parseEntryTabOrder(serializeEntryTabOrder(['form', 'raw', 'types']))).toEqual([
      'form',
      'raw',
      'types',
    ]);
  });
});

describe('entryTabOrderSchema', () => {
  it('accepts an array of known ids', () => {
    expect(entryTabOrderSchema.safeParse(['raw', 'types', 'form']).success).toBe(
      true
    );
  });

  it('rejects unknown ids and non-arrays', () => {
    expect(entryTabOrderSchema.safeParse(['raw', 'bogus']).success).toBe(false);
    expect(entryTabOrderSchema.safeParse('raw,form').success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test lib/transactions/entryTabs.test.ts`
Expected: FAIL — cannot resolve `./entryTabs` (module not found).

- [ ] **Step 3: Write minimal implementation**

Create `lib/transactions/entryTabs.ts`:

```ts
import { z } from 'zod';

export const TAB_IDS = ['types', 'form', 'raw'] as const;
export type TabId = (typeof TAB_IDS)[number];

export const DEFAULT_TAB_ORDER: TabId[] = ['types', 'form', 'raw'];

export const entryTabOrderSchema = z.array(z.enum(TAB_IDS));

const isTabId = (value: string): value is TabId =>
  (TAB_IDS as readonly string[]).includes(value);

// Keep the valid ids in the given order (first occurrence wins), then append
// any canonical tab the caller omitted. Guarantees all three are always present
// so ordering can never hide a tab.
export function normalizeTabOrder(
  order: readonly string[] | null | undefined
): TabId[] {
  const seen = new Set<TabId>();
  const result: TabId[] = [];
  for (const id of order ?? []) {
    if (isTabId(id) && !seen.has(id)) {
      seen.add(id);
      result.push(id);
    }
  }
  for (const id of DEFAULT_TAB_ORDER) {
    if (!seen.has(id)) result.push(id);
  }
  return result;
}

export function parseEntryTabOrder(
  raw: string | null | undefined
): TabId[] {
  if (!raw) return [...DEFAULT_TAB_ORDER];
  return normalizeTabOrder(raw.split(','));
}

export function serializeEntryTabOrder(order: readonly TabId[]): string {
  return normalizeTabOrder(order).join(',');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test lib/transactions/entryTabs.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add lib/transactions/entryTabs.ts lib/transactions/entryTabs.test.ts
git commit -m "feat(transactions): pure entry tab-order core (normalize/parse/serialize)"
```

---

### Task 2: Add the `entryTabOrder` column + migration

**Files:**
- Modify: `db/schema/userSetting.ts`
- Create: `db/migrations/00XX_<generated>.sql` (name auto-generated by drizzle-kit)

**Interfaces:**
- Consumes: nothing new.
- Produces: `userSetting.entryTabOrder` — nullable `text` column. `UserSetting['entryTabOrder']: string | null`.

- [ ] **Step 1: Add the column to the schema**

In `db/schema/userSetting.ts`, add the `entryTabOrder` column after `journalMain` (before `updatedAt`):

```ts
  // Comma-joined order of the transaction-entry tabs (e.g. "types,form,raw").
  // Nullable: consumers fall back to DEFAULT_TAB_ORDER when null. The first id
  // is the default tab the entry shell opens on.
  entryTabOrder: text('entryTabOrder'),
```

The block now reads:

```ts
export const userSetting = pgTable('userSetting', {
  userId: text('userId')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  baseCurrency: text('baseCurrency'),
  journalMain: text('journalMain').notNull().default('main.ledger'),
  entryTabOrder: text('entryTabOrder'),
  updatedAt: timestamp('updatedAt')
    .notNull()
    .default(sql`now()`),
});
```

(Keep the existing comments on `baseCurrency`/`journalMain`; only the `entryTabOrder` line and its comment are added.)

- [ ] **Step 2: Generate the migration**

Run: `pnpm db:generate`
Expected: drizzle-kit writes a new `db/migrations/00XX_<words>.sql` containing `ALTER TABLE "userSetting" ADD COLUMN "entryTabOrder" text;` and updates `db/migrations/meta`. Note the generated filename.

- [ ] **Step 3: Verify existing settings DB tests still pass against the new schema**

The test harness applies every migration in `db/migrations` to PGlite, so the new column is exercised automatically.

Run: `pnpm test lib/settings/repository.test.ts`
Expected: PASS (the existing base-currency repo tests are unaffected by the added nullable column).

- [ ] **Step 4: Commit**

```bash
git add db/schema/userSetting.ts db/migrations
git commit -m "feat(settings): add nullable entryTabOrder column to userSetting"
```

---

### Task 3: Repository `upsertEntryTabOrder`

**Files:**
- Modify: `lib/settings/repository.ts`
- Test: `lib/settings/repository.test.ts`

**Interfaces:**
- Consumes: `userSetting` table (with `entryTabOrder` from Task 2), `DbInstance`.
- Produces: `UserSettingRepository.upsertEntryTabOrder(userId: string, value: string): Promise<void>` — inserts or updates the row, setting `entryTabOrder` and bumping `updatedAt` via DB clock. Leaves `baseCurrency`/`journalMain` untouched on update.

- [ ] **Step 1: Write the failing test**

Append inside the existing `describe('UserSettingRepository', ...)` in `lib/settings/repository.test.ts`:

```ts
  it('upsertEntryTabOrder creates a row on first call', async () => {
    await repo.upsertEntryTabOrder('alice', 'raw,types,form');
    const row = await repo.get('alice');
    expect(row?.entryTabOrder).toBe('raw,types,form');
  });

  it('upsertEntryTabOrder updates in place without clobbering baseCurrency', async () => {
    await repo.upsertBaseCurrency('alice', 'EUR');
    await repo.upsertEntryTabOrder('alice', 'form,raw,types');
    const row = await repo.get('alice');
    expect(row?.entryTabOrder).toBe('form,raw,types');
    expect(row?.baseCurrency).toBe('EUR');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test lib/settings/repository.test.ts -t "upsertEntryTabOrder"`
Expected: FAIL — `repo.upsertEntryTabOrder is not a function`.

- [ ] **Step 3: Write minimal implementation**

In `lib/settings/repository.ts`, add a method to `UserSettingRepository` (after `upsertBaseCurrency`):

```ts
  async upsertEntryTabOrder(userId: string, value: string): Promise<void> {
    await this.db
      .insert(userSetting)
      .values({ userId, entryTabOrder: value })
      .onConflictDoUpdate({
        target: userSetting.userId,
        set: { entryTabOrder: value, updatedAt: sql`now()` },
      });
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test lib/settings/repository.test.ts`
Expected: PASS (new cases + existing base-currency cases).

- [ ] **Step 5: Commit**

```bash
git add lib/settings/repository.ts lib/settings/repository.test.ts
git commit -m "feat(settings): repository upsertEntryTabOrder"
```

---

### Task 4: Service `saveEntryTabOrder`

**Files:**
- Modify: `lib/settings/service.ts`
- Test: `lib/settings/service.test.ts`

**Interfaces:**
- Consumes: `UserSettingRepository.upsertEntryTabOrder` (Task 3); `serializeEntryTabOrder`, `TabId` (Task 1).
- Produces: `UserSettingService.saveEntryTabOrder(userId: string, order: TabId[]): Promise<void>` — serializes (normalizing) and persists.

- [ ] **Step 1: Write the failing test**

Append inside `describe('UserSettingService', ...)` in `lib/settings/service.test.ts`:

```ts
  it('saveEntryTabOrder serializes and round-trips through get', async () => {
    await service.saveEntryTabOrder('alice', ['raw', 'types', 'form']);
    const row = await service.get('alice');
    expect(row?.entryTabOrder).toBe('raw,types,form');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test lib/settings/service.test.ts -t "saveEntryTabOrder"`
Expected: FAIL — `service.saveEntryTabOrder is not a function`.

- [ ] **Step 3: Write minimal implementation**

In `lib/settings/service.ts`, add the import and method:

```ts
import {
  serializeEntryTabOrder,
  type TabId,
} from '@/lib/transactions/entryTabs';
```

```ts
  async saveEntryTabOrder(userId: string, order: TabId[]): Promise<void> {
    await this.repo.upsertEntryTabOrder(userId, serializeEntryTabOrder(order));
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test lib/settings/service.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/settings/service.ts lib/settings/service.test.ts
git commit -m "feat(settings): service saveEntryTabOrder"
```

---

### Task 5: Cached `getEntryTabOrder()` reader + barrel export

**Files:**
- Create: `lib/settings/getEntryTabOrder.ts`
- Create: `lib/settings/getEntryTabOrder.test.ts`
- Modify: `lib/settings/index.ts`

**Interfaces:**
- Consumes: `userSettingRepository` (from `./instances`), `getOptionalUser`, `createLogger`, and `parseEntryTabOrder`/`DEFAULT_TAB_ORDER`/`TabId` (Task 1).
- Produces: `getEntryTabOrder(): Promise<TabId[]>` — cached per request; reads the user's row, parses `entryTabOrder`, degrades to `DEFAULT_TAB_ORDER` for anon users or on DB error. Re-exported from `@/lib/settings`.

- [ ] **Step 1: Write the failing test**

Create `lib/settings/getEntryTabOrder.test.ts` (mirrors `getBaseCurrency.test.ts`'s mock style):

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const getOptionalUser = vi.fn();
const repoGet = vi.fn();

vi.mock('@/lib/auth/require-user', () => ({
  getOptionalUser: () => getOptionalUser(),
}));

vi.mock('./instances', () => ({
  userSettingRepository: { get: (id: string) => repoGet(id) },
}));

vi.mock('@/lib/log', () => ({
  createLogger: () => ({ error: vi.fn() }),
}));

beforeEach(() => {
  getOptionalUser.mockReset();
  repoGet.mockReset();
  vi.resetModules();
});

describe('getEntryTabOrder', () => {
  it('returns the default order for an anonymous user', async () => {
    getOptionalUser.mockResolvedValue(null);
    const { getEntryTabOrder } = await import('./getEntryTabOrder');
    expect(await getEntryTabOrder()).toEqual(['types', 'form', 'raw']);
    expect(repoGet).not.toHaveBeenCalled();
  });

  it('parses a stored order for a signed-in user', async () => {
    getOptionalUser.mockResolvedValue({ id: 'alice' });
    repoGet.mockResolvedValue({ entryTabOrder: 'raw,types,form' });
    const { getEntryTabOrder } = await import('./getEntryTabOrder');
    expect(await getEntryTabOrder()).toEqual(['raw', 'types', 'form']);
  });

  it('falls back to the default when the row has no preference', async () => {
    getOptionalUser.mockResolvedValue({ id: 'alice' });
    repoGet.mockResolvedValue({ entryTabOrder: null });
    const { getEntryTabOrder } = await import('./getEntryTabOrder');
    expect(await getEntryTabOrder()).toEqual(['types', 'form', 'raw']);
  });

  it('degrades to the default order on a DB error', async () => {
    getOptionalUser.mockResolvedValue({ id: 'alice' });
    repoGet.mockRejectedValue(new Error('db down'));
    const { getEntryTabOrder } = await import('./getEntryTabOrder');
    expect(await getEntryTabOrder()).toEqual(['types', 'form', 'raw']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test lib/settings/getEntryTabOrder.test.ts`
Expected: FAIL — cannot resolve `./getEntryTabOrder`.

- [ ] **Step 3: Write minimal implementation**

Create `lib/settings/getEntryTabOrder.ts`:

```ts
import { cache } from 'react';
import 'server-only';
import { userSettingRepository } from './instances';
import { getOptionalUser } from '@/lib/auth/require-user';
import { createLogger } from '@/lib/log';
import {
  DEFAULT_TAB_ORDER,
  parseEntryTabOrder,
  type TabId,
} from '@/lib/transactions/entryTabs';

const log = createLogger('settings');

export const getEntryTabOrder = cache(async (): Promise<TabId[]> => {
  const user = await getOptionalUser();
  if (user) {
    try {
      const row = await userSettingRepository.get(user.id);
      return parseEntryTabOrder(row?.entryTabOrder ?? null);
    } catch (e) {
      // Reading the tab order should never 500 the new/edit page — degrade to
      // the default order just like getBaseCurrency degrades to DEFAULT_CURRENCY.
      log.error({ err: e }, 'failed to read entry tab order');
    }
  }
  return [...DEFAULT_TAB_ORDER];
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test lib/settings/getEntryTabOrder.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the barrel export**

In `lib/settings/index.ts`, add after the `getBaseCurrency` export line:

```ts
export { getEntryTabOrder } from './getEntryTabOrder';
```

- [ ] **Step 6: Commit**

```bash
git add lib/settings/getEntryTabOrder.ts lib/settings/getEntryTabOrder.test.ts lib/settings/index.ts
git commit -m "feat(settings): cached getEntryTabOrder reader"
```

---

### Task 6: `setEntryTabOrderAction` server action + export

**Files:**
- Create: `features/settings/actions/setEntryTabOrder.ts`
- Create: `features/settings/actions/setEntryTabOrder.test.ts`
- Modify: `features/settings/actions/index.ts`

**Interfaces:**
- Consumes: `requireUser`, `rateLimit`/`WRITE`/`RATE_LIMIT_MESSAGE`, `userSettingService.saveEntryTabOrder` (Task 4), `entryTabOrderSchema` (Task 1), `revalidatePath`.
- Produces: `setEntryTabOrderAction(value: unknown): Promise<SetEntryTabOrderResult>` where `SetEntryTabOrderResult = { ok: true } | { ok: false; message: string }`.

- [ ] **Step 1: Write the failing test**

Create `features/settings/actions/setEntryTabOrder.test.ts` (mirrors `setSavedBaseCurrency.test.ts`):

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const requireUser = vi.fn();
const saveEntryTabOrder = vi.fn();
const revalidatePath = vi.fn();

vi.mock('@/lib/auth/require-user', () => ({
  requireUser: () => requireUser(),
}));

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: () => ({ allowed: true }),
  WRITE: 'write',
  RATE_LIMIT_MESSAGE: 'Too many requests.',
}));

vi.mock('@/lib/settings', () => ({
  userSettingService: {
    saveEntryTabOrder: (...a: unknown[]) => saveEntryTabOrder(...a),
  },
}));

vi.mock('next/cache', () => ({
  revalidatePath: (...a: unknown[]) => revalidatePath(...a),
}));

beforeEach(() => {
  requireUser.mockReset();
  saveEntryTabOrder.mockReset();
  revalidatePath.mockReset();
  vi.resetModules();
});

describe('setEntryTabOrderAction', () => {
  it('saves a validated order and revalidates layouts', async () => {
    requireUser.mockResolvedValue({ id: 'alice' });
    const { setEntryTabOrderAction } = await import('./setEntryTabOrder');
    const result = await setEntryTabOrderAction(['raw', 'types', 'form']);
    expect(result).toEqual({ ok: true });
    expect(saveEntryTabOrder).toHaveBeenCalledWith('alice', [
      'raw',
      'types',
      'form',
    ]);
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout');
  });

  it('rejects an order with unknown ids without saving', async () => {
    requireUser.mockResolvedValue({ id: 'alice' });
    const { setEntryTabOrderAction } = await import('./setEntryTabOrder');
    const result = await setEntryTabOrderAction(['raw', 'bogus']);
    expect(result.ok).toBe(false);
    expect(saveEntryTabOrder).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test features/settings/actions/setEntryTabOrder.test.ts`
Expected: FAIL — cannot resolve `./setEntryTabOrder`.

- [ ] **Step 3: Write minimal implementation**

Create `features/settings/actions/setEntryTabOrder.ts`:

```ts
'use server';

import { requireUser } from '@/lib/auth/require-user';
import { rateLimit, WRITE, RATE_LIMIT_MESSAGE } from '@/lib/rate-limit';
import { userSettingService } from '@/lib/settings';
import { entryTabOrderSchema } from '@/lib/transactions/entryTabs';
import { revalidatePath } from 'next/cache';

export type SetEntryTabOrderResult =
  | { ok: true }
  | { ok: false; message: string };

export const setEntryTabOrderAction = async (
  value: unknown
): Promise<SetEntryTabOrderResult> => {
  const user = await requireUser();
  if (!rateLimit(WRITE, user.id).allowed) {
    return { ok: false, message: RATE_LIMIT_MESSAGE };
  }
  const parsed = entryTabOrderSchema.safeParse(value);
  if (!parsed.success) {
    return { ok: false, message: 'Invalid tab order.' };
  }
  await userSettingService.saveEntryTabOrder(user.id, parsed.data);
  revalidatePath('/', 'layout');
  return { ok: true };
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test features/settings/actions/setEntryTabOrder.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the action export**

In `features/settings/actions/index.ts`, add after the `setSavedBaseCurrencyAction` export block:

```ts
export {
  setEntryTabOrderAction,
  type SetEntryTabOrderResult,
} from './setEntryTabOrder';
```

- [ ] **Step 6: Commit**

```bash
git add features/settings/actions/setEntryTabOrder.ts features/settings/actions/setEntryTabOrder.test.ts features/settings/actions/index.ts
git commit -m "feat(settings): setEntryTabOrderAction"
```

---

### Task 7: Make `TransactionEntry` order-driven

**Files:**
- Modify: `features/transactions/entry/TransactionEntry.tsx`
- Test: `features/transactions/entry/TransactionEntry.test.tsx`

**Interfaces:**
- Consumes: `TabId`, `normalizeTabOrder` (Task 1).
- Produces: `TransactionEntryProps.tabOrder?: TabId[]` — when omitted, the shell uses `DEFAULT_TAB_ORDER` via `normalizeTabOrder(undefined)`. The TabBar renders tabs in this order; the default `active` tab is the first ordered tab (still falling back to `'form'` in edit mode when `detectType(draft)` is null).

- [ ] **Step 1: Write the failing test**

Append to `features/transactions/entry/TransactionEntry.test.tsx` (inside the existing `describe('TransactionEntry', ...)`), reusing the file's `html`/`common` helpers:

```ts
  it('renders tabs in a custom order with the first tab active', () => {
    const out = html(<TransactionEntry {...common} tabOrder={['raw', 'form', 'types']} />);
    // The first ordered tab (Raw) is the selected one.
    const rawIdx = out.indexOf('Raw');
    const formIdx = out.indexOf('Form');
    const typesIdx = out.indexOf('Types');
    expect(rawIdx).toBeGreaterThan(-1);
    expect(rawIdx).toBeLessThan(formIdx);
    expect(formIdx).toBeLessThan(typesIdx);
    // Raw is the active tab → its RawLens textarea renders.
    expect(out).toContain('<textarea');
  });

  it('defaults to the first tab order entry when tabOrder is omitted', () => {
    const out = html(<TransactionEntry {...common} />);
    const typesIdx = out.indexOf('Types');
    const formIdx = out.indexOf('Form');
    const rawIdx = out.indexOf('Raw');
    expect(typesIdx).toBeLessThan(formIdx);
    expect(formIdx).toBeLessThan(rawIdx);
  });
```

(The first assertion relies on `RawLens` rendering a `<textarea>` when Raw is the active tab. If that selector ever changes, assert on a stable Raw-only marker instead.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test features/transactions/entry/TransactionEntry.test.tsx -t "custom order"`
Expected: FAIL — `tabOrder` is not a known prop and the shell still hardcodes Types-first, so Raw is not active (no `<textarea>` in output).

- [ ] **Step 3: Write minimal implementation**

In `features/transactions/entry/TransactionEntry.tsx`:

3a. Add the import (with the other `@/lib` imports):

```ts
import {
  type TabId,
  normalizeTabOrder,
} from '@/lib/transactions/entryTabs';
```

3b. Replace the module-level `TABS` constant:

```ts
const TABS = [
  { id: 'types', label: 'Types' },
  { id: 'form', label: 'Form' },
  { id: 'raw', label: 'Raw' },
];
```

with a label map:

```ts
const TAB_LABELS: Record<TabId, string> = {
  types: 'Types',
  form: 'Form',
  raw: 'Raw',
};
```

3c. Add `tabOrder` to `TransactionEntryProps` (after `getAccountBalance`):

```ts
  getAccountBalance?: (account: string, currency: string) => Promise<string>;
  tabOrder?: TabId[];
```

3d. Destructure `tabOrder` in the component parameter list (after `getAccountBalance`):

```ts
  getAccountBalance,
  tabOrder,
}: TransactionEntryProps) => {
```

3e. Compute the ordered tabs and first tab. Just above the `const [active, setActive] = ...` line, insert:

```ts
  const orderedTabs = normalizeTabOrder(tabOrder);
  const tabs = orderedTabs.map((id) => ({ id, label: TAB_LABELS[id] }));
```

3f. Change the default `active` to use the first ordered tab instead of the literal `'types'`:

```ts
  const [active, setActive] = useState(() =>
    mode === 'edit' && !detectType(draft) ? 'form' : orderedTabs[0]
  );
```

3g. Update the `TabBar` usage to pass the computed `tabs`:

```tsx
          <TabBar tabs={tabs} active={active} onSelect={setActive} />
```

- [ ] **Step 4: Run the full shell test file to verify it passes**

Run: `pnpm test features/transactions/entry/TransactionEntry.test.tsx`
Expected: PASS — new ordering cases plus all existing cases (Form/Raw registration, edit-mode fallback, etc.).

- [ ] **Step 5: Commit**

```bash
git add features/transactions/entry/TransactionEntry.tsx features/transactions/entry/TransactionEntry.test.tsx
git commit -m "feat(transactions): make entry tab order prop-driven"
```

---

### Task 8: Wire the persisted order into New/Edit transaction pages

**Files:**
- Modify: `features/transactions/NewTransaction.tsx`
- Modify: `features/transactions/EditTransaction.tsx`

**Interfaces:**
- Consumes: `getEntryTabOrder` (Task 5), `TransactionEntryProps.tabOrder` (Task 7).
- Produces: both server components fetch the user's order and pass `tabOrder` to `TransactionEntry`.

- [ ] **Step 1: Wire `NewTransaction`**

In `features/transactions/NewTransaction.tsx`:

1a. Extend the settings import:

```ts
import { getBaseCurrency, getEntryTabOrder } from '@/lib/settings';
```

1b. Fetch the order alongside the existing reads. Replace:

```ts
  const defaultCurrency = await getBaseCurrency();
```

with:

```ts
  const [defaultCurrency, tabOrder] = await Promise.all([
    getBaseCurrency(),
    getEntryTabOrder(),
  ]);
```

1c. Pass the prop to `TransactionEntry` (add after `defaultCurrency={defaultCurrency}`):

```tsx
        defaultCurrency={defaultCurrency}
        tabOrder={tabOrder}
```

- [ ] **Step 2: Wire `EditTransaction`**

In `features/transactions/EditTransaction.tsx`:

2a. Extend the settings import:

```ts
import { getBaseCurrency, getEntryTabOrder } from '@/lib/settings';
```

2b. Replace:

```ts
  const defaultCurrency = await getBaseCurrency();
```

with:

```ts
  const [defaultCurrency, tabOrder] = await Promise.all([
    getBaseCurrency(),
    getEntryTabOrder(),
  ]);
```

2c. Pass the prop to `TransactionEntry` (add after `defaultCurrency={defaultCurrency}`):

```tsx
        defaultCurrency={defaultCurrency}
        tabOrder={tabOrder}
```

- [ ] **Step 3: Verify the suite is still green**

Run: `pnpm test features/transactions`
Expected: PASS (these are async server components without dedicated render tests; this confirms no transitive breakage). Then `pnpm lint` for the two edited files.

- [ ] **Step 4: Commit**

```bash
git add features/transactions/NewTransaction.tsx features/transactions/EditTransaction.tsx
git commit -m "feat(transactions): pass persisted tab order into entry shell"
```

---

### Task 9: `EntryTabOrderForm` reorder UI

**Files:**
- Create: `features/settings/EntryTabOrderForm.tsx`
- Create: `features/settings/EntryTabOrderForm.test.tsx`

**Interfaces:**
- Consumes: `setEntryTabOrderAction` (Task 6), `TabId` (Task 1), shadcn `Button`, `sonner` `toast`.
- Produces: `EntryTabOrderForm` (default export) — props `{ initial: TabId[] }`. Renders the three tabs as an ordered list with per-row up/down buttons (the first row labeled "Default") and a Save button enabled only when the order differs from `initial`.

- [ ] **Step 1: Write the failing test**

Create `features/settings/EntryTabOrderForm.test.tsx`:

```ts
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';
import EntryTabOrderForm from './EntryTabOrderForm';

vi.mock('@/features/settings/actions', () => ({
  setEntryTabOrderAction: vi.fn(),
}));

const html = (node: React.ReactNode) => renderToStaticMarkup(node);

describe('EntryTabOrderForm', () => {
  it('renders the three tab labels in the given order', () => {
    const out = html(<EntryTabOrderForm initial={['raw', 'types', 'form']} />);
    const rawIdx = out.indexOf('Raw');
    const typesIdx = out.indexOf('Types');
    const formIdx = out.indexOf('Form');
    expect(rawIdx).toBeGreaterThan(-1);
    expect(rawIdx).toBeLessThan(typesIdx);
    expect(typesIdx).toBeLessThan(formIdx);
  });

  it('marks the first tab as the default and exposes move controls', () => {
    const out = html(<EntryTabOrderForm initial={['types', 'form', 'raw']} />);
    expect(out).toContain('Default');
    expect(out).toContain('Move Types up');
    expect(out).toContain('Move Raw down');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test features/settings/EntryTabOrderForm.test.tsx`
Expected: FAIL — cannot resolve `./EntryTabOrderForm`.

- [ ] **Step 3: Write minimal implementation**

Create `features/settings/EntryTabOrderForm.tsx`:

```tsx
'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { setEntryTabOrderAction } from '@/features/settings/actions';
import { type TabId } from '@/lib/transactions/entryTabs';

const LABELS: Record<TabId, string> = {
  types: 'Types',
  form: 'Form',
  raw: 'Raw',
};

type Props = { initial: TabId[] };

const move = (arr: TabId[], from: number, to: number): TabId[] => {
  if (to < 0 || to >= arr.length) return arr;
  const next = [...arr];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
};

const EntryTabOrderForm = ({ initial }: Props) => {
  const [order, setOrder] = useState<TabId[]>(initial);
  const [pending, startTransition] = useTransition();
  const dirty = order.join(',') !== initial.join(',');

  const onSave = () => {
    startTransition(async () => {
      const result = await setEntryTabOrderAction(order);
      if (result.ok) toast.success('Tab order saved');
      else toast.error(result.message);
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <ol className="flex flex-col gap-2">
        {order.map((id, i) => (
          <li
            key={id}
            className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2"
          >
            <span className="text-sm font-medium">
              {LABELS[id]}
              {i === 0 && (
                <span className="ml-2 text-xs text-muted-foreground">
                  Default
                </span>
              )}
            </span>
            <div className="flex gap-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-label={`Move ${LABELS[id]} up`}
                disabled={i === 0}
                onClick={() => setOrder((o) => move(o, i, i - 1))}
              >
                ↑
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-label={`Move ${LABELS[id]} down`}
                disabled={i === order.length - 1}
                onClick={() => setOrder((o) => move(o, i, i + 1))}
              >
                ↓
              </Button>
            </div>
          </li>
        ))}
      </ol>
      <div>
        <Button onClick={onSave} disabled={pending || !dirty}>
          Save
        </Button>
      </div>
    </div>
  );
};

export default EntryTabOrderForm;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test features/settings/EntryTabOrderForm.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add features/settings/EntryTabOrderForm.tsx features/settings/EntryTabOrderForm.test.tsx
git commit -m "feat(settings): entry tab-order reorder UI"
```

---

### Task 10: Render the tab-order card in Settings

**Files:**
- Modify: `features/settings/Settings.tsx`
- Modify: `app/settings/page.tsx`
- Test: `features/settings/Settings.test.tsx` (create if absent)

**Interfaces:**
- Consumes: `EntryTabOrderForm` (Task 9); `parseEntryTabOrder`/`TabId` (Task 1); `Card`/`CardHeader`/`CardTitle`/`CardContent`.
- Produces: `Settings` gains an `entryTabOrder: TabId[]` prop and renders a "Transaction entry tabs" card. `app/settings/page.tsx` derives the order from the already-fetched `row` (no extra query) and passes it.

- [ ] **Step 1: Write the failing test**

Create `features/settings/Settings.test.tsx`:

```ts
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';
import Settings from './Settings';

// Settings pulls in client cards with server-action imports; stub the action
// barrel and child cards that aren't under test so the static render stays pure.
vi.mock('./actions', () => ({
  clearSessionBaseCurrencyAction: vi.fn(),
  setSavedBaseCurrencyAction: vi.fn(),
  setEntryTabOrderAction: vi.fn(),
}));

const html = (node: React.ReactNode) => renderToStaticMarkup(node);

const common = {
  base: 'USD',
  currencies: ['USD', 'EUR'],
  savedDefault: 'USD',
  envFallback: 'USD',
  encryptionEnabled: false,
  recentActivity: [],
};

describe('Settings', () => {
  it('renders the transaction-entry-tabs card with the given order', () => {
    const out = html(
      <Settings {...common} entryTabOrder={['raw', 'types', 'form']} />
    );
    expect(out).toContain('Transaction entry tabs');
    // The reorder list renders the three tab labels and a Default marker.
    expect(out).toContain('Default');
  });
});
```

(If `Settings.test.tsx` already exists, append the `describe` case and merge the `entryTabOrder` prop into its shared fixture instead of recreating the file.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test features/settings/Settings.test.tsx`
Expected: FAIL — `Settings` has no `entryTabOrder` prop / no "Transaction entry tabs" card.

- [ ] **Step 3: Implement the Settings card**

In `features/settings/Settings.tsx`:

3a. Add imports:

```ts
import EntryTabOrderForm from './EntryTabOrderForm';
import { type TabId } from '@/lib/transactions/entryTabs';
```

3b. Add the prop to the `Props` type (after `recentActivity`):

```ts
  recentActivity: AuditLog[];
  entryTabOrder: TabId[];
```

3c. Destructure it in the component signature (after `recentActivity`):

```ts
  recentActivity,
  entryTabOrder,
}: Props) => {
```

3d. Render a new card. Insert it directly after the closing `</Card>` of the Base-currency card and before `<SecuritySection ... />`:

```tsx
      <Card>
        <CardHeader>
          <CardTitle>Transaction entry tabs</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Reorder the tabs on the add/edit transaction screen. The top tab is
            the one that opens by default.
          </p>
          <EntryTabOrderForm initial={entryTabOrder} />
        </CardContent>
      </Card>
```

- [ ] **Step 4: Pass the prop from the page**

In `app/settings/page.tsx`:

4a. Extend the settings import to include the parser:

```ts
import { getAvailableCurrencies, userSettingRepository } from '@/lib/settings';
import { parseEntryTabOrder } from '@/lib/transactions/entryTabs';
```

4b. Pass the derived order to `<Settings>` (the page already awaits `row`; reuse it — no extra query). Add after `recentActivity={recentActivity}`:

```tsx
      recentActivity={recentActivity}
      entryTabOrder={parseEntryTabOrder(row?.entryTabOrder ?? null)}
```

- [ ] **Step 5: Run the Settings test + lint**

Run: `pnpm test features/settings/Settings.test.tsx`
Expected: PASS.
Run: `pnpm lint`
Expected: no new errors in the edited files.

- [ ] **Step 6: Commit**

```bash
git add features/settings/Settings.tsx features/settings/Settings.test.tsx app/settings/page.tsx
git commit -m "feat(settings): surface transaction entry tab-order card"
```

---

### Task 11: Full-suite verification

**Files:** none (verification only).

- [ ] **Step 1: Run the entire test suite**

Run: `pnpm test`
Expected: PASS — no regressions across settings, transactions/entry, and the rest of the suite.

- [ ] **Step 2: Lint the whole project**

Run: `pnpm lint`
Expected: clean.

- [ ] **Step 3: Manual pass (per repo convention for interactive shells)**

- Open **Settings** → "Transaction entry tabs": reorder (e.g. move Raw to the top), Save → success toast.
- Open **Add transaction**: the entry shell opens on the new first tab and the TabBar shows the chosen order.
- Open **Edit transaction** for a transaction whose type is detectable: confirm it still opens on the first ordered tab; for an undetectable draft, confirm it falls back to **Form**.
- Reset order to `Types · Form · Raw` and confirm the default restores.

- [ ] **Step 4: Final commit (if the manual pass surfaced no fixes)**

No code change expected; if the manual pass required tweaks, commit them with a focused message.

---

## Self-Review

**1. Spec coverage (roadmap Phase 5 scope):**
- "Persist an `entryTabOrder` preference … mirror how `getBaseCurrency()` is read/stored" → Tasks 2 (column), 3 (repo), 4 (service), 5 (cached reader), 6 (action). ✔
- "A small settings UI block to reorder the three tabs" → Tasks 9 (form) + 10 (card). ✔
- "The server component that renders `TransactionEntry` reads the preference and passes `tabOrder`/`defaultTab` props" → Task 7 (prop, default = first tab) + Task 8 (New/Edit wiring). The single `tabOrder` prop carries both order and default (first element), which is simpler than two props and matches "the first tab is the default." ✔
- "All three tabs remain always-present regardless of order" → guaranteed by `normalizeTabOrder` (Task 1), covered by its unit tests. ✔
- "Migration/default: users with no preference get `Types · Form · Raw`" → `DEFAULT_TAB_ORDER`; null column → default in `parseEntryTabOrder`/`getEntryTabOrder` (Tasks 1, 5). ✔
- "Keep ordering logic a pure helper (`orderTabs(order, allTabs)`) so it's unit-testable" → realized as `normalizeTabOrder(order)` over ids (Task 1), exhaustively tested. ✔
- Testing: settings persistence (repo Task 3 / service Task 4), `orderTabs` unit tests (Task 1), static smoke that the shell honors a custom order (Task 7). ✔

**2. Placeholder scan:** No `TBD`/"add validation"/"similar to" placeholders; every code step shows full code. ✔

**3. Type consistency:** `TabId`, `TAB_IDS`, `DEFAULT_TAB_ORDER`, `normalizeTabOrder`, `parseEntryTabOrder`, `serializeEntryTabOrder`, `entryTabOrderSchema` are defined once (Task 1) and referenced with identical names in Tasks 4, 5, 6, 7, 9, 10. `upsertEntryTabOrder` (Task 3) ↔ `saveEntryTabOrder` (Task 4) ↔ `setEntryTabOrderAction` (Task 6) ↔ `getEntryTabOrder` (Task 5) names are consistent across producers/consumers. `tabOrder` prop name matches between Task 7 (definition) and Task 8 (usage). ✔

## Carried cleanup

Both Phase-1 carry-over items (TabBar `aria-selected`/`role` assertions; homing `SubmitAction`) are already landed on `main` (commits `36e6eda`, `d016759`) and need no action here.
