# Phase 4.2 — Transaction Templates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship transaction templates (save / list / use / rename / delete), backed by a new `template` table in SQLite. Also refactor Phase 4.1's transaction surface into `features/transactions/` so `app/transactions/*` becomes thin route shells.

**Architecture:** New `lib/templates/` data layer (Zod schema + Drizzle repository). New `features/templates/` UI feature (Save button + dialog, list page, rename dialog, picker combobox). Existing `app/transactions/{TransactionTable,Filters,new/TransactionForm}.tsx` and the three transaction action files relocate to `features/transactions/`; `app/transactions/{page,new/page,[uid]/edit/page}.tsx` become one-liners that render top-level feature components.

**Tech Stack:** TypeScript · Next.js 16 App Router · Zod · Drizzle ORM + better-sqlite3 · ULID · vitest · existing shadcn primitives (`Dialog`, `AlertDialog`, `DropdownMenu`, `Combobox`).

**Reference spec:** `docs/superpowers/specs/2026-05-19-phase-4-2-templates-design.md`.

---

## File Map

**Created (data layer):**

- `lib/test-utils/db.ts` — extracted DB setup helper for vitest.
- `db/schema/template.ts` — Drizzle `template` table + inferred `Template` type.
- `lib/templates/schema.ts` — `templateNameSchema`, `templateDraftSchema`, `templateInputSchema`, types.
- `lib/templates/repository.ts` — `listTemplates`, `getTemplate`, `saveTemplate`, `renameTemplate`, `deleteTemplate`.
- `lib/templates/schema.test.ts`, `lib/templates/repository.test.ts`, `lib/templates/integration.test.ts`.

**Created (UI feature):**

- `features/templates/Templates.tsx` — server component for `/templates`.
- `features/templates/TemplatesList.tsx` — client component (row actions).
- `features/templates/TemplatePicker.tsx` — combobox for `/transactions/new`.
- `features/templates/SaveAsTemplateButton.tsx` — button + dialog.
- `features/templates/RenameDialog.tsx` — inline rename dialog.
- `features/templates/actions.ts` — `saveTemplateAction`, `renameTemplateAction`, `deleteTemplateAction`.
- `features/templates/index.ts` — barrel.

**Created (route shells):**

- `app/templates/page.tsx`, `app/templates/loading.tsx`.

**Refactor (moves into `features/transactions/`):**

- `app/transactions/TransactionTable.tsx` → `features/transactions/TransactionTable.tsx`
- `app/transactions/Filters.tsx` → `features/transactions/Filters.tsx`
- `app/transactions/new/TransactionForm.tsx` → `features/transactions/TransactionForm.tsx`
- `app/transactions/actions.ts` + `app/transactions/new/actions.ts` + `app/transactions/[uid]/edit/actions.ts` → consolidated `features/transactions/actions.ts`

**New top-level feature components:**

- `features/transactions/Transactions.tsx`, `NewTransaction.tsx`, `EditTransaction.tsx`, `RowActions.tsx`, `index.ts`.

**Modified (thin in place):**

- `app/transactions/page.tsx`, `app/transactions/new/page.tsx`, `app/transactions/[uid]/edit/page.tsx`.
- `lib/journal/write.test.ts`, `lib/journal/integration.test.ts` — switch to the shared `db.ts` test helper.
- `components/nav/config.ts` — new `templates` entry under the Journal section.
- `db/schema/index.ts` — re-export `template`.

---

## Task 1 — Extract `lib/test-utils/db.ts`

Pure refactor of the inline test DB setup. No new behavior.

**Files:**

- Create: `lib/test-utils/db.ts`
- Modify: `lib/journal/write.test.ts`, `lib/journal/integration.test.ts`

- [ ] **Step 1: Read the existing inline setup**

Run:

```bash
sed -n '11,45p' lib/journal/write.test.ts
```

That's the `beforeEach` / `afterEach` block that creates a tmp dir, opens a SQLite db, runs `CREATE TABLE`, sets env vars.

- [ ] **Step 2: Create the shared helper**

Create `lib/test-utils/db.ts`:

```ts
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '@/db/schema';

export type TestDbContext = {
  tmpDir: string;
  dbPath: string;
  sqlite: Database.Database;
};

export const setupTestDb = async (
  prefix = 'ledger-test-'
): Promise<TestDbContext> => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  const dbPath = path.join(tmpDir, 'db.sqlite');
  const sqlite = new Database(dbPath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');

  drizzle(sqlite, { schema });
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS "user" (
      "id" text PRIMARY KEY NOT NULL,
      "name" text NOT NULL,
      "email" text NOT NULL UNIQUE,
      "emailVerified" integer NOT NULL DEFAULT 0,
      "image" text,
      "journalMain" text NOT NULL DEFAULT 'main.ledger',
      "createdAt" integer NOT NULL DEFAULT (unixepoch()),
      "updatedAt" integer NOT NULL DEFAULT (unixepoch())
    );
  `);

  process.env.DATA_DIR = tmpDir;
  process.env.DATABASE_URL = dbPath;
  process.env.BETTER_AUTH_SECRET = 'x'.repeat(32);

  return { tmpDir, dbPath, sqlite };
};

export const teardownTestDb = async (ctx: TestDbContext): Promise<void> => {
  try {
    ctx.sqlite.close();
  } catch {
    // already closed
  }
  await fs.rm(ctx.tmpDir, { recursive: true, force: true });
};
```

- [ ] **Step 3: Replace the inline setup in `lib/journal/write.test.ts`**

At the top of the file, replace the existing imports with:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import { setupTestDb, teardownTestDb, type TestDbContext } from '@/lib/test-utils/db';
```

Remove the `import Database from 'better-sqlite3';`, `import * as schema from '@/db/schema';`, `import { drizzle } from 'drizzle-orm/better-sqlite3';`, `import os from 'os';`.

Replace **both** `beforeEach`/`afterEach` blocks in the file with:

```ts
let ctx: TestDbContext;

beforeEach(async () => {
  ctx = await setupTestDb('write-');
});

afterEach(async () => {
  await teardownTestDb(ctx);
});
```

Inside each test, where the body currently reads `tmp` / `sqlite` / `dbPath`, switch to `ctx.tmpDir` / `ctx.sqlite` / `ctx.dbPath`.

Both `describe` blocks in the file (`writeJournal — edit`, `writeJournal — delete`) get the same treatment.

- [ ] **Step 4: Replace the inline setup in `lib/journal/integration.test.ts`**

Same treatment. If `integration.test.ts` uses a different pattern, follow whatever structure makes the test compile against `setupTestDb` / `teardownTestDb`.

- [ ] **Step 5: Run full suite**

Run: `pnpm test`
Expected: 56 tests still pass.

- [ ] **Step 6: Commit**

```bash
git add lib/test-utils/db.ts lib/journal/write.test.ts lib/journal/integration.test.ts
git commit -m "refactor(tests): extract shared DB setup helper"
```

---

## Task 2 — `template` Drizzle table

**Files:**

- Create: `db/schema/template.ts`
- Modify: `db/schema/index.ts`

- [ ] **Step 1: Create the schema file**

Create `db/schema/template.ts`:

```ts
import { sql } from 'drizzle-orm';
import {
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { user } from './user';
import type { TemplateDraft } from '@/lib/templates/schema';

export const template = sqliteTable(
  'template',
  {
    id: text('id').primaryKey(),
    userId: text('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    draft: text('draft', { mode: 'json' }).notNull().$type<TemplateDraft>(),
    createdAt: integer('createdAt', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer('updatedAt', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => ({
    uniqueNamePerUser: uniqueIndex('template_user_name').on(t.userId, t.name),
  })
);

export type Template = typeof template.$inferSelect;
```

This imports `TemplateDraft` from `@/lib/templates/schema`, which doesn't exist yet. The schema-only commit will fail type-check at this point — that's OK, Task 3 lands the type. To unblock the commit, temporarily declare a placeholder:

If TypeScript is unhappy, change the line to `.notNull().$type<unknown>()` and leave a TODO comment to revisit after Task 3. The Task 3 commit will switch it back to `TemplateDraft`.

- [ ] **Step 2: Re-export from the schema index**

Modify `db/schema/index.ts`:

```ts
export { account } from './account';
export { passkey } from './passkey';
export { session } from './session';
export { template } from './template';
export { user } from './user';
export { verification } from './verification';
```

- [ ] **Step 3: Type-check**

Run: `pnpm type-check`
Expected: pass (using `$type<unknown>()` as a placeholder, or pass straight away if you wrote Task 3's schema first).

- [ ] **Step 4: Verify no tests break**

Run: `pnpm test`
Expected: 56 tests pass.

- [ ] **Step 5: Commit**

```bash
git add db/schema/template.ts db/schema/index.ts
git commit -m "feat(db): add template table"
```

---

## Task 3 — `lib/templates/schema.ts` (Zod)

**Files:**

- Create: `lib/templates/schema.ts`
- Create: `lib/templates/schema.test.ts`
- Modify (if Task 2 used a placeholder): `db/schema/template.ts`

- [ ] **Step 1: Write the failing tests**

Create `lib/templates/schema.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  templateNameSchema,
  templateDraftSchema,
  templateInputSchema,
} from './schema';

describe('templateNameSchema', () => {
  it('accepts a valid name', () => {
    expect(templateNameSchema.safeParse('Groceries').success).toBe(true);
  });

  it('rejects empty', () => {
    expect(templateNameSchema.safeParse('').success).toBe(false);
    expect(templateNameSchema.safeParse('   ').success).toBe(false);
  });

  it('rejects names over 80 chars', () => {
    expect(templateNameSchema.safeParse('a'.repeat(81)).success).toBe(false);
  });
});

describe('templateDraftSchema', () => {
  const validPostings = [
    { account: 'Expenses:Food', amount: '10', currency: 'USD' },
    { account: 'Assets:Cash', amount: '-10', currency: 'USD' },
  ];

  it('accepts a draft with concrete amounts', () => {
    expect(
      templateDraftSchema.safeParse({
        payee: 'Lunch',
        status: 'none',
        postings: validPostings,
      }).success
    ).toBe(true);
  });

  it('accepts a skeleton draft with all-blank amounts', () => {
    expect(
      templateDraftSchema.safeParse({
        payee: 'Groceries',
        status: 'none',
        postings: [
          { account: 'Expenses:Food', amount: '', currency: '' },
          { account: 'Assets:Cash', amount: '', currency: '' },
        ],
      }).success
    ).toBe(true);
  });

  it('accepts an unbalanced draft (no balance superRefine)', () => {
    expect(
      templateDraftSchema.safeParse({
        payee: 'Rent',
        status: 'none',
        postings: [
          { account: 'Expenses:Rent', amount: '1500', currency: 'USD' },
          { account: 'Assets:Bank', amount: '-100', currency: 'USD' },
        ],
      }).success
    ).toBe(true);
  });

  it('rejects fewer than 2 postings', () => {
    expect(
      templateDraftSchema.safeParse({
        payee: 'Lunch',
        status: 'none',
        postings: [validPostings[0]],
      }).success
    ).toBe(false);
  });

  it('rejects empty payee', () => {
    expect(
      templateDraftSchema.safeParse({
        payee: '',
        status: 'none',
        postings: validPostings,
      }).success
    ).toBe(false);
  });
});

describe('templateInputSchema', () => {
  it('accepts a complete input', () => {
    expect(
      templateInputSchema.safeParse({
        name: 'Lunch',
        draft: {
          payee: 'Lunch',
          status: 'none',
          postings: [
            { account: 'Expenses:Food', amount: '10', currency: 'USD' },
            { account: 'Assets:Cash', amount: '-10', currency: 'USD' },
          ],
        },
      }).success
    ).toBe(true);
  });
});
```

- [ ] **Step 2: Run, expect module-not-found failures**

Run: `pnpm test lib/templates/schema.test.ts`
Expected: all fail because `./schema` doesn't exist yet.

- [ ] **Step 3: Implement the schema**

Create `lib/templates/schema.ts`:

```ts
import { z } from 'zod';
import { postingSchema } from '@/lib/transactions/schema';

const TEMPLATE_NAME_MAX = 80;

export const templateNameSchema = z
  .string()
  .trim()
  .min(1, 'Name is required')
  .max(TEMPLATE_NAME_MAX, 'Name is too long');

export const templateDraftSchema = z.object({
  payee: z.string().trim().min(1).max(200),
  status: z.enum(['cleared', 'pending', 'none']).default('none'),
  note: z.string().max(500).optional(),
  postings: z.array(postingSchema).min(2).max(50),
});

export type TemplateDraft = z.infer<typeof templateDraftSchema>;

export const templateInputSchema = z.object({
  name: templateNameSchema,
  draft: templateDraftSchema,
});
export type TemplateInput = z.infer<typeof templateInputSchema>;
```

- [ ] **Step 4: Switch `db/schema/template.ts` back to `TemplateDraft`**

If Task 2 used `$type<unknown>()` as a placeholder, change it back now:

```ts
import type { TemplateDraft } from '@/lib/templates/schema';
// ...
draft: text('draft', { mode: 'json' }).notNull().$type<TemplateDraft>(),
```

- [ ] **Step 5: Run tests, expect 8 passed**

Run: `pnpm test lib/templates/schema.test.ts`
Expected: 8 tests pass.

- [ ] **Step 6: Run full suite**

Run: `pnpm test`
Expected: 64 tests pass (56 + 8).

- [ ] **Step 7: Commit**

```bash
git add lib/templates/schema.ts lib/templates/schema.test.ts db/schema/template.ts
git commit -m "feat(templates): zod schema for template draft and input"
```

---

## Task 4 — `lib/templates/repository.ts` (DB helpers)

**Files:**

- Create: `lib/templates/repository.ts`
- Create: `lib/templates/repository.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `lib/templates/repository.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setupTestDb, teardownTestDb, type TestDbContext } from '@/lib/test-utils/db';
import type { TemplateInput } from './schema';

describe('templates repository', () => {
  let ctx: TestDbContext;

  beforeEach(async () => {
    ctx = await setupTestDb('templates-');
    ctx.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS "template" (
        "id" text PRIMARY KEY NOT NULL,
        "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
        "name" text NOT NULL,
        "draft" text NOT NULL,
        "createdAt" integer NOT NULL DEFAULT (unixepoch()),
        "updatedAt" integer NOT NULL DEFAULT (unixepoch())
      );
      CREATE UNIQUE INDEX IF NOT EXISTS "template_user_name" ON "template"("userId", "name");
    `);
    ctx.sqlite
      .prepare(
        `INSERT INTO "user" ("id","name","email") VALUES (?,?,?)`
      )
      .run('alice', 'Alice', 'alice@example.com');
    ctx.sqlite
      .prepare(
        `INSERT INTO "user" ("id","name","email") VALUES (?,?,?)`
      )
      .run('bob', 'Bob', 'bob@example.com');
  });

  afterEach(async () => {
    await teardownTestDb(ctx);
  });

  const sampleInput: TemplateInput = {
    name: 'Lunch',
    draft: {
      payee: 'Lunch',
      status: 'none',
      postings: [
        { account: 'Expenses:Food', amount: '10', currency: 'USD' },
        { account: 'Assets:Cash', amount: '-10', currency: 'USD' },
      ],
    },
  };

  it('saveTemplate inserts a new row with a ULID id', async () => {
    const { saveTemplate } = await import('./repository');
    const result = await saveTemplate('alice', sampleInput);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.template.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
      expect(result.template.name).toBe('Lunch');
      expect(result.template.userId).toBe('alice');
      expect(result.template.draft.payee).toBe('Lunch');
    }
  });

  it('saveTemplate with conflicting (userId,name) returns name-conflict', async () => {
    const { saveTemplate } = await import('./repository');
    await saveTemplate('alice', sampleInput);
    const result = await saveTemplate('alice', sampleInput);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('name-conflict');
  });

  it('saveTemplate with overwrite=true updates the existing row', async () => {
    const { saveTemplate, getTemplate } = await import('./repository');
    const first = await saveTemplate('alice', sampleInput);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const originalId = first.template.id;

    const updated: TemplateInput = {
      name: 'Lunch',
      draft: {
        payee: 'Lunch v2',
        status: 'cleared',
        postings: [
          { account: 'Expenses:Food', amount: '12', currency: 'USD' },
          { account: 'Assets:Cash', amount: '-12', currency: 'USD' },
        ],
      },
    };
    const result = await saveTemplate('alice', updated, { overwrite: true });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.template.id).toBe(originalId);

    const fetched = await getTemplate('alice', originalId);
    expect(fetched?.draft.payee).toBe('Lunch v2');
    expect(fetched?.draft.status).toBe('cleared');
  });

  it('listTemplates returns rows sorted by name (case-insensitive) for the user only', async () => {
    const { saveTemplate, listTemplates } = await import('./repository');
    await saveTemplate('alice', { ...sampleInput, name: 'banana' });
    await saveTemplate('alice', { ...sampleInput, name: 'Apple' });
    await saveTemplate('bob', { ...sampleInput, name: 'Alice-Should-Not-See' });

    const rows = await listTemplates('alice');
    expect(rows.map((r) => r.name)).toEqual(['Apple', 'banana']);
  });

  it('renameTemplate updates name and bumps updatedAt', async () => {
    const { saveTemplate, renameTemplate, getTemplate } = await import(
      './repository'
    );
    const created = await saveTemplate('alice', sampleInput);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const result = await renameTemplate('alice', created.template.id, 'Brunch');
    expect(result.ok).toBe(true);

    const fetched = await getTemplate('alice', created.template.id);
    expect(fetched?.name).toBe('Brunch');
  });

  it('renameTemplate to an existing name returns name-conflict', async () => {
    const { saveTemplate, renameTemplate } = await import('./repository');
    const first = await saveTemplate('alice', { ...sampleInput, name: 'A' });
    const second = await saveTemplate('alice', { ...sampleInput, name: 'B' });
    expect(first.ok && second.ok).toBe(true);
    if (!second.ok) return;

    const result = await renameTemplate('alice', second.template.id, 'A');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('name-conflict');
  });

  it('renameTemplate on a missing id returns not-found', async () => {
    const { renameTemplate } = await import('./repository');
    const result = await renameTemplate(
      'alice',
      '01HZX5G5KJDS9HQRYK8E5T0XXX',
      'X'
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('not-found');
  });

  it('deleteTemplate removes the row', async () => {
    const { saveTemplate, deleteTemplate, getTemplate } = await import(
      './repository'
    );
    const created = await saveTemplate('alice', sampleInput);
    if (!created.ok) return;
    await deleteTemplate('alice', created.template.id);
    const fetched = await getTemplate('alice', created.template.id);
    expect(fetched).toBeNull();
  });

  it('deleteTemplate on a missing id is a no-op', async () => {
    const { deleteTemplate } = await import('./repository');
    await expect(
      deleteTemplate('alice', '01HZX5G5KJDS9HQRYK8E5T0XXX')
    ).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run, expect module-not-found failures**

Run: `pnpm test lib/templates/repository.test.ts`

- [ ] **Step 3: Implement the repository**

Create `lib/templates/repository.ts`:

```ts
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { template, type Template } from '@/db/schema/template';
import { generateUid } from '@/lib/journal/uid';
import type { TemplateInput } from './schema';

export type SaveResult =
  | { ok: true; template: Template }
  | { ok: false; reason: 'name-conflict' };

export type RenameResult =
  | { ok: true }
  | { ok: false; reason: 'name-conflict' | 'not-found' };

export const listTemplates = async (userId: string): Promise<Template[]> =>
  db
    .select()
    .from(template)
    .where(eq(template.userId, userId))
    .orderBy(sql`lower(${template.name})`)
    .all();

export const getTemplate = async (
  userId: string,
  id: string
): Promise<Template | null> => {
  const row = db
    .select()
    .from(template)
    .where(and(eq(template.userId, userId), eq(template.id, id)))
    .get();
  return row ?? null;
};

const findByName = (userId: string, name: string): Template | null =>
  db
    .select()
    .from(template)
    .where(and(eq(template.userId, userId), eq(template.name, name)))
    .get() ?? null;

export const saveTemplate = async (
  userId: string,
  input: TemplateInput,
  opts: { overwrite?: boolean } = {}
): Promise<SaveResult> => {
  const existing = findByName(userId, input.name);
  if (existing) {
    if (!opts.overwrite) return { ok: false, reason: 'name-conflict' };
    const updated = db
      .update(template)
      .set({ draft: input.draft, updatedAt: new Date() })
      .where(and(eq(template.userId, userId), eq(template.id, existing.id)))
      .returning()
      .get();
    return { ok: true, template: updated };
  }
  try {
    const inserted = db
      .insert(template)
      .values({
        id: generateUid(),
        userId,
        name: input.name,
        draft: input.draft,
      })
      .returning()
      .get();
    return { ok: true, template: inserted };
  } catch (e) {
    if (
      e instanceof Error &&
      /UNIQUE constraint failed.*template_user_name/i.test(e.message)
    ) {
      return { ok: false, reason: 'name-conflict' };
    }
    throw e;
  }
};

export const renameTemplate = async (
  userId: string,
  id: string,
  name: string
): Promise<RenameResult> => {
  const owned = db
    .select({ id: template.id })
    .from(template)
    .where(and(eq(template.userId, userId), eq(template.id, id)))
    .get();
  if (!owned) return { ok: false, reason: 'not-found' };
  try {
    db.update(template)
      .set({ name, updatedAt: new Date() })
      .where(and(eq(template.userId, userId), eq(template.id, id)))
      .run();
    return { ok: true };
  } catch (e) {
    if (
      e instanceof Error &&
      /UNIQUE constraint failed.*template_user_name/i.test(e.message)
    ) {
      return { ok: false, reason: 'name-conflict' };
    }
    throw e;
  }
};

export const deleteTemplate = async (
  userId: string,
  id: string
): Promise<void> => {
  db.delete(template)
    .where(and(eq(template.userId, userId), eq(template.id, id)))
    .run();
};
```

- [ ] **Step 4: Run tests, expect 8 passed**

Run: `pnpm test lib/templates/repository.test.ts`
Expected: 8 tests pass.

- [ ] **Step 5: Run full suite**

Run: `pnpm test`
Expected: 72 tests pass.

- [ ] **Step 6: Commit**

```bash
git add lib/templates/repository.ts lib/templates/repository.test.ts
git commit -m "feat(templates): repository (list, get, save, rename, delete)"
```

---

## Task 5 — `db:push` to apply the new table

This is a manual schema push since the project uses `drizzle-kit push`, not tracked migrations. The local dev DB lives at `data/db.sqlite`.

**Files:**

- Modify: `data/db.sqlite` (out of git; runtime only)

- [ ] **Step 1: Apply the schema push**

Run:

```bash
pnpm db:push
```

Expected output: drizzle-kit detects the new `template` table and adds it. No interactive prompts since it's an additive change.

- [ ] **Step 2: Verify the table exists**

Run:

```bash
sqlite3 data/db.sqlite ".schema template"
```

Expected: the `CREATE TABLE template …` definition prints.

- [ ] **Step 3: No commit**

Schema push affects local DB only; nothing to commit. Note in the implementation notes that `pnpm db:push` is needed in deployed environments after this PR merges.

---

## Task 6 — Refactor: move Phase 4.1 transactions code into `features/transactions/`

Pure relocation. **Zero behavior change.** All 72 existing tests must still pass after this task.

**Files:**

- Move: `app/transactions/TransactionTable.tsx` → `features/transactions/TransactionTable.tsx`
- Move: `app/transactions/Filters.tsx` → `features/transactions/Filters.tsx`
- Move: `app/transactions/new/TransactionForm.tsx` → `features/transactions/TransactionForm.tsx`
- Consolidate: `app/transactions/actions.ts`, `app/transactions/new/actions.ts`, `app/transactions/[uid]/edit/actions.ts` → `features/transactions/actions.ts`
- Create: `features/transactions/index.ts` (barrel)
- Modify import sites: `app/transactions/page.tsx`, `app/transactions/new/page.tsx`, `app/transactions/[uid]/edit/page.tsx`

- [ ] **Step 1: Move the three component files**

Run:

```bash
mkdir -p features/transactions
git mv app/transactions/TransactionTable.tsx features/transactions/TransactionTable.tsx
git mv app/transactions/Filters.tsx features/transactions/Filters.tsx
git mv app/transactions/new/TransactionForm.tsx features/transactions/TransactionForm.tsx
```

- [ ] **Step 2: Fix imports inside the moved files**

In each moved file, find any `from './actions'` or relative imports to siblings and update:

- `TransactionTable.tsx`: `from './actions'` → `from './actions'` (no change needed once `actions.ts` is in the same `features/transactions/` dir; will be addressed in Step 3).
- `Filters.tsx`: any relative imports to `app/transactions/...` → adjust to `@/...` or relative.
- `TransactionForm.tsx`: `from './actions'` → will become `from './actions'` after consolidation in Step 3. If currently importing `TransactionActionState` from `./actions`, that works because the consolidated file (Step 3) also lives in the same directory.

Read each file and adjust manually; the pattern is: any `from '@/app/transactions/...'` becomes `from '@/features/transactions/...'` (rare), and any `from './...'` referring to a sibling that also moved stays as `from './...'`.

- [ ] **Step 3: Consolidate the three action files**

Read each one:

```bash
cat app/transactions/actions.ts
cat app/transactions/new/actions.ts
cat app/transactions/\[uid\]/edit/actions.ts
```

Create `features/transactions/actions.ts` with the union of their content, starting with `'use server';`. Exports:

- `TransactionActionState` (the discriminated-union type — currently exported from `app/transactions/new/actions.ts`).
- `createTransactionAction` (from `new/actions.ts`).
- `updateTransactionAction` (from `[uid]/edit/actions.ts`).
- `deleteTransactionAction` (from `actions.ts`).
- Any `DeleteResult` type from `actions.ts`, if exported.

Then delete the three old action files:

```bash
git rm app/transactions/actions.ts app/transactions/new/actions.ts app/transactions/\[uid\]/edit/actions.ts
```

- [ ] **Step 4: Update import sites in the page files**

Open `app/transactions/page.tsx`. Change:

- `from './TransactionTable'` → `from '@/features/transactions/TransactionTable'`
- `from './Filters'` → `from '@/features/transactions/Filters'`
- Any `from './actions'` → `from '@/features/transactions/actions'`

Open `app/transactions/new/page.tsx`. Change:

- `from './TransactionForm'` → `from '@/features/transactions/TransactionForm'`
- Any `from './actions'` → `from '@/features/transactions/actions'`

Open `app/transactions/[uid]/edit/page.tsx`. Change:

- `from '@/app/transactions/new/TransactionForm'` → `from '@/features/transactions/TransactionForm'`
- `from '@/app/transactions/new/actions'` → `from '@/features/transactions/actions'`
- `from './actions'` → `from '@/features/transactions/actions'`

- [ ] **Step 5: Create the barrel**

Create `features/transactions/index.ts`:

```ts
export { default as TransactionForm } from './TransactionForm';
export { default as TransactionTable } from './TransactionTable';
export { default as Filters } from './Filters';
export * from './actions';
```

- [ ] **Step 6: Type-check**

Run: `pnpm type-check`
Expected: clean. If there are import errors, fix them by adjusting paths.

- [ ] **Step 7: Run full suite**

Run: `pnpm test`
Expected: 72 tests still pass.

- [ ] **Step 8: Lint**

Run: `pnpm lint`
Expected: clean.

- [ ] **Step 9: Commit**

```bash
git add features/transactions app/transactions
git commit -m "refactor(transactions): move components into features/transactions/"
```

---

## Task 7 — Extract top-level feature components

Create `Transactions.tsx`, `NewTransaction.tsx`, `EditTransaction.tsx` from the bodies of the three `page.tsx` files. The pages become one-liners. Still zero new behavior.

**Files:**

- Create: `features/transactions/Transactions.tsx`, `NewTransaction.tsx`, `EditTransaction.tsx`
- Modify: `app/transactions/page.tsx`, `app/transactions/new/page.tsx`, `app/transactions/[uid]/edit/page.tsx`
- Modify: `features/transactions/index.ts`

- [ ] **Step 1: Read the current pages**

```bash
cat app/transactions/page.tsx
cat app/transactions/new/page.tsx
cat app/transactions/\[uid\]/edit/page.tsx
```

- [ ] **Step 2: Create `features/transactions/Transactions.tsx`**

Move the body of `app/transactions/page.tsx` into `features/transactions/Transactions.tsx`. Rename the default export to a named `Transactions` component. Take `searchParams` as a Promise prop, just like the page did.

```tsx
import 'server-only';
import { unstable_cache } from 'next/cache';
import { requireUser } from '@/lib/auth/require-user';
import { resolveUserJournal, getJournalCacheTag } from '@/lib/journals';
import { parseJournal, type Transaction } from '@/lib/journal/parser';
import TransactionTable from './TransactionTable';
import Filters from './Filters';
import Help from '@/components/Help';

type SearchParams = {
  start?: string;
  end?: string;
  account?: string;
  payee?: string;
  q?: string;
};

const buildLoader = (tag: string) =>
  unstable_cache(
    async (userId: string): Promise<Transaction[]> => {
      const { mainPath } = await resolveUserJournal(userId);
      const journal = await parseJournal(mainPath);
      return journal.transactions;
    },
    ['journal-transactions', tag],
    { revalidate: 60, tags: [tag] }
  );

const loadTransactions = (userId: string) =>
  buildLoader(getJournalCacheTag(userId))(userId);

const applyFilters = (txs: Transaction[], params: SearchParams) => {
  const start = params.start ? Date.parse(params.start) : null;
  const end = params.end ? Date.parse(params.end) : null;
  const account = params.account?.toLowerCase().trim();
  const payee = params.payee?.toLowerCase().trim();
  const q = params.q?.toLowerCase().trim();
  return txs.filter((t) => {
    const ts = Date.parse(t.date);
    if (start !== null && ts < start) return false;
    if (end !== null && ts > end) return false;
    if (payee && t.payee.toLowerCase() !== payee) return false;
    if (
      account &&
      !t.postings.some((p) => p.account.toLowerCase().includes(account))
    )
      return false;
    if (q) {
      const hay = [t.payee, t.note ?? '', ...t.postings.map((p) => p.account)]
        .join(' ')
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
};

const Transactions = async ({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) => {
  const user = await requireUser();
  const params = await searchParams;
  const all = await loadTransactions(user.id);
  const filtered = applyFilters(all, params).sort((a, b) =>
    b.date.localeCompare(a.date)
  );
  const payees = [...new Set(all.map((t) => t.payee))].sort();
  const accounts = [
    ...new Set(all.flatMap((t) => t.postings.map((p) => p.account))),
  ].sort();

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center gap-2">
        <h1 className="text-2xl font-semibold">Transactions</h1>
        <Help label="About transactions">
          All edits and deletes from this list rewrite the source file in place.
        </Help>
      </header>
      <Filters
        payees={payees}
        accounts={accounts}
        start={params.start}
        end={params.end}
      />
      <TransactionTable transactions={filtered} />
    </div>
  );
};

export default Transactions;
```

- [ ] **Step 3: Slim down `app/transactions/page.tsx`**

```tsx
import Transactions from '@/features/transactions/Transactions';

export const dynamic = 'force-dynamic';

type SearchParams = {
  start?: string;
  end?: string;
  account?: string;
  payee?: string;
  q?: string;
};

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  return <Transactions searchParams={searchParams} />;
}
```

- [ ] **Step 4: Create `features/transactions/NewTransaction.tsx`**

Move the body of `app/transactions/new/page.tsx`. Keep the existing imports — `getAccountSuggestions`, `getPayeeSuggestions`, `getDefaultCurrency`, and the form component.

```tsx
import TransactionForm from './TransactionForm';
import { createTransactionAction } from './actions';
import Help from '@/components/Help';
import {
  getAccountSuggestions,
  getPayeeSuggestions,
} from '@/lib/transactions/suggestions';
import getDefaultCurrency from '@/utils/getDefaultCurrency';

const NewTransaction = async () => {
  const [accounts, payees] = await Promise.all([
    getAccountSuggestions(),
    getPayeeSuggestions(),
  ]);
  const defaultCurrency = getDefaultCurrency() ?? 'USD';

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            Add transaction
          </h1>
          <Help label="About adding transactions">
            Appends a balanced posting block to your journal&apos;s main file.
            All postings must sum to zero per currency, or leave exactly one
            amount blank to let ledger auto-balance it.
          </Help>
        </div>
        <p className="mt-1 text-sm text-muted">
          A new entry is appended to your journal file. Reports refresh
          immediately.
        </p>
      </div>

      <TransactionForm
        accounts={accounts}
        payees={payees}
        defaultCurrency={defaultCurrency}
        submitAction={createTransactionAction}
      />
    </div>
  );
};

export default NewTransaction;
```

- [ ] **Step 5: Slim down `app/transactions/new/page.tsx`**

```tsx
import NewTransaction from '@/features/transactions/NewTransaction';

export const dynamic = 'force-dynamic';

export default async function NewTransactionPage() {
  return <NewTransaction />;
}
```

- [ ] **Step 6: Create `features/transactions/EditTransaction.tsx`**

Move the body of `app/transactions/[uid]/edit/page.tsx`. Takes `uid: string`.

```tsx
import 'server-only';
import { notFound } from 'next/navigation';
import { updateTransactionAction } from './actions';
import TransactionForm from './TransactionForm';
import { requireUser } from '@/lib/auth/require-user';
import { fingerprintDraft } from '@/lib/journal/fingerprint';
import { parseJournal } from '@/lib/journal/parser';
import { resolveUserJournal } from '@/lib/journals';
import {
  getAccountSuggestions,
  getPayeeSuggestions,
} from '@/lib/transactions/suggestions';
import getDefaultCurrency from '@/utils/getDefaultCurrency';

const EditTransaction = async ({ uid }: { uid: string }) => {
  const user = await requireUser();
  const { mainPath } = await resolveUserJournal(user.id);
  const journal = await parseJournal(mainPath);
  const tx = journal.transactions.find((t) => t.uid === uid);
  if (!tx) notFound();

  const defaultCurrency = getDefaultCurrency() ?? 'USD';
  const initialDraft = {
    date: tx.date,
    payee: tx.payee,
    status: tx.status,
    note: tx.note ?? undefined,
    uid: tx.uid ?? undefined,
    postings: tx.postings.map((p) => ({
      account: p.account,
      amount: p.amount,
      currency: p.currency || defaultCurrency,
    })),
  };
  const expectedFingerprint = fingerprintDraft(initialDraft);
  const [accounts, payees] = await Promise.all([
    getAccountSuggestions(),
    getPayeeSuggestions(),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Edit transaction</h1>
      <TransactionForm
        mode="edit"
        initialDraft={initialDraft}
        uid={uid}
        expectedFingerprint={expectedFingerprint}
        submitAction={updateTransactionAction}
        accounts={accounts}
        payees={payees}
        defaultCurrency={defaultCurrency}
      />
    </div>
  );
};

export default EditTransaction;
```

- [ ] **Step 7: Slim down `app/transactions/[uid]/edit/page.tsx`**

```tsx
import EditTransaction from '@/features/transactions/EditTransaction';

export const dynamic = 'force-dynamic';

export default async function EditTransactionPage({
  params,
}: {
  params: Promise<{ uid: string }>;
}) {
  const { uid } = await params;
  return <EditTransaction uid={uid} />;
}
```

- [ ] **Step 8: Update the barrel**

`features/transactions/index.ts`:

```ts
export { default as Transactions } from './Transactions';
export { default as NewTransaction } from './NewTransaction';
export { default as EditTransaction } from './EditTransaction';
export { default as TransactionForm } from './TransactionForm';
export { default as TransactionTable } from './TransactionTable';
export { default as Filters } from './Filters';
export * from './actions';
```

- [ ] **Step 9: Type-check, test, lint**

Run:

```bash
pnpm type-check && pnpm test && pnpm lint
```

Expected: 72 tests pass, clean type-check, clean lint.

- [ ] **Step 10: Commit**

```bash
git add features/transactions app/transactions
git commit -m "refactor(transactions): extract top-level feature components"
```

---

## Task 8 — `features/templates/actions.ts` (server actions)

**Files:**

- Create: `features/templates/actions.ts`

- [ ] **Step 1: Write the action file**

Create `features/templates/actions.ts`:

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/require-user';
import {
  saveTemplate,
  renameTemplate,
  deleteTemplate,
  type SaveResult,
  type RenameResult,
} from '@/lib/templates/repository';
import {
  templateInputSchema,
  templateNameSchema,
} from '@/lib/templates/schema';

export type SaveTemplateResult =
  | { ok: true; templateId: string }
  | {
      ok: false;
      reason: 'name-conflict' | 'invalid';
      message?: string;
      fieldErrors?: Record<string, string>;
    };

export const saveTemplateAction = async (
  input: unknown,
  opts: { overwrite?: boolean } = {}
): Promise<SaveTemplateResult> => {
  const user = await requireUser();
  const parsed = templateInputSchema.safeParse(input);
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
  const result: SaveResult = await saveTemplate(user.id, parsed.data, opts);
  if (!result.ok) {
    return {
      ok: false,
      reason: 'name-conflict',
      message: `A template named "${parsed.data.name}" already exists.`,
    };
  }
  revalidatePath('/templates');
  return { ok: true, templateId: result.template.id };
};

export type RenameTemplateResult =
  | { ok: true }
  | {
      ok: false;
      reason: 'name-conflict' | 'not-found' | 'invalid';
      message?: string;
      fieldErrors?: Record<string, string>;
    };

export const renameTemplateAction = async (
  id: string,
  name: unknown
): Promise<RenameTemplateResult> => {
  const user = await requireUser();
  const parsed = templateNameSchema.safeParse(name);
  if (!parsed.success) {
    return {
      ok: false,
      reason: 'invalid',
      message: 'Validation failed.',
      fieldErrors: { name: parsed.error.issues[0]?.message ?? 'Invalid name' },
    };
  }
  const result: RenameResult = await renameTemplate(user.id, id, parsed.data);
  if (!result.ok) {
    return {
      ok: false,
      reason: result.reason,
      message:
        result.reason === 'name-conflict'
          ? `A template named "${parsed.data}" already exists.`
          : 'Template not found.',
    };
  }
  revalidatePath('/templates');
  return { ok: true };
};

export type DeleteTemplateResult = { ok: true } | { ok: false; message: string };

export const deleteTemplateAction = async (
  id: string
): Promise<DeleteTemplateResult> => {
  const user = await requireUser();
  await deleteTemplate(user.id, id);
  revalidatePath('/templates');
  return { ok: true };
};
```

- [ ] **Step 2: Type-check**

Run: `pnpm type-check`
Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add features/templates/actions.ts
git commit -m "feat(templates): server actions (save, rename, delete)"
```

---

## Task 9 — `/templates` page (list, rename, delete)

**Files:**

- Create: `features/templates/Templates.tsx`, `TemplatesList.tsx`, `RenameDialog.tsx`, `index.ts`
- Create: `app/templates/page.tsx`, `app/templates/loading.tsx`
- Modify: `components/nav/config.ts`

- [ ] **Step 1: Create the rename dialog**

`features/templates/RenameDialog.tsx`:

```tsx
'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { renameTemplateAction } from './actions';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templateId: string;
  initialName: string;
};

const RenameDialog = ({ open, onOpenChange, templateId, initialName }: Props) => {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const onSubmit = () => {
    setError(null);
    startTransition(async () => {
      const result = await renameTemplateAction(templateId, name);
      if (result.ok) {
        toast.success('Template renamed');
        onOpenChange(false);
        router.refresh();
      } else {
        setError(result.message ?? 'Could not rename');
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename template</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Label htmlFor="rename-name">Name</Label>
          <Input
            id="rename-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
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
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={isPending || !name.trim()}>
            {isPending ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default RenameDialog;
```

- [ ] **Step 2: Create the list component**

`features/templates/TemplatesList.tsx`:

```tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { MoreHorizontal, Bookmark } from 'lucide-react';
import RenameDialog from './RenameDialog';
import { deleteTemplateAction } from './actions';
import ConfirmDialog from '@/components/ConfirmDialog';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { Template } from '@/db/schema/template';
import { cn } from '@/lib/utils';

type Props = { templates: Template[] };

const relativeTime = (ts: Date) => {
  const diff = Date.now() - ts.getTime();
  const day = 24 * 60 * 60 * 1000;
  const days = Math.floor(diff / day);
  if (days < 1) return 'today';
  if (days < 2) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} mo. ago`;
  const years = Math.floor(days / 365);
  return `${years} yr. ago`;
};

const TemplatesList = ({ templates }: Props) => {
  const router = useRouter();
  const [renameTarget, setRenameTarget] = useState<Template | null>(null);

  if (templates.length === 0) {
    return (
      <div className="rounded-md border border-border p-8 text-center text-sm text-muted-foreground">
        <Bookmark className="mx-auto mb-2 h-6 w-6 opacity-50" />
        <div className="font-medium text-foreground">No templates yet</div>
        <p className="mt-1">
          Save reusable transaction shapes from the{' '}
          <Link
            href="/transactions/new"
            className={cn(buttonVariants({ variant: 'link', size: 'sm' }))}
          >
            Add transaction
          </Link>{' '}
          page or any existing row.
        </p>
      </div>
    );
  }

  const onDelete = async (t: Template) => {
    const res = await deleteTemplateAction(t.id);
    if (res.ok) {
      toast.success(`Deleted "${t.name}"`);
    } else {
      toast.error(res.message);
    }
    router.refresh();
  };

  return (
    <>
      <table className="w-full text-left text-sm">
        <thead className="text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="py-2">Name</th>
            <th className="py-2">Payee</th>
            <th className="py-2">Accounts</th>
            <th className="py-2">Updated</th>
            <th className="py-2 w-8"></th>
          </tr>
        </thead>
        <tbody>
          {templates.map((t) => (
            <tr key={t.id} className="border-t border-border">
              <td className="py-2">
                <Link
                  href={`/transactions/new?template=${t.id}`}
                  className="font-medium hover:underline"
                >
                  {t.name}
                </Link>
              </td>
              <td className="py-2 text-muted-foreground">{t.draft.payee}</td>
              <td className="py-2 text-muted-foreground">
                {t.draft.postings
                  .slice(0, 2)
                  .map((p) => p.account)
                  .join(' → ')}
                {t.draft.postings.length > 2 ? ' …' : ''}
              </td>
              <td
                className="py-2 text-muted-foreground"
                title={t.updatedAt.toISOString()}
              >
                {relativeTime(t.updatedAt)}
              </td>
              <td className="py-2 text-right">
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button variant="ghost" size="icon-sm">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    }
                  />
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() =>
                        router.push(`/transactions/new?template=${t.id}`)
                      }
                    >
                      Use
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setRenameTarget(t)}>
                      Rename
                    </DropdownMenuItem>
                    <ConfirmDialog
                      title="Delete template?"
                      description={
                        <>
                          Delete <strong>{t.name}</strong>? This won&apos;t
                          affect any transactions you&apos;ve already created
                          from it.
                        </>
                      }
                      confirmLabel="Delete"
                      variant="destructive"
                      onConfirm={() => onDelete(t)}
                    >
                      <DropdownMenuItem
                        variant="destructive"
                        onSelect={(e) => e.preventDefault()}
                      >
                        Delete
                      </DropdownMenuItem>
                    </ConfirmDialog>
                  </DropdownMenuContent>
                </DropdownMenu>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {renameTarget && (
        <RenameDialog
          open
          onOpenChange={(open) => !open && setRenameTarget(null)}
          templateId={renameTarget.id}
          initialName={renameTarget.name}
        />
      )}
    </>
  );
};

export default TemplatesList;
```

- [ ] **Step 3: Create the page server component**

`features/templates/Templates.tsx`:

```tsx
import 'server-only';
import Link from 'next/link';
import { requireUser } from '@/lib/auth/require-user';
import { listTemplates } from '@/lib/templates/repository';
import { buttonVariants } from '@/components/ui/button';
import Help from '@/components/Help';
import { cn } from '@/lib/utils';
import TemplatesList from './TemplatesList';

const Templates = async () => {
  const user = await requireUser();
  const templates = await listTemplates(user.id);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold">Templates</h1>
          <Help label="About templates">
            Reusable transaction shapes. Use a template to prefill the
            new-transaction form.
          </Help>
        </div>
        <Link
          href="/transactions/new"
          className={cn(buttonVariants({ size: 'sm' }))}
        >
          + New template
        </Link>
      </header>
      <TemplatesList templates={templates} />
    </div>
  );
};

export default Templates;
```

- [ ] **Step 4: Barrel**

`features/templates/index.ts`:

```ts
export { default as Templates } from './Templates';
export { default as TemplatesList } from './TemplatesList';
export { default as RenameDialog } from './RenameDialog';
export * from './actions';
```

- [ ] **Step 5: Route shells**

`app/templates/page.tsx`:

```tsx
import Templates from '@/features/templates/Templates';

export const dynamic = 'force-dynamic';

export default async function TemplatesPage() {
  return <Templates />;
}
```

`app/templates/loading.tsx`:

```tsx
import PageSkeleton from '@/components/PageSkeleton';

export default function Loading() {
  return <PageSkeleton rows={6} />;
}
```

- [ ] **Step 6: Nav config entry**

In `components/nav/config.ts`, import `Bookmark` from `lucide-react` (add alphabetically). In the `journal` section's items array, insert as the SECOND item (after Add transaction, before Import):

```ts
{
  id: 'templates',
  title: 'Templates',
  href: '/templates',
  match: 'exact',
  description: 'Saved transaction shapes you can reuse.',
  icon: Bookmark,
  keywords: ['template', 'recurring', 'save', 'reuse'],
},
```

- [ ] **Step 7: Type-check, build**

Run: `pnpm type-check && pnpm build 2>&1 | tail -15`

Expected: type-check clean. Build compiles (env-dependent runtime evaluation may fail without a populated DB — that's OK, we only need compile success).

- [ ] **Step 8: Commit**

```bash
git add features/templates app/templates components/nav/config.ts
git commit -m "feat(templates): list page with rename and delete"
```

---

## Task 10 — `SaveAsTemplateButton` + dialog

**Files:**

- Create: `features/templates/SaveAsTemplateButton.tsx`
- Modify: `features/transactions/TransactionForm.tsx`

- [ ] **Step 1: Create the button + dialog**

`features/templates/SaveAsTemplateButton.tsx`:

```tsx
'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { BookmarkPlus } from 'lucide-react';
import { saveTemplateAction } from './actions';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { TemplateDraft } from '@/lib/templates/schema';

type Props = {
  draft: TemplateDraft;
  disabled?: boolean;
  variant?: 'button' | 'menu-item';
};

const SaveAsTemplateButton = ({
  draft,
  disabled = false,
  variant = 'button',
}: Props) => {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(draft.payee);
  const [conflict, setConflict] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const reset = () => {
    setOpen(false);
    setName(draft.payee);
    setConflict(false);
    setError(null);
  };

  const submit = (overwrite: boolean) => {
    setError(null);
    startTransition(async () => {
      const result = await saveTemplateAction(
        { name, draft },
        { overwrite }
      );
      if (result.ok) {
        toast.success('Template saved', {
          action: {
            label: 'View',
            onClick: () => router.push('/templates'),
          },
        });
        reset();
      } else if (result.reason === 'name-conflict' && !overwrite) {
        setConflict(true);
      } else {
        setError(result.message ?? 'Could not save');
      }
    });
  };

  const trigger =
    variant === 'menu-item' ? (
      <button
        type="button"
        className="w-full text-left"
        onClick={() => setOpen(true)}
        disabled={disabled}
      >
        Save as template
      </button>
    ) : (
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        disabled={disabled}
      >
        <BookmarkPlus className="h-4 w-4" />
        Save as template
      </Button>
    );

  return (
    <>
      {trigger}
      <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : reset())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save as template</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="text-sm text-muted-foreground">
              Payee — {draft.payee}, {draft.postings.length} postings
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="tpl-name">Name</Label>
              <Input
                id="tpl-name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (conflict) setConflict(false);
                }}
                disabled={isPending}
              />
            </div>
            {conflict && (
              <Alert variant="destructive">
                <AlertDescription>
                  A template named &quot;{name}&quot; already exists.
                </AlertDescription>
              </Alert>
            )}
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={reset}
              disabled={isPending}
            >
              Cancel
            </Button>
            {conflict ? (
              <Button
                variant="destructive"
                onClick={() => submit(true)}
                disabled={isPending}
              >
                Overwrite
              </Button>
            ) : (
              <Button
                onClick={() => submit(false)}
                disabled={isPending || !name.trim()}
              >
                {isPending ? 'Saving…' : 'Save'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default SaveAsTemplateButton;
```

- [ ] **Step 2: Wire into `TransactionForm`**

Open `features/transactions/TransactionForm.tsx`. At the top, add:

```tsx
import SaveAsTemplateButton from '@/features/templates/SaveAsTemplateButton';
import type { TemplateDraft } from '@/lib/templates/schema';
```

Inside the form component, derive a `templateDraft` from current state. Insert this block just before the existing `const draftJson = JSON.stringify({...})`:

```tsx
const templateDraft: TemplateDraft = {
  payee: payee.trim() || '—',
  status,
  note: note.trim() || undefined,
  postings: postings.map((p) => ({
    account: p.account.trim(),
    amount: p.amount.trim(),
    currency: p.currency.trim(),
  })),
};
const canSaveTemplate =
  payee.trim() !== '' &&
  postings.filter((p) => p.account.trim() !== '').length >= 2;
```

Find the footer area where the submit `<Button>` lives. The current shape is approximately:

```tsx
<div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
  <span className="text-xs text-muted-foreground">…</span>
  <Button type="submit" disabled={!canSubmit}>…</Button>
</div>
```

Change it to:

```tsx
<div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
  <span className="text-xs text-muted-foreground">
    {mode === 'edit'
      ? 'Rewrites the original block in its source file.'
      : "Appended to your journal's main file."}
  </span>
  <div className="flex items-center gap-2">
    <SaveAsTemplateButton
      draft={templateDraft}
      disabled={!canSaveTemplate}
    />
    <Button type="submit" disabled={!canSubmit}>
      {isPending
        ? 'Saving…'
        : mode === 'edit'
          ? 'Save changes'
          : 'Add transaction'}
    </Button>
  </div>
</div>
```

- [ ] **Step 3: Type-check, build**

Run: `pnpm type-check && pnpm build 2>&1 | tail -8`
Expected: type-check clean. Build compiles.

- [ ] **Step 4: Commit**

```bash
git add features/templates/SaveAsTemplateButton.tsx features/transactions/TransactionForm.tsx
git commit -m "feat(templates): SaveAsTemplate button on transaction form"
```

---

## Task 11 — `RowActions` dropdown (replaces inline Edit/Delete in `TransactionTable`)

**Files:**

- Modify: `features/templates/SaveAsTemplateButton.tsx` (extract the dialog into a separate exported component)
- Create: `features/transactions/RowActions.tsx`
- Modify: `features/transactions/TransactionTable.tsx`

- [ ] **Step 1: Refactor `SaveAsTemplateButton` to also export a controlled `SaveAsTemplateDialog`**

Open `features/templates/SaveAsTemplateButton.tsx`. Extract the Dialog body into a separate component, exported alongside:

```tsx
export const SaveAsTemplateDialog = ({
  open,
  onOpenChange,
  draft,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draft: TemplateDraft;
}) => {
  const router = useRouter();
  const [name, setName] = useState(draft.payee);
  const [conflict, setConflict] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const reset = () => {
    onOpenChange(false);
    setName(draft.payee);
    setConflict(false);
    setError(null);
  };

  const submit = (overwrite: boolean) => {
    setError(null);
    startTransition(async () => {
      const result = await saveTemplateAction({ name, draft }, { overwrite });
      if (result.ok) {
        toast.success('Template saved', {
          action: { label: 'View', onClick: () => router.push('/templates') },
        });
        reset();
      } else if (result.reason === 'name-conflict' && !overwrite) {
        setConflict(true);
      } else {
        setError(result.message ?? 'Could not save');
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : reset())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save as template</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="text-sm text-muted-foreground">
            Payee — {draft.payee}, {draft.postings.length} postings
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="tpl-name">Name</Label>
            <Input
              id="tpl-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (conflict) setConflict(false);
              }}
              disabled={isPending}
            />
          </div>
          {conflict && (
            <Alert variant="destructive">
              <AlertDescription>
                A template named &quot;{name}&quot; already exists.
              </AlertDescription>
            </Alert>
          )}
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={reset} disabled={isPending}>
            Cancel
          </Button>
          {conflict ? (
            <Button
              variant="destructive"
              onClick={() => submit(true)}
              disabled={isPending}
            >
              Overwrite
            </Button>
          ) : (
            <Button
              onClick={() => submit(false)}
              disabled={isPending || !name.trim()}
            >
              {isPending ? 'Saving…' : 'Save'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
```

Then refactor the default `SaveAsTemplateButton` component to be a thin wrapper that owns its open state and renders the trigger + `<SaveAsTemplateDialog>`:

```tsx
const SaveAsTemplateButton = ({ draft, disabled = false }: Props) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        disabled={disabled}
      >
        <BookmarkPlus className="h-4 w-4" />
        Save as template
      </Button>
      <SaveAsTemplateDialog open={open} onOpenChange={setOpen} draft={draft} />
    </>
  );
};

export default SaveAsTemplateButton;
```

- [ ] **Step 2: Create `RowActions.tsx` using the new `SaveAsTemplateDialog`**

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  MoreHorizontal,
  Pencil,
  Trash2,
  BookmarkPlus,
} from 'lucide-react';
import { SaveAsTemplateDialog } from '@/features/templates/SaveAsTemplateButton';
import { deleteTransactionAction } from './actions';
import ConfirmDialog from '@/components/ConfirmDialog';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { Transaction } from '@/lib/journal/parser';
import type { TemplateDraft } from '@/lib/templates/schema';

type Props = { transaction: Transaction };

const toTemplateDraft = (t: Transaction): TemplateDraft => ({
  payee: t.payee,
  status: t.status,
  note: t.note ?? undefined,
  postings: t.postings.map((p) => ({
    account: p.account,
    amount: p.amount,
    currency: p.currency,
  })),
});

const RowActions = ({ transaction: t }: Props) => {
  const router = useRouter();
  const [saveOpen, setSaveOpen] = useState(false);

  const onDelete = async () => {
    const res = await deleteTransactionAction(t.uid!, t.fingerprint);
    if (res.ok) toast.success('Transaction deleted');
    else toast.error(res.message);
    router.refresh();
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="ghost" size="icon-sm">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          }
        />
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onClick={() => router.push(`/transactions/${t.uid}/edit`)}
          >
            <Pencil className="h-4 w-4" />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setSaveOpen(true)}>
            <BookmarkPlus className="h-4 w-4" />
            Save as template
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <ConfirmDialog
            title="Delete transaction?"
            description="This will permanently remove the transaction from the journal."
            confirmLabel="Delete"
            variant="destructive"
            onConfirm={onDelete}
          >
            <DropdownMenuItem
              variant="destructive"
              onSelect={(e) => e.preventDefault()}
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </ConfirmDialog>
        </DropdownMenuContent>
      </DropdownMenu>
      <SaveAsTemplateDialog
        open={saveOpen}
        onOpenChange={setSaveOpen}
        draft={toTemplateDraft(t)}
      />
    </>
  );
};

export default RowActions;
```

- [ ] **Step 3: Replace inline buttons in `TransactionTable`**

Open `features/transactions/TransactionTable.tsx`. Find the actions cell — currently has Edit `<Link>` + `<ConfirmDialog>` wrapping Delete `<Button>`. Replace the whole cell content with:

```tsx
<td className="py-2 text-right">
  {t.uid ? (
    <RowActions transaction={t} />
  ) : (
    <span
      className="text-xs text-muted-foreground"
      title="Re-import the journal to enable editing for this transaction"
    >
      no uid
    </span>
  )}
</td>
```

Add `import RowActions from './RowActions';` at the top. Remove the now-unused imports of `Pencil`, `Trash2`, `ConfirmDialog`, `buttonVariants`, `Link` (if unused elsewhere in the file), and the `onDelete` helper.

- [ ] **Step 4: Type-check, test, lint**

Run: `pnpm type-check && pnpm test && pnpm lint`
Expected: 72 tests pass; clean type-check + lint.

- [ ] **Step 5: Commit**

```bash
git add features/templates/SaveAsTemplateButton.tsx features/transactions/RowActions.tsx features/transactions/TransactionTable.tsx
git commit -m "feat(transactions): row dropdown with Edit / Save as template / Delete"
```

---

## Task 12 — `TemplatePicker` combobox + `?template=<id>` prefill

**Files:**

- Create: `features/templates/TemplatePicker.tsx`
- Modify: `features/transactions/NewTransaction.tsx`

- [ ] **Step 1: Create the picker**

`features/templates/TemplatePicker.tsx`:

```tsx
'use client';

import { useRouter } from 'next/navigation';
import Combobox from '@/components/Combobox';
import type { Template } from '@/db/schema/template';

type Props = { templates: Template[] };

const TemplatePicker = ({ templates }: Props) => {
  const router = useRouter();
  if (templates.length === 0) return null;

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">Start from template…</span>
      <div className="min-w-[260px] flex-1 max-w-md">
        <Combobox
          value=""
          onChange={(value) => {
            const t = templates.find((x) => x.name === value);
            if (t) router.push(`/transactions/new?template=${t.id}`);
          }}
          options={templates.map((t) => t.name)}
          placeholder="Pick a template"
          allowFreeText={false}
        />
      </div>
    </div>
  );
};

export default TemplatePicker;
```

- [ ] **Step 2: Extend `NewTransaction` to read `?template=<id>` and prefill**

Open `features/transactions/NewTransaction.tsx`. Rewrite to:

```tsx
import TransactionForm from './TransactionForm';
import { createTransactionAction } from './actions';
import Help from '@/components/Help';
import {
  getAccountSuggestions,
  getPayeeSuggestions,
} from '@/lib/transactions/suggestions';
import getDefaultCurrency from '@/utils/getDefaultCurrency';
import { requireUser } from '@/lib/auth/require-user';
import {
  listTemplates,
  getTemplate,
} from '@/lib/templates/repository';
import TemplatePicker from '@/features/templates/TemplatePicker';
import type { TransactionDraft } from '@/lib/transactions/schema';

const todayISO = (): string => {
  const d = new Date();
  const tzOffset = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - tzOffset).toISOString().slice(0, 10);
};

type Props = { templateId?: string };

const NewTransaction = async ({ templateId }: Props) => {
  const user = await requireUser();
  const [accounts, payees, templates] = await Promise.all([
    getAccountSuggestions(),
    getPayeeSuggestions(),
    listTemplates(user.id),
  ]);
  const defaultCurrency = getDefaultCurrency() ?? 'USD';

  let initialDraft: TransactionDraft | undefined;
  let templateMissing = false;
  if (templateId) {
    const t = await getTemplate(user.id, templateId);
    if (t) {
      initialDraft = {
        date: todayISO(),
        payee: t.draft.payee,
        status: t.draft.status,
        note: t.draft.note,
        uid: undefined,
        postings: t.draft.postings.map((p) => ({
          account: p.account,
          amount: p.amount,
          currency: p.currency || defaultCurrency,
        })),
      };
    } else {
      templateMissing = true;
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            Add transaction
          </h1>
          <Help label="About adding transactions">
            Appends a balanced posting block to your journal&apos;s main file.
            All postings must sum to zero per currency, or leave exactly one
            amount blank to let ledger auto-balance it.
          </Help>
        </div>
        <p className="mt-1 text-sm text-muted">
          A new entry is appended to your journal file. Reports refresh
          immediately.
        </p>
      </div>

      <TemplatePicker templates={templates} />

      <TransactionForm
        accounts={accounts}
        payees={payees}
        defaultCurrency={defaultCurrency}
        submitAction={createTransactionAction}
        initialDraft={initialDraft}
        templateMissing={templateMissing}
      />
    </div>
  );
};

export default NewTransaction;
```

- [ ] **Step 3: Pass `templateMissing` through `TransactionForm` and show the toast**

Open `features/transactions/TransactionForm.tsx`. Add to the `Props`:

```ts
templateMissing?: boolean;
```

In the form component, near the existing `useEffect` for success state, add:

```tsx
useEffect(() => {
  if (templateMissing) {
    toast.error('Template not found — starting from scratch');
  }
  // Run only once on mount.
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);
```

- [ ] **Step 4: Update the page shell to read `searchParams.template`**

Open `app/transactions/new/page.tsx`:

```tsx
import NewTransaction from '@/features/transactions/NewTransaction';

export const dynamic = 'force-dynamic';

type SearchParams = { template?: string };

export default async function NewTransactionPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  return <NewTransaction templateId={params.template} />;
}
```

- [ ] **Step 5: Type-check, build**

Run: `pnpm type-check && pnpm build 2>&1 | tail -8`
Expected: type-check clean. Build compiles.

- [ ] **Step 6: Commit**

```bash
git add features/templates/TemplatePicker.tsx features/transactions/NewTransaction.tsx features/transactions/TransactionForm.tsx app/transactions/new/page.tsx
git commit -m "feat(transactions): TemplatePicker and ?template=<id> prefill"
```

---

## Task 13 — Integration test

End-to-end: save template → list → use → addTransaction round-trip.

**Files:**

- Create: `lib/templates/integration.test.ts`

- [ ] **Step 1: Write the test**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import { setupTestDb, teardownTestDb, type TestDbContext } from '@/lib/test-utils/db';
import { findUidInBlock } from '@/lib/journal/uid';
import type { TemplateInput } from '@/lib/templates/schema';

describe('Phase 4.2 integration', () => {
  let ctx: TestDbContext;

  beforeEach(async () => {
    ctx = await setupTestDb('tpl-int-');
    ctx.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS "template" (
        "id" text PRIMARY KEY NOT NULL,
        "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
        "name" text NOT NULL,
        "draft" text NOT NULL,
        "createdAt" integer NOT NULL DEFAULT (unixepoch()),
        "updatedAt" integer NOT NULL DEFAULT (unixepoch())
      );
      CREATE UNIQUE INDEX IF NOT EXISTS "template_user_name" ON "template"("userId", "name");
    `);
    ctx.sqlite
      .prepare(`INSERT INTO "user" ("id","name","email") VALUES (?,?,?)`)
      .run('test-user', 'Test', 'test@example.com');
  });

  afterEach(async () => {
    await teardownTestDb(ctx);
  });

  it('save → list → use → addTransaction round-trip', async () => {
    const userId = 'test-user';
    const { saveTemplate, listTemplates, getTemplate } = await import(
      '@/lib/templates/repository'
    );
    const input: TemplateInput = {
      name: 'Lunch',
      draft: {
        payee: 'Lunch',
        status: 'none',
        postings: [
          { account: 'Expenses:Food', amount: '10', currency: 'USD' },
          { account: 'Assets:Cash', amount: '-10', currency: 'USD' },
        ],
      },
    };

    const saved = await saveTemplate(userId, input);
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;

    const list = await listTemplates(userId);
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('Lunch');

    const fetched = await getTemplate(userId, saved.template.id);
    expect(fetched?.draft.payee).toBe('Lunch');

    // Simulate the "use" flow: build an addTransaction input from the template
    const { addTransaction, getJournalDir } = await import('@/lib/journals');
    await fs.mkdir(getJournalDir(userId), { recursive: true });

    const todayISO = new Date().toISOString().slice(0, 10);
    const result = await addTransaction(userId, {
      date: todayISO,
      payee: fetched!.draft.payee,
      status: fetched!.draft.status,
      note: fetched!.draft.note,
      postings: fetched!.draft.postings,
    });
    expect(result.ok).toBe(true);

    const text = await fs.readFile(
      path.join(getJournalDir(userId), 'main.ledger'),
      'utf-8'
    );
    expect(findUidInBlock(text)).not.toBeNull();
    expect(text).toContain(todayISO);
    expect(text).toContain('Lunch');
  });
});
```

- [ ] **Step 2: Run**

Run: `pnpm test lib/templates/integration.test.ts`
Expected: 1 passed.

- [ ] **Step 3: Run full suite**

Run: `pnpm test`
Expected: 73 tests pass.

- [ ] **Step 4: Commit**

```bash
git add lib/templates/integration.test.ts
git commit -m "test(templates): integration round-trip"
```

---

## Final verification

- [ ] **Build:** `pnpm build` compiles cleanly.
- [ ] **Lint:** `pnpm lint` clean.
- [ ] **Type-check:** `pnpm type-check` clean.
- [ ] **Tests:** `pnpm test` shows 73 passing.
- [ ] **Manual smoke:**
  - Visit `/templates` → empty state shows; `[+ New template]` links to `/transactions/new`.
  - Add a transaction → "Save as template" button → dialog appears → save → toast shows.
  - Re-open the dialog with the same name → conflict alert appears with `Overwrite`.
  - Visit `/templates` → template appears in the list with relative-time updated stamp.
  - Row dropdown: Use (routes to `/transactions/new?template=<id>` and prefills); Rename (dialog, conflict path works); Delete (confirm, toast).
  - On `/transactions/new`, the "Start from template…" combobox is visible; picking a template routes with `?template=` and prefills.
  - On `/transactions` rows, the `⋯` dropdown replaces the old inline buttons; Save-as-template from a row works.

## PLAN.md Updates

After all tasks merge, in `PLAN.md` under Phase 4.2 check off:

- [x] "Save as template" on any transaction.
- [x] Templates stored in SQLite (`template` table) — not in the journal file.
- [x] "New from template" prefills the add-transaction form.
- Note that the Budget Tier-2 item is now unblocked.
