# Saved Views Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the "Saved views" Phase 6 feature: let users save a filtered URL on six allowlisted pages, recall it from a Dashboard panel, rename or delete it inline.

**Architecture:** Mirror the existing `template` table + Repository + Service + one-action-per-file pattern. Single `savedView` SQLite table; URL-bookmark data model (one canonicalized `targetPath` string per row); no journal-cache interaction. Inline `SaveViewButton` mounts on the four filter surfaces (Filters, DateFilter, new RegisterHeader, new AccountHeader); `SavedViewsCard` server component renders above Recent transactions on Dashboard with per-row Rename / Delete.

**Tech Stack:** Next.js 16 app router · Drizzle ORM (`better-sqlite3`) · Zod · shadcn/ui (`Dialog`, `DropdownMenu`, `Alert`, `Button`) · Sonner · Vitest + `@testing-library/react` · ULID via `lib/journal/uid`.

**Spec:** `docs/superpowers/specs/2026-06-11-saved-views-design.md`

**Deviation from spec (intentional alignment with `templates` pattern):** the service `SaveResult` is `{ ok: true; view } | { ok: false; reason: 'name-conflict' }` — no `existingId` or `invalid-path` / `invalid-name` variants. Validation lives in the server action (`safeParse` + `fieldErrors`) exactly as `saveTemplateAction` does today. The overwrite flow uses `opts: { overwrite?: boolean }`, not `overwriteId`. Spec section 3 ("Save view dialog renders Replace button") still works — the dialog detects `name-conflict`, swaps in a Replace button, and retries the action with `overwrite: true`.

---

## File map

**New files:**

| Path | Responsibility |
| --- | --- |
| `db/schema/savedView.ts` | Drizzle table definition + `SavedView` inferred type |
| `lib/savedViews/schema.ts` | Zod schemas: name, targetPath (canonicalize + allowlist), input |
| `lib/savedViews/schema.test.ts` | Zod + canonicalizer unit tests |
| `lib/savedViews/repository.ts` | `SavedViewRepository` CRUD class |
| `lib/savedViews/repository.test.ts` | Repository tests against in-memory SQLite |
| `lib/savedViews/service.ts` | `SavedViewService` business logic (conflict handling) |
| `lib/savedViews/service.test.ts` | Service tests (conflict, overwrite, rename, delete) |
| `lib/savedViews/index.ts` | Module surface + singleton wiring |
| `features/savedViews/actions/saveSavedView.ts` | Server action: save / overwrite |
| `features/savedViews/actions/saveSavedView.test.ts` | Action test (mocked `requireUser`, `revalidatePath`) |
| `features/savedViews/actions/renameSavedView.ts` | Server action: rename |
| `features/savedViews/actions/renameSavedView.test.ts` | Action test |
| `features/savedViews/actions/deleteSavedView.ts` | Server action: delete |
| `features/savedViews/actions/deleteSavedView.test.ts` | Action test |
| `features/savedViews/routeLabel.ts` | Pathname → human label helper |
| `features/savedViews/routeLabel.test.ts` | Helper tests for each allowlisted route |
| `features/savedViews/SaveViewButton.tsx` | Inline "Save view" client component (button + dialog) |
| `features/savedViews/SaveViewButton.test.tsx` | RTL test for dialog open, conflict, replace, success |
| `features/savedViews/SaveViewRowActions.tsx` | Dashboard row rename/delete dropdown |
| `features/dashboard/SavedViewsCard.tsx` | Dashboard panel server component |
| `features/dashboard/SavedViewsCard.test.tsx` | RTL test for empty state + populated rows |
| `features/savedViews/integration.test.ts` | End-to-end: save → list → rename conflict → rename → delete |
| `features/registers/monthly/RegisterHeader.tsx` | New client header hosting title + SaveViewButton |
| `features/accounts/AccountHeader.tsx` | New client header hosting title + SaveViewButton |

**Modified files:**

| Path | Change |
| --- | --- |
| `db/schema/index.ts` | Re-export `savedView` |
| `components/DateFilter/DateFilter.tsx` | Accept optional `saveViewSlot?: ReactNode` and render it next to Apply |
| `features/transactions/Filters.tsx` | Mount `<SaveViewButton />` next to `ExportButton` |
| `app/transactions/page.tsx` | Pass `existingNames` into `Filters` |
| `features/transactions/Transactions.tsx` (or whichever file owns the `<Filters>` mount) | Same — propagate `existingNames` |
| `app/balance/page.tsx` and `app/balance/[from]/[to]/page.tsx` | Pass `saveViewSlot={<SaveViewButton …/>}` to `DateFilter` |
| `app/payees/[from]/[to]/page.tsx` | Same |
| `app/registers/monthly/[account]/page.tsx` | Replace inline header with `<RegisterHeader …/>` |
| `app/accounts/[account]/page.tsx` | Replace inline header with `<AccountHeader …/>` |
| `features/dashboard/Dashboard.tsx` | Mount `<SavedViewsCard userId={…} />` after Recent transactions |
| `PLAN.md` | Tick the Saved views entry in Phase 6 |

---

## Task 1: Drizzle schema and migration

**Files:**
- Create: `db/schema/savedView.ts`
- Modify: `db/schema/index.ts`

**Workflow note:** this project uses `pnpm db:push` (not generated migrations). Do NOT run `pnpm db:generate` — it would synthesize a fresh `0000_*.sql` baseline containing every table, which is unwanted churn. Schema changes are applied with `pnpm db:push` against a local dev DB.

- [ ] **Step 1: Add the schema file**

Create `db/schema/savedView.ts`:

```typescript
import { sql } from 'drizzle-orm';
import {
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { user } from './user';

export const savedView = sqliteTable(
  'savedView',
  {
    id: text('id').primaryKey(),
    userId: text('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    targetPath: text('targetPath').notNull(),
    createdAt: integer('createdAt', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer('updatedAt', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => ({
    uniqueNamePerUser: uniqueIndex('savedView_user_name').on(t.userId, t.name),
  })
);

export type SavedView = typeof savedView.$inferSelect;
```

- [ ] **Step 2: Export from the schema index**

Modify `db/schema/index.ts` — insert after the existing `template` export, keep alphabetical-ish ordering:

```typescript
export { savedView, type SavedView } from './savedView';
```

- [ ] **Step 3: Apply the schema to the local dev DB (optional)**

Run: `pnpm db:push` if you have a local dev DB and want to run the dev server. Skip if you're only running tests — `lib/test-utils/db.ts` seeds tables by hand.

- [ ] **Step 4: Type-check**

Run: `pnpm type-check`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add db/schema/savedView.ts db/schema/index.ts
git commit -m "feat(saved-views): savedView table schema"
```

---

## Task 2: Zod schema and `targetPath` canonicalizer

**Files:**
- Create: `lib/savedViews/schema.ts`
- Test: `lib/savedViews/schema.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/savedViews/schema.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import {
  canonicalizeTargetPath,
  savedViewInputSchema,
  savedViewNameSchema,
} from './schema';

describe('savedViewNameSchema', () => {
  it('trims and accepts a normal name', () => {
    expect(savedViewNameSchema.parse('  Food spending  ')).toBe(
      'Food spending'
    );
  });

  it('rejects empty / whitespace-only', () => {
    expect(savedViewNameSchema.safeParse('').success).toBe(false);
    expect(savedViewNameSchema.safeParse('    ').success).toBe(false);
  });

  it('rejects names longer than 80 chars', () => {
    expect(savedViewNameSchema.safeParse('x'.repeat(81)).success).toBe(false);
    expect(savedViewNameSchema.safeParse('x'.repeat(80)).success).toBe(true);
  });

  it('rejects control characters', () => {
    expect(savedViewNameSchema.safeParse('badname').success).toBe(false);
    expect(savedViewNameSchema.safeParse('tab\tname').success).toBe(false);
  });
});

describe('canonicalizeTargetPath', () => {
  it('accepts each allowlisted route', () => {
    expect(canonicalizeTargetPath('/transactions')).toBe('/transactions');
    expect(
      canonicalizeTargetPath('/transactions?account=Expenses%3AFood')
    ).toBe('/transactions?account=Expenses%3AFood');
    expect(canonicalizeTargetPath('/balance')).toBe('/balance');
    expect(canonicalizeTargetPath('/balance/2026-01-01/2026-03-31')).toBe(
      '/balance/2026-01-01/2026-03-31'
    );
    expect(canonicalizeTargetPath('/payees/2026-01-01/2026-03-31')).toBe(
      '/payees/2026-01-01/2026-03-31'
    );
    expect(canonicalizeTargetPath('/registers/monthly/Expenses:Food')).toBe(
      '/registers/monthly/Expenses:Food'
    );
    expect(canonicalizeTargetPath('/accounts/Assets:Cash')).toBe(
      '/accounts/Assets:Cash'
    );
  });

  it('drops a fragment', () => {
    expect(canonicalizeTargetPath('/transactions?a=1#foo')).toBe(
      '/transactions?a=1'
    );
  });

  it('preserves search-param order', () => {
    expect(canonicalizeTargetPath('/transactions?b=2&a=1')).toBe(
      '/transactions?b=2&a=1'
    );
  });

  it('rejects external URLs', () => {
    expect(() => canonicalizeTargetPath('https://evil.example/x')).toThrow();
    expect(() => canonicalizeTargetPath('//evil/x')).toThrow();
  });

  it('rejects path traversal attempts', () => {
    expect(() => canonicalizeTargetPath('/transactions/../../etc')).toThrow();
    expect(() => canonicalizeTargetPath('/accounts/..%2Fetc')).toThrow();
  });

  it('rejects routes outside the allowlist', () => {
    expect(() => canonicalizeTargetPath('/api/upload')).toThrow();
    expect(() => canonicalizeTargetPath('/portfolio')).toThrow();
    expect(() => canonicalizeTargetPath('/settings')).toThrow();
  });

  it('rejects path > 2000 chars', () => {
    expect(() =>
      canonicalizeTargetPath('/transactions?q=' + 'x'.repeat(2000))
    ).toThrow();
  });

  it('rejects /balance/:from/:to when dates are not ISO', () => {
    expect(() => canonicalizeTargetPath('/balance/foo/bar')).toThrow();
    expect(() =>
      canonicalizeTargetPath('/balance/2026-01-01/not-a-date')
    ).toThrow();
  });
});

describe('savedViewInputSchema', () => {
  it('returns a parsed object with canonical targetPath', () => {
    const parsed = savedViewInputSchema.parse({
      name: '  Food  ',
      targetPath: '/transactions?account=Expenses:Food#x',
    });
    expect(parsed.name).toBe('Food');
    expect(parsed.targetPath).toBe('/transactions?account=Expenses:Food');
  });

  it('rejects invalid name', () => {
    expect(
      savedViewInputSchema.safeParse({
        name: '',
        targetPath: '/transactions',
      }).success
    ).toBe(false);
  });

  it('rejects invalid targetPath', () => {
    expect(
      savedViewInputSchema.safeParse({
        name: 'x',
        targetPath: '/api/upload',
      }).success
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `pnpm exec vitest run lib/savedViews/schema.test.ts`
Expected: FAIL with "Cannot find module './schema'".

- [ ] **Step 3: Implement the schema**

Create `lib/savedViews/schema.ts`:

```typescript
import { z } from 'zod';

const NAME_MAX = 80;
const PATH_MAX = 2000;

export const savedViewNameSchema = z
  .string()
  .trim()
  .min(1, 'Name is required')
  .max(NAME_MAX, 'Name is too long')
  .refine((v) => !/[\x00-\x1F]/.test(v), 'Name contains control characters');

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ACCOUNT_SEGMENT = /^[A-Za-z0-9:_\- ]+$/;

const matchesAllowlist = (pathname: string): boolean => {
  if (pathname === '/transactions') return true;
  if (pathname === '/balance') return true;
  const balanceRange = pathname.match(
    /^\/balance\/(\d{4}-\d{2}-\d{2})\/(\d{4}-\d{2}-\d{2})$/
  );
  if (balanceRange) return ISO_DATE.test(balanceRange[1]) && ISO_DATE.test(balanceRange[2]);
  const payeeRange = pathname.match(
    /^\/payees\/(\d{4}-\d{2}-\d{2})\/(\d{4}-\d{2}-\d{2})$/
  );
  if (payeeRange) return ISO_DATE.test(payeeRange[1]) && ISO_DATE.test(payeeRange[2]);
  const register = pathname.match(/^\/registers\/monthly\/(.+)$/);
  if (register) return ACCOUNT_SEGMENT.test(decodeURIComponent(register[1]));
  const account = pathname.match(/^\/accounts\/(.+)$/);
  if (account) return ACCOUNT_SEGMENT.test(decodeURIComponent(account[1]));
  return false;
};

const hasTraversalSegment = (pathname: string): boolean =>
  pathname
    .split('/')
    .some((seg) => seg === '..' || /%2e%2e/i.test(seg) || /%2f/i.test(seg));

export const canonicalizeTargetPath = (raw: string): string => {
  if (typeof raw !== 'string' || raw.length === 0) {
    throw new Error('targetPath is required');
  }
  if (raw.length > PATH_MAX) {
    throw new Error('targetPath is too long');
  }
  if (!raw.startsWith('/') || raw.startsWith('//')) {
    throw new Error('targetPath must be a same-origin path');
  }
  if (raw.includes('://')) {
    throw new Error('targetPath must not contain a scheme');
  }

  let url: URL;
  try {
    url = new URL(raw, 'http://x');
  } catch {
    throw new Error('targetPath is not a valid path');
  }

  if (hasTraversalSegment(url.pathname)) {
    throw new Error('targetPath contains a traversal segment');
  }
  if (!matchesAllowlist(url.pathname)) {
    throw new Error('targetPath is not an allowlisted route');
  }

  const canonical = url.pathname + url.search;
  if (canonical.length > PATH_MAX) {
    throw new Error('targetPath is too long');
  }
  return canonical;
};

export const savedViewTargetPathSchema = z
  .string()
  .transform((raw, ctx) => {
    try {
      return canonicalizeTargetPath(raw);
    } catch (e) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: e instanceof Error ? e.message : 'Invalid targetPath',
      });
      return z.NEVER;
    }
  });

export const savedViewInputSchema = z.object({
  name: savedViewNameSchema,
  targetPath: savedViewTargetPathSchema,
});

export type SavedViewInput = z.infer<typeof savedViewInputSchema>;
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `pnpm exec vitest run lib/savedViews/schema.test.ts`
Expected: PASS, all assertions green.

- [ ] **Step 5: Commit**

```bash
git add lib/savedViews/schema.ts lib/savedViews/schema.test.ts
git commit -m "feat(saved-views): zod schema with canonicalized targetPath"
```

---

## Task 3: Repository

**Files:**
- Create: `lib/savedViews/repository.ts`
- Test: `lib/savedViews/repository.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/savedViews/repository.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '@/db/schema';
import {
  setupTestDb,
  teardownTestDb,
  type TestDbContext,
} from '@/lib/test-utils/db';
import { SavedViewRepository } from './repository';
import type { SavedViewInput } from './schema';

const SAVED_VIEW_TABLE = `
  CREATE TABLE IF NOT EXISTS "savedView" (
    "id" text PRIMARY KEY NOT NULL,
    "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
    "name" text NOT NULL,
    "targetPath" text NOT NULL,
    "createdAt" integer NOT NULL DEFAULT (unixepoch()),
    "updatedAt" integer NOT NULL DEFAULT (unixepoch())
  );
  CREATE UNIQUE INDEX IF NOT EXISTS "savedView_user_name"
    ON "savedView"("userId", "name");
`;

const sample: SavedViewInput = {
  name: 'Food',
  targetPath: '/transactions?account=Expenses:Food',
};

describe('SavedViewRepository', () => {
  let ctx: TestDbContext;
  let repo: SavedViewRepository;

  beforeEach(async () => {
    ctx = await setupTestDb('saved-views-');
    ctx.sqlite.exec(SAVED_VIEW_TABLE);
    ctx.sqlite
      .prepare(`INSERT INTO "user" ("id","name","email") VALUES (?,?,?)`)
      .run('alice', 'Alice', 'alice@example.com');
    ctx.sqlite
      .prepare(`INSERT INTO "user" ("id","name","email") VALUES (?,?,?)`)
      .run('bob', 'Bob', 'bob@example.com');
    repo = new SavedViewRepository(drizzle(ctx.sqlite, { schema }));
  });

  afterEach(async () => {
    await teardownTestDb(ctx);
  });

  it('create returns a row with a ULID id', async () => {
    const row = await repo.create('alice', sample);
    expect(row.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(row.name).toBe('Food');
    expect(row.targetPath).toBe('/transactions?account=Expenses:Food');
    expect(row.userId).toBe('alice');
  });

  it('create throws on UNIQUE (userId, name) conflict', async () => {
    await repo.create('alice', sample);
    await expect(repo.create('alice', sample)).rejects.toThrow(
      /UNIQUE constraint failed/i
    );
  });

  it('create succeeds for the same name owned by a different user', async () => {
    await repo.create('alice', sample);
    const bobRow = await repo.create('bob', sample);
    expect(bobRow.userId).toBe('bob');
  });

  it('find returns the row by id for the user', async () => {
    const created = await repo.create('alice', sample);
    const fetched = await repo.find('alice', created.id);
    expect(fetched?.id).toBe(created.id);
  });

  it('find returns null for another user', async () => {
    const created = await repo.create('alice', sample);
    expect(await repo.find('bob', created.id)).toBeNull();
  });

  it('findByName is case-sensitive and user-scoped', async () => {
    await repo.create('alice', sample);
    expect((await repo.findByName('alice', 'Food'))?.name).toBe('Food');
    expect(await repo.findByName('alice', 'food')).toBeNull();
    expect(await repo.findByName('bob', 'Food')).toBeNull();
  });

  it('list orders by lower(name)', async () => {
    await repo.create('alice', { name: 'Zeta', targetPath: '/transactions' });
    await repo.create('alice', { name: 'alpha', targetPath: '/balance' });
    await repo.create('alice', { name: 'Mango', targetPath: '/payees/2026-01-01/2026-03-31' });
    const names = (await repo.list('alice')).map((v) => v.name);
    expect(names).toEqual(['alpha', 'Mango', 'Zeta']);
  });

  it('list returns only the requested user rows', async () => {
    await repo.create('alice', sample);
    await repo.create('bob', { name: 'Bobs', targetPath: '/transactions' });
    expect((await repo.list('alice')).map((v) => v.name)).toEqual(['Food']);
  });

  it('update patches name and bumps updatedAt', async () => {
    const created = await repo.create('alice', sample);
    const before = created.updatedAt.getTime();
    await new Promise((r) => setTimeout(r, 1100)); // unixepoch() = whole seconds
    const updated = await repo.update('alice', created.id, { name: 'Groceries' });
    expect(updated?.name).toBe('Groceries');
    expect(updated?.updatedAt.getTime()).toBeGreaterThan(before);
  });

  it('update returns null when id does not belong to user', async () => {
    const created = await repo.create('alice', sample);
    expect(await repo.update('bob', created.id, { name: 'X' })).toBeNull();
  });

  it('update throws on UNIQUE conflict when renaming', async () => {
    await repo.create('alice', sample);
    const second = await repo.create('alice', {
      name: 'Other',
      targetPath: '/balance',
    });
    await expect(
      repo.update('alice', second.id, { name: 'Food' })
    ).rejects.toThrow(/UNIQUE constraint failed/i);
  });

  it('delete returns true then false for the same id', async () => {
    const created = await repo.create('alice', sample);
    expect(await repo.delete('alice', created.id)).toBe(true);
    expect(await repo.delete('alice', created.id)).toBe(false);
  });

  it('cascades when the parent user is deleted', async () => {
    await repo.create('alice', sample);
    ctx.sqlite.prepare('DELETE FROM "user" WHERE id = ?').run('alice');
    expect(await repo.list('alice')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `pnpm exec vitest run lib/savedViews/repository.test.ts`
Expected: FAIL with "Cannot find module './repository'".

- [ ] **Step 3: Implement the repository**

Create `lib/savedViews/repository.ts`:

```typescript
import { and, eq, sql } from 'drizzle-orm';
import { savedView, type SavedView } from '@/db/schema/savedView';
import type { DbInstance } from '@/lib/db/connection';
import { generateUid } from '@/lib/journal/uid';
import type { SavedViewInput } from './schema';

export type SavedViewPatch = Partial<{ name: string; targetPath: string }>;

export class SavedViewRepository {
  constructor(private readonly db: DbInstance) {}

  async find(userId: string, id: string): Promise<SavedView | null> {
    const row = this.db
      .select()
      .from(savedView)
      .where(and(eq(savedView.userId, userId), eq(savedView.id, id)))
      .get();
    return row ?? null;
  }

  async findByName(userId: string, name: string): Promise<SavedView | null> {
    const row = this.db
      .select()
      .from(savedView)
      .where(and(eq(savedView.userId, userId), eq(savedView.name, name)))
      .get();
    return row ?? null;
  }

  async list(userId: string): Promise<SavedView[]> {
    return this.db
      .select()
      .from(savedView)
      .where(eq(savedView.userId, userId))
      .orderBy(sql`lower(${savedView.name})`)
      .all();
  }

  /** Inserts a new row. Throws on UNIQUE (userId, name) conflict. */
  async create(userId: string, input: SavedViewInput): Promise<SavedView> {
    return this.db
      .insert(savedView)
      .values({
        id: generateUid(),
        userId,
        name: input.name,
        targetPath: input.targetPath,
      })
      .returning()
      .get();
  }

  /** Returns null if no row matches; throws on UNIQUE rename conflict. */
  async update(
    userId: string,
    id: string,
    patch: SavedViewPatch
  ): Promise<SavedView | null> {
    const updates: SavedViewPatch & { updatedAt: Date } = {
      updatedAt: new Date(),
    };
    if (patch.name !== undefined) updates.name = patch.name;
    if (patch.targetPath !== undefined) updates.targetPath = patch.targetPath;
    const row = this.db
      .update(savedView)
      .set(updates)
      .where(and(eq(savedView.userId, userId), eq(savedView.id, id)))
      .returning()
      .get();
    return row ?? null;
  }

  async delete(userId: string, id: string): Promise<boolean> {
    const row = this.db
      .delete(savedView)
      .where(and(eq(savedView.userId, userId), eq(savedView.id, id)))
      .returning({ id: savedView.id })
      .get();
    return !!row;
  }
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `pnpm exec vitest run lib/savedViews/repository.test.ts`
Expected: PASS, all assertions green.

- [ ] **Step 5: Commit**

```bash
git add lib/savedViews/repository.ts lib/savedViews/repository.test.ts
git commit -m "feat(saved-views): repository with UNIQUE conflict semantics"
```

---

## Task 4: Service

**Files:**
- Create: `lib/savedViews/service.ts`
- Test: `lib/savedViews/service.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/savedViews/service.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '@/db/schema';
import {
  setupTestDb,
  teardownTestDb,
  type TestDbContext,
} from '@/lib/test-utils/db';
import { SavedViewRepository } from './repository';
import { SavedViewService } from './service';

const SAVED_VIEW_TABLE = `
  CREATE TABLE IF NOT EXISTS "savedView" (
    "id" text PRIMARY KEY NOT NULL,
    "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
    "name" text NOT NULL,
    "targetPath" text NOT NULL,
    "createdAt" integer NOT NULL DEFAULT (unixepoch()),
    "updatedAt" integer NOT NULL DEFAULT (unixepoch())
  );
  CREATE UNIQUE INDEX IF NOT EXISTS "savedView_user_name"
    ON "savedView"("userId", "name");
`;

describe('SavedViewService', () => {
  let ctx: TestDbContext;
  let service: SavedViewService;

  beforeEach(async () => {
    ctx = await setupTestDb('saved-views-svc-');
    ctx.sqlite.exec(SAVED_VIEW_TABLE);
    ctx.sqlite
      .prepare(`INSERT INTO "user" ("id","name","email") VALUES (?,?,?)`)
      .run('alice', 'Alice', 'alice@example.com');
    const repo = new SavedViewRepository(drizzle(ctx.sqlite, { schema }));
    service = new SavedViewService(repo);
  });

  afterEach(async () => {
    await teardownTestDb(ctx);
  });

  it('saveOrOverwrite happy path returns ok:true', async () => {
    const result = await service.saveOrOverwrite('alice', {
      name: 'Food',
      targetPath: '/transactions?account=Expenses:Food',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.view.name).toBe('Food');
    }
  });

  it('saveOrOverwrite returns name-conflict on duplicate name', async () => {
    await service.saveOrOverwrite('alice', {
      name: 'Food',
      targetPath: '/transactions',
    });
    const result = await service.saveOrOverwrite('alice', {
      name: 'Food',
      targetPath: '/balance',
    });
    expect(result).toEqual({ ok: false, reason: 'name-conflict' });
  });

  it('saveOrOverwrite with overwrite:true replaces the existing row', async () => {
    const first = await service.saveOrOverwrite('alice', {
      name: 'Food',
      targetPath: '/transactions',
    });
    if (!first.ok) throw new Error('precondition failed');
    const firstId = first.view.id;
    const firstCreatedAt = first.view.createdAt.getTime();
    await new Promise((r) => setTimeout(r, 1100));

    const result = await service.saveOrOverwrite(
      'alice',
      { name: 'Food', targetPath: '/balance' },
      { overwrite: true }
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.view.id).toBe(firstId);
      expect(result.view.createdAt.getTime()).toBe(firstCreatedAt);
      expect(result.view.targetPath).toBe('/balance');
      expect(result.view.updatedAt.getTime()).toBeGreaterThan(firstCreatedAt);
    }
  });

  it('rename happy path', async () => {
    const saved = await service.saveOrOverwrite('alice', {
      name: 'Food',
      targetPath: '/transactions',
    });
    if (!saved.ok) throw new Error('precondition failed');
    const result = await service.rename('alice', saved.view.id, 'Groceries');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.view.name).toBe('Groceries');
  });

  it('rename returns name-conflict when target name exists', async () => {
    await service.saveOrOverwrite('alice', { name: 'A', targetPath: '/balance' });
    const b = await service.saveOrOverwrite('alice', {
      name: 'B',
      targetPath: '/transactions',
    });
    if (!b.ok) throw new Error('precondition failed');
    expect(await service.rename('alice', b.view.id, 'A')).toEqual({
      ok: false,
      reason: 'name-conflict',
    });
  });

  it('rename returns not-found for unknown id', async () => {
    expect(await service.rename('alice', 'nope', 'X')).toEqual({
      ok: false,
      reason: 'not-found',
    });
  });

  it('delete is a silent no-op for unknown id', async () => {
    await expect(service.delete('alice', 'nope')).resolves.toBeUndefined();
  });

  it('delete removes the row', async () => {
    const saved = await service.saveOrOverwrite('alice', {
      name: 'Food',
      targetPath: '/transactions',
    });
    if (!saved.ok) throw new Error('precondition failed');
    await service.delete('alice', saved.view.id);
    expect(await service.list('alice')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `pnpm exec vitest run lib/savedViews/service.test.ts`
Expected: FAIL with "Cannot find module './service'".

- [ ] **Step 3: Implement the service**

Create `lib/savedViews/service.ts`:

```typescript
import type { SavedView } from '@/db/schema/savedView';
import type { SavedViewRepository } from './repository';
import type { SavedViewInput } from './schema';

export type SaveResult =
  | { ok: true; view: SavedView }
  | { ok: false; reason: 'name-conflict' };

export type RenameResult =
  | { ok: true; view: SavedView }
  | { ok: false; reason: 'name-conflict' | 'not-found' };

const isUniqueConflict = (e: unknown): boolean =>
  e instanceof Error && /UNIQUE constraint failed/i.test(e.message);

export class SavedViewService {
  constructor(private readonly repo: SavedViewRepository) {}

  list(userId: string): Promise<SavedView[]> {
    return this.repo.list(userId);
  }

  /**
   * Create a new saved view. If a row with the same name exists, return
   * `name-conflict` unless `overwrite` is true — in which case the existing
   * row is updated in place (same id and createdAt, new targetPath, bumped
   * updatedAt).
   */
  async saveOrOverwrite(
    userId: string,
    input: SavedViewInput,
    opts: { overwrite?: boolean } = {}
  ): Promise<SaveResult> {
    const existing = await this.repo.findByName(userId, input.name);
    if (existing) {
      if (!opts.overwrite) return { ok: false, reason: 'name-conflict' };
      const updated = await this.repo.update(userId, existing.id, {
        targetPath: input.targetPath,
      });
      if (!updated) return { ok: false, reason: 'name-conflict' };
      return { ok: true, view: updated };
    }
    try {
      const created = await this.repo.create(userId, input);
      return { ok: true, view: created };
    } catch (e) {
      if (isUniqueConflict(e)) return { ok: false, reason: 'name-conflict' };
      throw e;
    }
  }

  async rename(
    userId: string,
    id: string,
    name: string
  ): Promise<RenameResult> {
    const owned = await this.repo.find(userId, id);
    if (!owned) return { ok: false, reason: 'not-found' };
    try {
      const updated = await this.repo.update(userId, id, { name });
      if (!updated) return { ok: false, reason: 'not-found' };
      return { ok: true, view: updated };
    } catch (e) {
      if (isUniqueConflict(e)) return { ok: false, reason: 'name-conflict' };
      throw e;
    }
  }

  async delete(userId: string, id: string): Promise<void> {
    await this.repo.delete(userId, id);
  }
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `pnpm exec vitest run lib/savedViews/service.test.ts`
Expected: PASS, all assertions green.

- [ ] **Step 5: Commit**

```bash
git add lib/savedViews/service.ts lib/savedViews/service.test.ts
git commit -m "feat(saved-views): service with saveOrOverwrite + rename + delete"
```

---

## Task 5: Module surface

**Files:**
- Create: `lib/savedViews/index.ts`

- [ ] **Step 1: Write the module surface**

Create `lib/savedViews/index.ts`:

```typescript
import { db } from '@/lib/db';
import { SavedViewRepository } from './repository';
import { SavedViewService } from './service';

export const savedViewRepository = new SavedViewRepository(db);
export const savedViewService = new SavedViewService(savedViewRepository);

export { SavedViewRepository } from './repository';
export { SavedViewService } from './service';
export type { SavedViewPatch } from './repository';
export type { SaveResult, RenameResult } from './service';
export type { SavedViewInput } from './schema';
export {
  savedViewInputSchema,
  savedViewNameSchema,
  savedViewTargetPathSchema,
  canonicalizeTargetPath,
} from './schema';
```

- [ ] **Step 2: Type-check**

Run: `pnpm type-check`
Expected: no errors. If the build fails because `@/lib/db` exports a different name, mirror what `lib/templates/index.ts` imports.

- [ ] **Step 3: Commit**

```bash
git add lib/savedViews/index.ts
git commit -m "feat(saved-views): module surface with singleton + types"
```

---

## Task 6: Save server action

**Files:**
- Create: `features/savedViews/actions/saveSavedView.ts`
- Test: `features/savedViews/actions/saveSavedView.test.ts`

- [ ] **Step 1: Write the failing test**

Create `features/savedViews/actions/saveSavedView.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth/require-user', () => ({
  requireUser: vi.fn(),
}));
vi.mock('@/lib/savedViews', async () => {
  const actual = await vi.importActual<typeof import('@/lib/savedViews')>(
    '@/lib/savedViews'
  );
  return {
    ...actual,
    savedViewService: {
      saveOrOverwrite: vi.fn(),
    },
  };
});
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/require-user';
import { savedViewService } from '@/lib/savedViews';
import { saveSavedViewAction } from './saveSavedView';

describe('saveSavedViewAction', () => {
  beforeEach(() => {
    vi.mocked(requireUser).mockResolvedValue({ id: 'alice' } as never);
    vi.mocked(revalidatePath).mockClear();
    vi.mocked(savedViewService.saveOrOverwrite).mockReset();
  });

  it('returns ok:true and revalidates on success', async () => {
    vi.mocked(savedViewService.saveOrOverwrite).mockResolvedValue({
      ok: true,
      view: {
        id: 'V1',
        userId: 'alice',
        name: 'Food',
        targetPath: '/transactions',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    const result = await saveSavedViewAction({
      name: 'Food',
      targetPath: '/transactions',
    });
    expect(result).toEqual({ ok: true, viewId: 'V1' });
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout');
  });

  it('returns invalid with fieldErrors when input fails zod', async () => {
    const result = await saveSavedViewAction({
      name: '',
      targetPath: '/api/upload',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('invalid');
      expect(result.fieldErrors).toBeDefined();
      expect(Object.keys(result.fieldErrors ?? {})).toContain('name');
      expect(Object.keys(result.fieldErrors ?? {})).toContain('targetPath');
    }
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(savedViewService.saveOrOverwrite).not.toHaveBeenCalled();
  });

  it('forwards name-conflict and does not revalidate', async () => {
    vi.mocked(savedViewService.saveOrOverwrite).mockResolvedValue({
      ok: false,
      reason: 'name-conflict',
    });
    const result = await saveSavedViewAction({
      name: 'Food',
      targetPath: '/transactions',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('name-conflict');
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('passes overwrite flag through to the service', async () => {
    vi.mocked(savedViewService.saveOrOverwrite).mockResolvedValue({
      ok: true,
      view: {
        id: 'V1',
        userId: 'alice',
        name: 'Food',
        targetPath: '/balance',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    await saveSavedViewAction(
      { name: 'Food', targetPath: '/balance' },
      { overwrite: true }
    );
    expect(savedViewService.saveOrOverwrite).toHaveBeenCalledWith(
      'alice',
      { name: 'Food', targetPath: '/balance' },
      { overwrite: true }
    );
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `pnpm exec vitest run features/savedViews/actions/saveSavedView.test.ts`
Expected: FAIL with "Cannot find module './saveSavedView'".

- [ ] **Step 3: Implement the action**

Create `features/savedViews/actions/saveSavedView.ts`:

```typescript
'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/require-user';
import { savedViewService } from '@/lib/savedViews';
import { savedViewInputSchema } from '@/lib/savedViews';

export type SaveSavedViewResult =
  | { ok: true; viewId: string }
  | {
      ok: false;
      reason: 'name-conflict' | 'invalid';
      message?: string;
      fieldErrors?: Record<string, string>;
    };

export const saveSavedViewAction = async (
  input: unknown,
  opts: { overwrite?: boolean } = {}
): Promise<SaveSavedViewResult> => {
  const user = await requireUser();
  const parsed = savedViewInputSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join('.') || 'form';
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return {
      ok: false,
      reason: 'invalid',
      message: 'Validation failed.',
      fieldErrors,
    };
  }
  const result = await savedViewService.saveOrOverwrite(
    user.id,
    parsed.data,
    opts
  );
  if (!result.ok) {
    return {
      ok: false,
      reason: 'name-conflict',
      message: `A view named "${parsed.data.name}" already exists.`,
    };
  }
  revalidatePath('/', 'layout');
  return { ok: true, viewId: result.view.id };
};
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `pnpm exec vitest run features/savedViews/actions/saveSavedView.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add features/savedViews/actions/saveSavedView.ts features/savedViews/actions/saveSavedView.test.ts
git commit -m "feat(saved-views): saveSavedView server action"
```

---

## Task 7: Rename server action

**Files:**
- Create: `features/savedViews/actions/renameSavedView.ts`
- Test: `features/savedViews/actions/renameSavedView.test.ts`

- [ ] **Step 1: Write the failing test**

Create `features/savedViews/actions/renameSavedView.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth/require-user', () => ({ requireUser: vi.fn() }));
vi.mock('@/lib/savedViews', async () => {
  const actual = await vi.importActual<typeof import('@/lib/savedViews')>(
    '@/lib/savedViews'
  );
  return {
    ...actual,
    savedViewService: { rename: vi.fn() },
  };
});
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/require-user';
import { savedViewService } from '@/lib/savedViews';
import { renameSavedViewAction } from './renameSavedView';

describe('renameSavedViewAction', () => {
  beforeEach(() => {
    vi.mocked(requireUser).mockResolvedValue({ id: 'alice' } as never);
    vi.mocked(revalidatePath).mockClear();
    vi.mocked(savedViewService.rename).mockReset();
  });

  it('returns invalid when name is empty', async () => {
    const result = await renameSavedViewAction('V1', '');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('invalid');
    expect(savedViewService.rename).not.toHaveBeenCalled();
  });

  it('forwards rename happy path and revalidates', async () => {
    vi.mocked(savedViewService.rename).mockResolvedValue({
      ok: true,
      view: {
        id: 'V1',
        userId: 'alice',
        name: 'Groceries',
        targetPath: '/transactions',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    const result = await renameSavedViewAction('V1', '  Groceries  ');
    expect(result.ok).toBe(true);
    expect(savedViewService.rename).toHaveBeenCalledWith(
      'alice',
      'V1',
      'Groceries'
    );
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout');
  });

  it('forwards name-conflict and skips revalidate', async () => {
    vi.mocked(savedViewService.rename).mockResolvedValue({
      ok: false,
      reason: 'name-conflict',
    });
    const result = await renameSavedViewAction('V1', 'Other');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('name-conflict');
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('forwards not-found', async () => {
    vi.mocked(savedViewService.rename).mockResolvedValue({
      ok: false,
      reason: 'not-found',
    });
    const result = await renameSavedViewAction('V1', 'Other');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('not-found');
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `pnpm exec vitest run features/savedViews/actions/renameSavedView.test.ts`
Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement the action**

Create `features/savedViews/actions/renameSavedView.ts`:

```typescript
'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/require-user';
import { savedViewService, savedViewNameSchema } from '@/lib/savedViews';

export type RenameSavedViewResult =
  | { ok: true }
  | {
      ok: false;
      reason: 'name-conflict' | 'not-found' | 'invalid';
      message?: string;
    };

export const renameSavedViewAction = async (
  id: string,
  name: string
): Promise<RenameSavedViewResult> => {
  const user = await requireUser();
  const parsed = savedViewNameSchema.safeParse(name);
  if (!parsed.success) {
    return {
      ok: false,
      reason: 'invalid',
      message: parsed.error.issues[0]?.message ?? 'Invalid name.',
    };
  }
  const result = await savedViewService.rename(user.id, id, parsed.data);
  if (!result.ok) {
    if (result.reason === 'name-conflict') {
      return {
        ok: false,
        reason: 'name-conflict',
        message: `A view named "${parsed.data}" already exists.`,
      };
    }
    return {
      ok: false,
      reason: 'not-found',
      message: 'That saved view no longer exists.',
    };
  }
  revalidatePath('/', 'layout');
  return { ok: true };
};
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `pnpm exec vitest run features/savedViews/actions/renameSavedView.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add features/savedViews/actions/renameSavedView.ts features/savedViews/actions/renameSavedView.test.ts
git commit -m "feat(saved-views): renameSavedView server action"
```

---

## Task 8: Delete server action

**Files:**
- Create: `features/savedViews/actions/deleteSavedView.ts`
- Test: `features/savedViews/actions/deleteSavedView.test.ts`

- [ ] **Step 1: Write the failing test**

Create `features/savedViews/actions/deleteSavedView.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth/require-user', () => ({ requireUser: vi.fn() }));
vi.mock('@/lib/savedViews', async () => {
  const actual = await vi.importActual<typeof import('@/lib/savedViews')>(
    '@/lib/savedViews'
  );
  return {
    ...actual,
    savedViewService: { delete: vi.fn() },
  };
});
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/require-user';
import { savedViewService } from '@/lib/savedViews';
import { deleteSavedViewAction } from './deleteSavedView';

describe('deleteSavedViewAction', () => {
  beforeEach(() => {
    vi.mocked(requireUser).mockResolvedValue({ id: 'alice' } as never);
    vi.mocked(revalidatePath).mockClear();
    vi.mocked(savedViewService.delete).mockReset();
    vi.mocked(savedViewService.delete).mockResolvedValue(undefined);
  });

  it('delegates to the service and revalidates', async () => {
    await deleteSavedViewAction('V1');
    expect(savedViewService.delete).toHaveBeenCalledWith('alice', 'V1');
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout');
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `pnpm exec vitest run features/savedViews/actions/deleteSavedView.test.ts`
Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement the action**

Create `features/savedViews/actions/deleteSavedView.ts`:

```typescript
'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/require-user';
import { savedViewService } from '@/lib/savedViews';

export const deleteSavedViewAction = async (id: string): Promise<void> => {
  const user = await requireUser();
  await savedViewService.delete(user.id, id);
  revalidatePath('/', 'layout');
};
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `pnpm exec vitest run features/savedViews/actions/deleteSavedView.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add features/savedViews/actions/deleteSavedView.ts features/savedViews/actions/deleteSavedView.test.ts
git commit -m "feat(saved-views): deleteSavedView server action"
```

---

## Task 9: routeLabel helper

**Files:**
- Create: `features/savedViews/routeLabel.ts`
- Test: `features/savedViews/routeLabel.test.ts`

- [ ] **Step 1: Write the failing test**

Create `features/savedViews/routeLabel.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { routeLabel } from './routeLabel';

describe('routeLabel', () => {
  it('labels /transactions', () => {
    expect(routeLabel('/transactions')).toBe('Transactions');
    expect(routeLabel('/transactions?account=Expenses:Food')).toBe(
      'Transactions'
    );
  });
  it('labels /balance and ranged balance', () => {
    expect(routeLabel('/balance')).toBe('Balance');
    expect(routeLabel('/balance/2026-01-01/2026-03-31')).toBe('Balance');
  });
  it('labels /payees with range', () => {
    expect(routeLabel('/payees/2026-01-01/2026-03-31')).toBe('Payees');
  });
  it('labels /registers/monthly with account', () => {
    expect(routeLabel('/registers/monthly/Expenses:Food')).toBe(
      'Register: Expenses:Food'
    );
    expect(routeLabel('/registers/monthly/Expenses%3AFood')).toBe(
      'Register: Expenses:Food'
    );
  });
  it('labels /accounts with account', () => {
    expect(routeLabel('/accounts/Assets:Cash')).toBe('Account: Assets:Cash');
    expect(routeLabel('/accounts/Assets%3ACash')).toBe('Account: Assets:Cash');
  });
  it('falls back to the raw pathname for unknown routes', () => {
    expect(routeLabel('/portfolio')).toBe('/portfolio');
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `pnpm exec vitest run features/savedViews/routeLabel.test.ts`
Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement the helper**

Create `features/savedViews/routeLabel.ts`:

```typescript
export const routeLabel = (targetPath: string): string => {
  const pathname = targetPath.split('?')[0] ?? targetPath;
  if (pathname === '/transactions') return 'Transactions';
  if (pathname === '/balance' || /^\/balance\/[^/]+\/[^/]+$/.test(pathname))
    return 'Balance';
  if (/^\/payees\/[^/]+\/[^/]+$/.test(pathname)) return 'Payees';
  const register = pathname.match(/^\/registers\/monthly\/(.+)$/);
  if (register) return `Register: ${safeDecode(register[1])}`;
  const account = pathname.match(/^\/accounts\/(.+)$/);
  if (account) return `Account: ${safeDecode(account[1])}`;
  return pathname;
};

const safeDecode = (segment: string): string => {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
};
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `pnpm exec vitest run features/savedViews/routeLabel.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add features/savedViews/routeLabel.ts features/savedViews/routeLabel.test.ts
git commit -m "feat(saved-views): routeLabel helper"
```

---

## Task 10: SaveViewButton component

**Files:**
- Create: `features/savedViews/SaveViewButton.tsx`
- Test: `features/savedViews/SaveViewButton.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `features/savedViews/SaveViewButton.test.tsx`:

```typescript
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('./actions/saveSavedView', () => ({
  saveSavedViewAction: vi.fn(),
}));
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import { saveSavedViewAction } from './actions/saveSavedView';
import SaveViewButton from './SaveViewButton';

describe('SaveViewButton', () => {
  beforeEach(() => {
    vi.mocked(saveSavedViewAction).mockReset();
  });

  it('opens the dialog when clicked', async () => {
    const user = userEvent.setup();
    render(<SaveViewButton targetPath="/transactions" existingNames={[]} />);
    await user.click(screen.getByRole('button', { name: /save view/i }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText(/name/i)).toBeInTheDocument();
  });

  it('calls saveSavedViewAction with the captured targetPath', async () => {
    vi.mocked(saveSavedViewAction).mockResolvedValue({ ok: true, viewId: 'V1' });
    const user = userEvent.setup();
    render(
      <SaveViewButton
        targetPath="/transactions?account=Expenses:Food"
        existingNames={[]}
      />
    );
    await user.click(screen.getByRole('button', { name: /save view/i }));
    await user.type(screen.getByLabelText(/name/i), 'Food');
    await user.click(screen.getByRole('button', { name: /^save$/i }));
    await waitFor(() => {
      expect(saveSavedViewAction).toHaveBeenCalledWith(
        { name: 'Food', targetPath: '/transactions?account=Expenses:Food' },
        {}
      );
    });
  });

  it('renders Replace flow on name-conflict and retries with overwrite', async () => {
    vi.mocked(saveSavedViewAction)
      .mockResolvedValueOnce({
        ok: false,
        reason: 'name-conflict',
        message: 'A view named "Food" already exists.',
      })
      .mockResolvedValueOnce({ ok: true, viewId: 'V1' });

    const user = userEvent.setup();
    render(<SaveViewButton targetPath="/transactions" existingNames={['Food']} />);
    await user.click(screen.getByRole('button', { name: /save view/i }));
    await user.type(screen.getByLabelText(/name/i), 'Food');
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    const replace = await screen.findByRole('button', { name: /replace/i });
    await user.click(replace);

    await waitFor(() => {
      expect(saveSavedViewAction).toHaveBeenLastCalledWith(
        { name: 'Food', targetPath: '/transactions' },
        { overwrite: true }
      );
    });
  });

  it('renders inline error for invalid result', async () => {
    vi.mocked(saveSavedViewAction).mockResolvedValue({
      ok: false,
      reason: 'invalid',
      message: 'Validation failed.',
      fieldErrors: { name: 'Name is required' },
    });
    const user = userEvent.setup();
    render(<SaveViewButton targetPath="/transactions" existingNames={[]} />);
    await user.click(screen.getByRole('button', { name: /save view/i }));
    await user.type(screen.getByLabelText(/name/i), 'Food');
    await user.click(screen.getByRole('button', { name: /^save$/i }));
    expect(await screen.findByText(/validation failed/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `pnpm exec vitest run features/savedViews/SaveViewButton.test.tsx`
Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement the component**

Create `features/savedViews/SaveViewButton.tsx`:

```typescript
'use client';

import { Bookmark } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { saveSavedViewAction } from './actions/saveSavedView';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Props = {
  targetPath: string;
  existingNames: string[];
};

const SaveViewButton = ({ targetPath, existingNames }: Props) => {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [isPending, startTransition] = useTransition();

  const submit = (opts: { overwrite?: boolean } = {}) => {
    setError(null);
    startTransition(async () => {
      const result = await saveSavedViewAction(
        { name: name.trim(), targetPath },
        opts
      );
      if (result.ok) {
        toast.success(`Saved view "${name.trim()}"`);
        setOpen(false);
        setName('');
        setConflict(false);
        router.refresh();
        return;
      }
      if (result.reason === 'name-conflict') {
        setConflict(true);
        setError(result.message ?? 'That name is already in use.');
        return;
      }
      setError(result.message ?? 'Could not save view.');
    });
  };

  const localConflict = !conflict && existingNames.includes(name.trim());

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setName('');
          setError(null);
          setConflict(false);
        }
      }}
    >
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
      >
        <Bookmark className="size-4" aria-hidden />
        Save view
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save view</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="saved-view-name">Name</Label>
            <Input
              id="saved-view-name"
              autoFocus
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (conflict) setConflict(false);
              }}
              maxLength={80}
              disabled={isPending}
            />
            <p className="text-xs text-muted-foreground break-all">
              {targetPath}
            </p>
          </div>
          {error && (
            <Alert variant="destructive">
              <AlertDescription className="flex items-center gap-3">
                <span>{error}</span>
                {conflict && (
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    onClick={() => submit({ overwrite: true })}
                    disabled={isPending}
                  >
                    Replace
                  </Button>
                )}
              </AlertDescription>
            </Alert>
          )}
          {localConflict && !error && (
            <Alert variant="destructive">
              <AlertDescription>
                A view named &quot;{name.trim()}&quot; already exists. Saving
                will require Replace.
              </AlertDescription>
            </Alert>
          )}
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setOpen(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => submit()}
            disabled={isPending || !name.trim()}
          >
            {isPending ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default SaveViewButton;
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `pnpm exec vitest run features/savedViews/SaveViewButton.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add features/savedViews/SaveViewButton.tsx features/savedViews/SaveViewButton.test.tsx
git commit -m "feat(saved-views): SaveViewButton with dialog + Replace flow"
```

---

## Task 11: Wire SaveViewButton into `/transactions`

**Files:**
- Modify: `features/transactions/Filters.tsx`
- Modify: the server component that mounts `<Filters>` (find via `grep -rn 'from .*Filters' features/transactions app/transactions`)

- [ ] **Step 1: Add SaveViewButton prop and import to Filters**

In `features/transactions/Filters.tsx`:

Add the import alongside the others:

```typescript
import SaveViewButton from '@/features/savedViews/SaveViewButton';
```

Extend the `Props` type:

```typescript
type Props = {
  payees: string[];
  accounts: string[];
  start?: string;
  end?: string;
  existingViewNames: string[];
};
```

Destructure `existingViewNames` in the component, then compute the current path and search-string client-side and pass them. Add this block right before `return`:

```typescript
const search = params.toString();
const currentPath = '/transactions' + (search ? '?' + search : '');
```

In the JSX, append the button right after `<ExportButton href={exportHref} />` inside the trailing flex row:

```tsx
<SaveViewButton targetPath={currentPath} existingNames={existingViewNames} />
```

- [ ] **Step 2: Update the server-side `<Filters>` consumer**

Open the file that renders `<Filters …/>` (a server component under `features/transactions/` or `app/transactions/page.tsx`). Add:

```typescript
import { savedViewService } from '@/lib/savedViews';
import { requireUser } from '@/lib/auth/require-user';
```

In the async server component, before rendering `<Filters>`:

```typescript
const user = await requireUser();
const existingViewNames = (await savedViewService.list(user.id)).map(
  (v) => v.name
);
```

Pass it to the component:

```tsx
<Filters
  payees={payees}
  accounts={accounts}
  start={start}
  end={end}
  existingViewNames={existingViewNames}
/>
```

- [ ] **Step 3: Type-check**

Run: `pnpm type-check`
Expected: no errors.

- [ ] **Step 4: Manual smoke test**

Run: `pnpm dev` (background) and load `http://localhost:3000/transactions?account=Assets:Cash`. Sign in if needed. Confirm the bookmark "Save view" button renders after Export CSV, opens a dialog, and saves a view that appears via SQL: `sqlite3 .data/db.sqlite 'SELECT name, targetPath FROM savedView;'`. Then kill the dev server.

- [ ] **Step 5: Commit**

```bash
git add features/transactions/Filters.tsx <server-component-path-from-step-2>
git commit -m "feat(saved-views): mount SaveViewButton on /transactions filters"
```

---

## Task 12: Add `saveViewSlot` to DateFilter and wire `/balance` + `/payees`

**Files:**
- Modify: `components/DateFilter/DateFilter.tsx`
- Modify: `app/balance/page.tsx`
- Modify: `app/balance/[from]/[to]/page.tsx`
- Modify: `app/payees/[from]/[to]/page.tsx`

- [ ] **Step 1: Extend DateFilter to accept a slot**

In `components/DateFilter/DateFilter.tsx`, extend `Props`:

```typescript
import type { ReactNode } from 'react';

type Props = {
  urlPattern: string;
  from?: string;
  to?: string;
  saveViewSlot?: ReactNode;
};
```

Destructure it inside the component:

```typescript
const { urlPattern, from: fromProp, to: toProp, saveViewSlot } = props;
```

Render the slot inside the top row, immediately after the Apply button:

```tsx
<Button onClick={handleSubmit} size="sm" className="ml-auto">
  Apply
</Button>
{saveViewSlot}
```

- [ ] **Step 2: Wire `/balance` pages**

In `app/balance/page.tsx` (server component): add

```typescript
import SaveViewButton from '@/features/savedViews/SaveViewButton';
import { savedViewService } from '@/lib/savedViews';
import { requireUser } from '@/lib/auth/require-user';
```

In the component:

```typescript
const user = await requireUser();
const existingViewNames = (await savedViewService.list(user.id)).map((v) => v.name);
const currentPath = '/balance';
```

Pass the slot to the existing `<DateFilter …/>`:

```tsx
<DateFilter
  urlPattern="/balance/{from}/{to}"
  saveViewSlot={
    <SaveViewButton
      targetPath={currentPath}
      existingNames={existingViewNames}
    />
  }
/>
```

Do the same in `app/balance/[from]/[to]/page.tsx`, but with `currentPath = ` `/balance/${params.from}/${params.to}` ``.

- [ ] **Step 3: Wire `/payees/[from]/[to]`**

In `app/payees/[from]/[to]/page.tsx`, mirror the balance changes. `currentPath = ` `/payees/${params.from}/${params.to}` ``.

- [ ] **Step 4: Type-check + smoke test**

Run: `pnpm type-check`. Then `pnpm dev`, visit `/balance/2026-01-01/2026-03-31` and `/payees/2026-01-01/2026-03-31`. Confirm Save view button appears next to Apply. Save one view from each page; check it persisted via `sqlite3` as in Task 11 Step 4.

- [ ] **Step 5: Commit**

```bash
git add components/DateFilter/DateFilter.tsx app/balance/ app/payees/[from]/[to]/page.tsx
git commit -m "feat(saved-views): mount SaveViewButton in DateFilter slot for balance + payees"
```

---

## Task 13: RegisterHeader for `/registers/monthly/[account]`

**Files:**
- Create: `features/registers/monthly/RegisterHeader.tsx`
- Modify: `app/registers/monthly/[account]/page.tsx`

- [ ] **Step 1: Inspect the existing header**

Read `app/registers/monthly/[account]/page.tsx` to find the header JSX (the title + Help + Balance label that currently lives inline). Note the props it has access to (`account`, balance string, etc.) so the new component receives the same data.

- [ ] **Step 2: Implement RegisterHeader**

Create `features/registers/monthly/RegisterHeader.tsx`:

```typescript
import SaveViewButton from '@/features/savedViews/SaveViewButton';
import Help from '@/components/Help';

type Props = {
  account: string;
  balanceLabel?: string;
  existingViewNames: string[];
};

const RegisterHeader = ({ account, balanceLabel, existingViewNames }: Props) => {
  const targetPath = `/registers/monthly/${encodeURIComponent(account)}`;
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          Register: {account}
        </h1>
        <Help label="About this page">
          Monthly postings for {account}, aggregated by month.
        </Help>
      </div>
      <div className="flex items-center gap-3">
        {balanceLabel && (
          <span className="text-sm text-muted">{balanceLabel}</span>
        )}
        <SaveViewButton
          targetPath={targetPath}
          existingNames={existingViewNames}
        />
      </div>
    </div>
  );
};

export default RegisterHeader;
```

Adjust the JSX (title text, "Balance" label, Help body) to match what the existing inline header renders. Do not rewrite copy you don't have to.

- [ ] **Step 3: Replace the inline header in the page**

In `app/registers/monthly/[account]/page.tsx`:

Add imports:

```typescript
import RegisterHeader from '@/features/registers/monthly/RegisterHeader';
import { savedViewService } from '@/lib/savedViews';
import { requireUser } from '@/lib/auth/require-user';
```

Inside the async server component, fetch existing names alongside the existing data:

```typescript
const user = await requireUser();
const existingViewNames = (await savedViewService.list(user.id)).map((v) => v.name);
```

Replace the inline header JSX with:

```tsx
<RegisterHeader
  account={account}
  balanceLabel={balanceLabel}  // whatever variable the inline header already used
  existingViewNames={existingViewNames}
/>
```

- [ ] **Step 4: Type-check + smoke test**

Run: `pnpm type-check`. Then `pnpm dev`, visit `/registers/monthly/Expenses:Food`. Confirm the button appears top-right and saving a view persists.

- [ ] **Step 5: Commit**

```bash
git add features/registers/monthly/RegisterHeader.tsx app/registers/monthly/[account]/page.tsx
git commit -m "feat(saved-views): RegisterHeader hosting SaveViewButton"
```

---

## Task 14: AccountHeader for `/accounts/[account]`

**Files:**
- Create: `features/accounts/AccountHeader.tsx`
- Modify: `app/accounts/[account]/page.tsx`

- [ ] **Step 1: Mirror Task 13**

Create `features/accounts/AccountHeader.tsx` following the same shape — title, optional Help, `SaveViewButton` with `targetPath = `/accounts/${encodeURIComponent(account)}``.

```typescript
import SaveViewButton from '@/features/savedViews/SaveViewButton';
import Help from '@/components/Help';

type Props = {
  account: string;
  existingViewNames: string[];
};

const AccountHeader = ({ account, existingViewNames }: Props) => {
  const targetPath = `/accounts/${encodeURIComponent(account)}`;
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          Account: {account}
        </h1>
        <Help label="About this page">
          Postings filtered to the {account} account.
        </Help>
      </div>
      <SaveViewButton
        targetPath={targetPath}
        existingNames={existingViewNames}
      />
    </div>
  );
};

export default AccountHeader;
```

Adjust title / Help body to match what the page already renders.

- [ ] **Step 2: Use it in the page**

In `app/accounts/[account]/page.tsx`, replace the inline header with `<AccountHeader …/>` and fetch `existingViewNames` (mirroring Task 13 Step 3).

- [ ] **Step 3: Type-check + smoke test**

`pnpm type-check`, then `pnpm dev`, visit `/accounts/Assets:Cash`. Confirm button + save.

- [ ] **Step 4: Commit**

```bash
git add features/accounts/AccountHeader.tsx app/accounts/[account]/page.tsx
git commit -m "feat(saved-views): AccountHeader hosting SaveViewButton"
```

---

## Task 15: SavedViewRowActions (rename + delete dropdown)

**Files:**
- Create: `features/savedViews/SavedViewRowActions.tsx`

- [ ] **Step 1: Implement the dropdown**

Create `features/savedViews/SavedViewRowActions.tsx`:

```typescript
'use client';

import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { deleteSavedViewAction } from './actions/deleteSavedView';
import { renameSavedViewAction } from './actions/renameSavedView';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import ConfirmDialog from '@/components/ConfirmDialog';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Props = {
  viewId: string;
  currentName: string;
};

const SavedViewRowActions = ({ viewId, currentName }: Props) => {
  const router = useRouter();
  const [renameOpen, setRenameOpen] = useState(false);
  const [name, setName] = useState(currentName);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const onRename = () => {
    setError(null);
    startTransition(async () => {
      const result = await renameSavedViewAction(viewId, name);
      if (result.ok) {
        toast.success('View renamed');
        setRenameOpen(false);
        router.refresh();
        return;
      }
      setError(result.message ?? 'Could not rename');
    });
  };

  const onDelete = () => {
    startTransition(async () => {
      await deleteSavedViewAction(viewId);
      toast.success('View deleted');
      router.refresh();
    });
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Open view actions"
          >
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onSelect={() => {
              setName(currentName);
              setRenameOpen(true);
            }}
          >
            <Pencil className="size-4" /> Rename
          </DropdownMenuItem>
          <ConfirmDialog
            title="Delete saved view?"
            description={`"${currentName}" will be removed. This cannot be undone.`}
            confirmLabel="Delete"
            variant="destructive"
            onConfirm={onDelete}
          >
            <DropdownMenuItem
              onSelect={(e) => e.preventDefault()}
              className="text-destructive"
            >
              <Trash2 className="size-4" /> Delete
            </DropdownMenuItem>
          </ConfirmDialog>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename saved view</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="saved-view-rename">Name</Label>
            <Input
              id="saved-view-rename"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              disabled={isPending}
            />
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setRenameOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={onRename}
              disabled={isPending || !name.trim() || name === currentName}
            >
              {isPending ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default SavedViewRowActions;
```

- [ ] **Step 2: Type-check**

Run: `pnpm type-check`
Expected: no errors. If `components/ConfirmDialog` has a different default-export name, fix the import to match.

- [ ] **Step 3: Commit**

```bash
git add features/savedViews/SavedViewRowActions.tsx
git commit -m "feat(saved-views): row actions dropdown with rename + delete"
```

---

## Task 16: SavedViewsCard Dashboard panel

**Files:**
- Create: `features/dashboard/SavedViewsCard.tsx`
- Test: `features/dashboard/SavedViewsCard.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `features/dashboard/SavedViewsCard.test.tsx`:

```typescript
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/features/savedViews/SavedViewRowActions', () => ({
  default: () => null,
}));

import SavedViewsCard from './SavedViewsCard';

describe('SavedViewsCard', () => {
  it('renders the empty-state hint when no views exist', () => {
    render(<SavedViewsCard views={[]} />);
    expect(screen.getByText(/no saved views yet/i)).toBeInTheDocument();
  });

  it('renders a link per view with the correct href and route label', () => {
    render(
      <SavedViewsCard
        views={[
          {
            id: 'V1',
            name: 'Food',
            targetPath: '/transactions?account=Expenses:Food',
          },
          {
            id: 'V2',
            name: 'This Q',
            targetPath: '/balance/2026-01-01/2026-03-31',
          },
        ]}
      />
    );

    const food = screen.getByRole('link', { name: /food/i });
    expect(food).toHaveAttribute(
      'href',
      '/transactions?account=Expenses:Food'
    );
    expect(screen.getByText('Transactions')).toBeInTheDocument();

    const balance = screen.getByRole('link', { name: /this q/i });
    expect(balance).toHaveAttribute(
      'href',
      '/balance/2026-01-01/2026-03-31'
    );
    expect(screen.getByText('Balance')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `pnpm exec vitest run features/dashboard/SavedViewsCard.test.tsx`
Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement the card**

Create `features/dashboard/SavedViewsCard.tsx`:

```typescript
import Link from 'next/link';
import SavedViewRowActions from '@/features/savedViews/SavedViewRowActions';
import { routeLabel } from '@/features/savedViews/routeLabel';
import {
  Card as ShadcnCard,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

type ViewRow = {
  id: string;
  name: string;
  targetPath: string;
};

type Props = {
  views: ViewRow[];
};

const SavedViewsCard = ({ views }: Props) => {
  return (
    <section className="flex flex-col gap-4">
      <ShadcnCard>
        <CardHeader>
          <CardTitle className="text-lg font-semibold tracking-tight">
            Saved views
          </CardTitle>
        </CardHeader>
        <CardContent>
          {views.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No saved views yet. Look for the bookmark icon next to filters on
              Transactions, Balance, or Payees.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {views.map((view) => (
                <li
                  key={view.id}
                  className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0"
                >
                  <Link
                    href={view.targetPath}
                    className="flex flex-col gap-0.5 flex-1 min-w-0"
                  >
                    <span className="text-sm font-medium truncate">
                      {view.name}
                    </span>
                    <span className="text-xs text-muted-foreground truncate">
                      {routeLabel(view.targetPath)}
                    </span>
                  </Link>
                  <SavedViewRowActions
                    viewId={view.id}
                    currentName={view.name}
                  />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </ShadcnCard>
    </section>
  );
};

export default SavedViewsCard;
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `pnpm exec vitest run features/dashboard/SavedViewsCard.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add features/dashboard/SavedViewsCard.tsx features/dashboard/SavedViewsCard.test.tsx
git commit -m "feat(saved-views): SavedViewsCard Dashboard panel"
```

---

## Task 17: Mount SavedViewsCard on Dashboard

**Files:**
- Modify: `features/dashboard/Dashboard.tsx`

- [ ] **Step 1: Inject the panel**

Open `features/dashboard/Dashboard.tsx`. Add imports:

```typescript
import SavedViewsCard from './SavedViewsCard';
import { savedViewService } from '@/lib/savedViews';
import { requireUser } from '@/lib/auth/require-user';
```

Inside the component (above the existing `Promise.all` block, since the Dashboard early-returns on empty journal but `requireUser` is already implicit upstream):

```typescript
const user = await requireUser();
const savedViews = await savedViewService.list(user.id);
```

Render the card directly above the "Recent transactions" `<section>`:

```tsx
<SavedViewsCard
  views={savedViews.map(({ id, name, targetPath }) => ({
    id,
    name,
    targetPath,
  }))}
/>
```

- [ ] **Step 2: Type-check + smoke test**

Run: `pnpm type-check`. Then `pnpm dev`, visit `/`. Confirm the panel renders empty-state when no views exist, and renders a list once you save a view from `/transactions`.

- [ ] **Step 3: Commit**

```bash
git add features/dashboard/Dashboard.tsx
git commit -m "feat(saved-views): mount SavedViewsCard above recent transactions"
```

---

## Task 18: Integration test

**Files:**
- Create: `features/savedViews/integration.test.ts`

- [ ] **Step 1: Write the test**

Create `features/savedViews/integration.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '@/db/schema';
import {
  setupTestDb,
  teardownTestDb,
  type TestDbContext,
} from '@/lib/test-utils/db';
import { SavedViewRepository } from '@/lib/savedViews/repository';
import { SavedViewService } from '@/lib/savedViews/service';

const SAVED_VIEW_TABLE = `
  CREATE TABLE IF NOT EXISTS "savedView" (
    "id" text PRIMARY KEY NOT NULL,
    "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
    "name" text NOT NULL,
    "targetPath" text NOT NULL,
    "createdAt" integer NOT NULL DEFAULT (unixepoch()),
    "updatedAt" integer NOT NULL DEFAULT (unixepoch())
  );
  CREATE UNIQUE INDEX IF NOT EXISTS "savedView_user_name"
    ON "savedView"("userId", "name");
`;

describe('saved views integration', () => {
  let ctx: TestDbContext;
  let service: SavedViewService;

  beforeEach(async () => {
    ctx = await setupTestDb('saved-views-integration-');
    ctx.sqlite.exec(SAVED_VIEW_TABLE);
    ctx.sqlite
      .prepare(`INSERT INTO "user" ("id","name","email") VALUES (?,?,?)`)
      .run('alice', 'Alice', 'alice@example.com');
    const repo = new SavedViewRepository(drizzle(ctx.sqlite, { schema }));
    service = new SavedViewService(repo);
  });

  afterEach(async () => {
    await teardownTestDb(ctx);
  });

  it('runs through save → list → rename conflict → rename → delete', async () => {
    const saveA = await service.saveOrOverwrite('alice', {
      name: 'Food',
      targetPath: '/transactions?account=Expenses:Food',
    });
    expect(saveA.ok).toBe(true);

    const saveB = await service.saveOrOverwrite('alice', {
      name: 'This quarter',
      targetPath: '/balance/2026-01-01/2026-03-31',
    });
    expect(saveB.ok).toBe(true);

    const list = await service.list('alice');
    expect(list.map((v) => v.name)).toEqual(['Food', 'This quarter']);

    if (!saveB.ok) throw new Error('precondition failed');
    const conflict = await service.rename('alice', saveB.view.id, 'Food');
    expect(conflict).toEqual({ ok: false, reason: 'name-conflict' });

    const renamed = await service.rename('alice', saveB.view.id, 'Q1 2026');
    expect(renamed.ok).toBe(true);

    if (!saveA.ok) throw new Error('precondition failed');
    await service.delete('alice', saveA.view.id);
    expect((await service.list('alice')).map((v) => v.name)).toEqual([
      'Q1 2026',
    ]);
  });
});
```

- [ ] **Step 2: Run the test**

Run: `pnpm exec vitest run features/savedViews/integration.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add features/savedViews/integration.test.ts
git commit -m "test(saved-views): integration save → list → rename → delete"
```

---

## Task 19: Full test + lint + type-check + manual exercise

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `pnpm test` (or `pnpm exec vitest run`)
Expected: all tests pass, including the existing ones. If a flaky test appears that's unrelated to saved views, note it but proceed.

- [ ] **Step 2: Lint**

Run: `pnpm lint`
Expected: no errors.

- [ ] **Step 3: Type-check**

Run: `pnpm type-check`
Expected: no errors.

- [ ] **Step 4: Manual exercise of the whole flow**

Run `pnpm dev`, sign in, and:
1. Save a view from `/transactions?account=Expenses:Food`.
2. Save a view from `/balance/2026-01-01/2026-03-31`.
3. Save a view from `/payees/2026-01-01/2026-03-31`.
4. Save a view from `/registers/monthly/Expenses:Food`.
5. Save a view from `/accounts/Assets:Cash`.
6. Visit `/`. Confirm all five saved views render, each link navigates correctly, route labels read as expected.
7. Rename one view; trigger a conflict and confirm the inline alert; then rename to a free name and confirm success.
8. Delete one view; confirm the row disappears.
9. Save a sixth view with an already-used name; confirm Replace flow updates the existing row without creating a duplicate.

If any step fails, fix and re-run the suite before moving on.

- [ ] **Step 5: No commit needed.** This task is verification only.

---

## Task 20: Tick PLAN.md

**Files:**
- Modify: `PLAN.md`

- [ ] **Step 1: Update Phase 6 entry**

In `PLAN.md`, change the "Saved views" line in Phase 6 from `[ ]` to `[x]` with a brief summary in the same tone as adjacent ticked items. Suggested copy:

```
- [x] **Saved views** — per-user `savedView` table (`name` UNIQUE per user, canonicalized `targetPath`). Inline "Save view" button on the four filter surfaces (Filters, DateFilter, the new RegisterHeader, the new AccountHeader). Dashboard panel above Recent transactions lists views with rename / delete dropdowns; conflict surfaces a Replace flow. Spec: `docs/superpowers/specs/2026-06-11-saved-views-design.md`.
```

- [ ] **Step 2: Commit**

```bash
git add PLAN.md
git commit -m "docs(plan): tick off Phase 6 saved views"
```

---

## Spec coverage check

| Spec requirement | Task |
| --- | --- |
| `savedView` schema (cols, FK cascade, UNIQUE) | Task 1 |
| Zod input schema with allowlisted-route enforcement | Task 2 |
| `targetPath` canonicalization (fragment drop, traversal guard, length limit) | Task 2 |
| Repository CRUD (`find`, `findByName`, `list`, `create`, `update`, `delete`) | Task 3 |
| Service `saveOrOverwrite` with conflict handling | Task 4 |
| Service `rename` returning conflict / not-found / ok | Task 4 |
| Service `delete` silent on missing | Task 4 |
| Module singleton + exports | Task 5 |
| `saveSavedViewAction` with `fieldErrors` and overwrite flag | Task 6 |
| `renameSavedViewAction` | Task 7 |
| `deleteSavedViewAction` | Task 8 |
| `routeLabel` helper for Dashboard sub-label | Task 9 |
| `SaveViewButton` with Replace flow + toast on success | Task 10 |
| Mount on `/transactions` Filters | Task 11 |
| Mount on `/balance` + `/payees` via DateFilter slot | Task 12 |
| Mount on `/registers/monthly/[account]` via RegisterHeader | Task 13 |
| Mount on `/accounts/[account]` via AccountHeader | Task 14 |
| Dashboard panel `SavedViewRowActions` (rename + delete) | Task 15 |
| `SavedViewsCard` empty state + populated rows | Task 16 |
| Mount card above Recent transactions | Task 17 |
| Integration: save → list → conflict → rename → delete | Task 18 |
| Full-suite verification + manual exercise | Task 19 |
| Tick PLAN.md | Task 20 |
