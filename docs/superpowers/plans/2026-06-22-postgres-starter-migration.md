# SQLite → Postgres + `@naeemba/next-starter` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the ledger-cli-ui data layer from SQLite/better-sqlite3 to PostgreSQL, and adopt the `@naeemba/next-starter` package for magic-link + passkey + Google auth.

**Architecture:** Two independent migration tracks against one Postgres DB (the starter's recommended topology): the package owns the auth tables (applied via `next-starter migrate`); the app owns its 4 tables in `db/schema` (pg-core), applied via `drizzle-kit migrate`. App tables FK to the package's `user`. Repositories keep their Repository/Service DI shape but become async. Tests run against in-process PGlite.

**Tech Stack:** Next 16, Drizzle ORM, `postgres` (postgres.js) at runtime, `@electric-sql/pglite` in tests, Better Auth via `@naeemba/next-starter`, Zod, Vitest.

## Global Constraints

- Database: PostgreSQL only. No SQLite, no better-sqlite3, anywhere in non-deleted code.
- Auth model: magic-link (passwordless) + passkey + Google. `singleAdmin: "sharp.fk@gmail.com"`. No email+password.
- Fresh start: no data-transfer script; existing SQLite data is discarded.
- `DATABASE_URL` is a required `postgres://…` URL.
- Follow the starter's README conventions verbatim (`~/workspace/personal/next-typescript-starter/README.md` + `examples/basic`).
- Package is ESM-only; `tsconfig.compilerOptions.moduleResolution` must stay `"bundler"` (already set).
- FK references to auth tables import from `@naeemba/next-starter/schema`.
- `journalMain` lives in `userSetting` (the package owns `user`); `userSetting.baseCurrency` becomes nullable so a row can exist with only `journalMain` set.
- Node ≥ 20, Next ≥ 16 (project is on Next 16.2).

---

## File Structure

**Created:**
- `lib/auth.ts`, `lib/auth-client.ts`, `lib/auth-server.ts` — starter shims
- `app/sign-in/page.tsx`, `app/sign-in/error/page.tsx`, `app/settings/passkeys/page.tsx`
- `proxy.ts` — route-protection redirect
- `db/migrations/*` — generated Postgres migration(s) for app tables

**Modified:**
- `package.json` (deps + scripts), `lib/env/index.ts`, `lib/env/client.ts`, `.env.example`
- `drizzle.config.ts`
- `db/schema/userSetting.ts`, `db/schema/template.ts`, `db/schema/commodityPrice.ts`, `db/schema/priceFetchRun.ts`, `db/schema/index.ts`
- `lib/db/connection.ts`, `lib/db/index.ts`
- `lib/test-utils/db.ts`
- `lib/settings/repository.ts`, `lib/templates/repository.ts`, `lib/prices/repository.ts`, `lib/prices/service.ts`, `lib/journal/repository.ts`
- `lib/settings/service.ts`, `lib/settings/getBaseCurrency.ts`
- All affected `*.test.ts` (settings, templates, prices, journal)
- `lib/auth/require-user.ts`
- Consumers of the old auth client (`signOut` redirect targets)

**Deleted:**
- `db/schema/user.ts`, `db/schema/session.ts`, `db/schema/account.ts`, `db/schema/passkey.ts`, `db/schema/verification.ts`
- `lib/auth/index.ts`, `lib/auth/client.ts`, `lib/auth/use-auth.ts`, `lib/auth/schemas.ts`
- `app/login/`, `app/signup/`

---

## Task 1: Dependencies, env, and config

**Files:**
- Modify: `package.json`
- Modify: `lib/env/index.ts`
- Modify: `lib/env/client.ts`
- Modify: `.env.example` (create if absent)
- Modify: `drizzle.config.ts`

**Interfaces:**
- Produces: `env.DATABASE_URL: string`, `env.EMAIL_FROM: string`, `env.RESEND_API_KEY?: string`, `env.GOOGLE_CLIENT_ID?: string`, `env.GOOGLE_CLIENT_SECRET?: string`; `clientEnv.NEXT_PUBLIC_ENABLE_GOOGLE?: '1'`. `env.DATA_DIR` is removed.

- [ ] **Step 1: Add/remove dependencies**

```bash
pnpm remove better-sqlite3 @types/better-sqlite3 better-auth
pnpm add @naeemba/next-starter postgres @react-email/components @react-email/render resend
pnpm add -D @electric-sql/pglite
```

`@better-auth/passkey`, `drizzle-orm`, and `drizzle-kit` stay.

- [ ] **Step 2: Rewrite `lib/env/index.ts`**

```ts
import { z } from 'zod';
import 'server-only';
import { clientEnvSchema } from './client';

const envSchema = clientEnvSchema.extend({
  // Auth — required
  BETTER_AUTH_SECRET: z
    .string()
    .min(
      32,
      'BETTER_AUTH_SECRET must be at least 32 characters (generate one: `openssl rand -base64 32`)'
    ),
  BETTER_AUTH_URL: z.string().url().default('http://localhost:3000'),

  // Storage — Postgres connection string (postgres://user:pass@host:5432/db)
  DATABASE_URL: z.string().url(),

  // Email (magic link). Required for Resend delivery in production; in dev the
  // link is logged to stdout when RESEND_API_KEY is unset.
  EMAIL_FROM: z.string().default('auth@example.com'),
  RESEND_API_KEY: z.string().optional(),

  // Google OAuth (optional)
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),

  // Ledger
  DEFAULT_CURRENCY: z.string().default('USD'),
  LEDGER_PRICE_DB: z.string().optional(),
  DATE_LOCALE: z.string().default('en-US'),
  PORTFOLIO_ACCOUNT_PREFIX: z.string().default('Assets:Investments'),

  // Prices
  PRICE_REFRESH_HOUR: z.coerce.number().int().min(0).max(23).default(6),
  PRICE_REFRESH_ENABLED: z
    .union([z.literal('true'), z.literal('false')])
    .default('true')
    .transform((v) => v === 'true'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('\n');
  throw new Error(
    `Invalid environment configuration. Fix the following:\n${issues}\n`
  );
}

export const env = parsed.data;
export type Env = z.infer<typeof envSchema>;
```

- [ ] **Step 3: Add `NEXT_PUBLIC_ENABLE_GOOGLE` to `lib/env/client.ts`**

In the `clientEnvSchema` object, add after `NEXT_PUBLIC_APP_ENV`:

```ts
  // Set to "1" in lockstep with the Google OAuth credentials so the sign-in
  // page knows to render the Google button.
  NEXT_PUBLIC_ENABLE_GOOGLE: z.preprocess(
    emptyToUndefined,
    z.literal('1').optional()
  ),
```

And in the `safeParse({...})` call add:

```ts
  NEXT_PUBLIC_ENABLE_GOOGLE: process.env.NEXT_PUBLIC_ENABLE_GOOGLE,
```

- [ ] **Step 4: Rewrite `drizzle.config.ts`**

```ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './db/schema',
  out: './db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  // Auth tables are package-owned (applied via `next-starter migrate`). Keep
  // drizzle-kit scoped to the app's own tables so it never tries to create or
  // drop the auth schema.
  tablesFilter: ['userSetting', 'template', 'commodity_price', 'price_fetch_run'],
});
```

- [ ] **Step 5: Write `.env.example`**

```bash
# Required
DATABASE_URL=postgres://postgres:postgres@localhost:5432/ledger_dev
BETTER_AUTH_SECRET=replace-with-32-plus-chars-of-random-data
BETTER_AUTH_URL=http://localhost:3000

# Email (magic link) — optional in dev (link logs to stdout when RESEND_API_KEY unset)
EMAIL_FROM=auth@example.com
RESEND_API_KEY=

# Optional: Google sign-in. Set NEXT_PUBLIC_ENABLE_GOOGLE=1 in lockstep.
# GOOGLE_CLIENT_ID=
# GOOGLE_CLIENT_SECRET=
# NEXT_PUBLIC_ENABLE_GOOGLE=1

# Ledger
DEFAULT_CURRENCY=USD
```

- [ ] **Step 6: Verify install**

Run: `pnpm install`
Expected: completes without errors; `better-sqlite3` absent from `package.json`.

(Type-check is deferred — downstream files are rewritten in later tasks.)

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-lock.yaml lib/env/index.ts lib/env/client.ts drizzle.config.ts .env.example
git commit -m "chore(db): swap sqlite deps for postgres + next-starter, update env"
```

---

## Task 2: Postgres app schema

**Files:**
- Modify: `db/schema/userSetting.ts`
- Modify: `db/schema/template.ts`
- Modify: `db/schema/commodityPrice.ts`
- Modify: `db/schema/priceFetchRun.ts`
- Modify: `db/schema/index.ts`
- Delete: `db/schema/user.ts`, `db/schema/session.ts`, `db/schema/account.ts`, `db/schema/passkey.ts`, `db/schema/verification.ts`
- Create: `db/migrations/` (generated)

**Interfaces:**
- Produces: pg-core tables `userSetting` (cols `userId`, `baseCurrency: text | null`, `journalMain: text NOT NULL default 'main.ledger'`, `updatedAt`), `template`, `commodityPrice`, `priceFetchRun`. Exported types `UserSetting`, `Template`, `CommodityPrice`, `PriceFetchRun`. FK references import `user` from `@naeemba/next-starter/schema`.

- [ ] **Step 1: Delete the package-owned auth schema files**

```bash
git rm db/schema/user.ts db/schema/session.ts db/schema/account.ts db/schema/passkey.ts db/schema/verification.ts
```

- [ ] **Step 2: Rewrite `db/schema/userSetting.ts`**

```ts
import { sql } from 'drizzle-orm';
import { user } from '@naeemba/next-starter/schema';
import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const userSetting = pgTable('userSetting', {
  userId: text('userId')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  // Nullable: a row may exist holding only journalMain before the user picks a
  // base currency. Consumers fall back to env.DEFAULT_CURRENCY when null.
  baseCurrency: text('baseCurrency'),
  // Relative path (within the user's journal dir) of the main ledger file.
  // Folded in from the old user table, which the auth package now owns.
  journalMain: text('journalMain').notNull().default('main.ledger'),
  updatedAt: timestamp('updatedAt')
    .notNull()
    .default(sql`now()`),
});

export type UserSetting = typeof userSetting.$inferSelect;
```

- [ ] **Step 3: Rewrite `db/schema/template.ts`**

```ts
import { sql } from 'drizzle-orm';
import { user } from '@naeemba/next-starter/schema';
import type { TemplateDraft } from '@/lib/templates/schema';
import {
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const template = pgTable(
  'template',
  {
    id: text('id').primaryKey(),
    userId: text('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    draft: jsonb('draft').notNull().$type<TemplateDraft>(),
    createdAt: timestamp('createdAt').notNull().default(sql`now()`),
    updatedAt: timestamp('updatedAt').notNull().default(sql`now()`),
  },
  (t) => [uniqueIndex('template_user_name').on(t.userId, t.name)]
);

export type Template = typeof template.$inferSelect;
```

- [ ] **Step 4: Rewrite `db/schema/commodityPrice.ts`**

```ts
import {
  pgTable,
  real,
  serial,
  text,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core';

export const commodityPrice = pgTable(
  'commodity_price',
  {
    id: serial('id').primaryKey(),
    symbol: text('symbol').notNull(),
    quote: text('quote').notNull(),
    price: real('price').notNull(),
    fetchedAt: timestamp('fetched_at').notNull(),
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

- [ ] **Step 5: Rewrite `db/schema/priceFetchRun.ts`**

```ts
import { integer, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

export const priceFetchRun = pgTable('price_fetch_run', {
  id: serial('id').primaryKey(),
  startedAt: timestamp('started_at').notNull(),
  completedAt: timestamp('completed_at'),
  status: text('status', { enum: ['success', 'partial', 'failed'] }).notNull(),
  symbolsFetched: integer('symbols_fetched').notNull().default(0),
  symbolsFailed: integer('symbols_failed').notNull().default(0),
  errorMessage: text('error_message'),
});

export type PriceFetchRun = typeof priceFetchRun.$inferSelect;
```

- [ ] **Step 6: Rewrite `db/schema/index.ts`**

```ts
export { commodityPrice, type CommodityPrice } from './commodityPrice';
export { priceFetchRun, type PriceFetchRun } from './priceFetchRun';
export { template, type Template } from './template';
export { userSetting, type UserSetting } from './userSetting';
```

- [ ] **Step 7: Generate the app migration**

Run: `DATABASE_URL=postgres://x@localhost/x pnpm db:generate`
Expected: a new SQL file under `db/migrations/`.

- [ ] **Step 8: Verify the generated SQL does NOT create auth tables, but keeps the FK**

Open the generated `db/migrations/0000_*.sql`. Confirm:
- It contains `CREATE TABLE "userSetting"`, `"template"`, `"commodity_price"`, `"price_fetch_run"`.
- It does **NOT** contain `CREATE TABLE "user"` (or session/account/passkey/verification).
- The `userSetting`/`template` definitions include a foreign key to `"user"("id")`.

If a `CREATE TABLE "user"` statement is present (drizzle-kit ignored `tablesFilter` for the referenced table), delete that statement by hand and keep the `ALTER TABLE … ADD CONSTRAINT … FOREIGN KEY … REFERENCES "user"` lines. The auth `user` table is created at runtime by `next-starter migrate` (Task 8), so the app migration must only reference it.

- [ ] **Step 9: Commit**

```bash
git add db/schema db/migrations
git commit -m "feat(db): postgres app schema; journalMain folded into userSetting"
```

---

## Task 3: Postgres DB connection (lazy)

**Files:**
- Modify: `lib/db/connection.ts`
- Modify: `lib/db/index.ts`

**Interfaces:**
- Consumes: `env.DATABASE_URL`.
- Produces: `createDbConnection(url: string): DbInstance`, `type DbInstance` (postgres.js Drizzle), `db: DbInstance` (lazy singleton).

- [ ] **Step 1: Rewrite `lib/db/connection.ts`**

```ts
import * as schema from '@/db/schema';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

export type DbInstance = PostgresJsDatabase<typeof schema>;

export const createDbConnection = (url: string): DbInstance => {
  // postgres.js connects lazily on first query, so constructing the client here
  // opens no socket — safe to call without a reachable database (e.g. at build).
  const client = postgres(url);
  return drizzle(client, { schema });
};
```

- [ ] **Step 2: Rewrite `lib/db/index.ts`**

```ts
import { createDbConnection, type DbInstance } from './connection';
import { env } from '@/lib/env';

let instance: DbInstance | undefined;

// Connect lazily on first property access, never at import time, so `next build`
// can evaluate route modules without a database connection being established.
const getDb = (): DbInstance => {
  if (!instance) instance = createDbConnection(env.DATABASE_URL);
  return instance;
};

export const db = new Proxy({} as DbInstance, {
  get: (_target, prop, receiver) =>
    Reflect.get(getDb() as object, prop, receiver),
});

export { createDbConnection } from './connection';
export type { DbInstance } from './connection';
```

- [ ] **Step 3: Type-check the DB layer**

Run: `pnpm exec tsc --noEmit`
Expected: no errors originating in `lib/db/`. (Errors elsewhere — repos/auth — are expected until later tasks.)

- [ ] **Step 4: Commit**

```bash
git add lib/db/connection.ts lib/db/index.ts
git commit -m "feat(db): lazy postgres.js drizzle connection"
```

---

## Task 4: Postgres test harness (PGlite)

**Files:**
- Modify: `lib/test-utils/db.ts`

**Interfaces:**
- Produces: `setupTestDb(prefix?): Promise<TestDbContext>`, `teardownTestDb(ctx): Promise<void>`. `TestDbContext = { client: PGlite; db: DbInstance; insertUser(id, name?, email?): Promise<void> }`. The harness creates a minimal `user` table plus all four app tables.

- [ ] **Step 1: Rewrite `lib/test-utils/db.ts`**

```ts
import { PGlite } from '@electric-sql/pglite';
import * as schema from '@/db/schema';
import type { DbInstance } from '@/lib/db/connection';
import { drizzle } from 'drizzle-orm/pglite';

export type TestDbContext = {
  client: PGlite;
  db: DbInstance;
  insertUser: (id: string, name?: string, email?: string) => Promise<void>;
};

// Minimal stand-in for the package-owned auth `user` table plus the app tables.
// Postgres DDL mirrors db/schema and @naeemba/next-starter/schema closely enough
// for repository tests (FKs, uniqueness, defaults).
const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS "user" (
    "id" text PRIMARY KEY NOT NULL,
    "name" text NOT NULL DEFAULT '',
    "email" text NOT NULL UNIQUE,
    "emailVerified" boolean NOT NULL DEFAULT false,
    "image" text,
    "createdAt" timestamp NOT NULL DEFAULT now(),
    "updatedAt" timestamp NOT NULL DEFAULT now()
  );
  CREATE TABLE IF NOT EXISTS "userSetting" (
    "userId" text PRIMARY KEY NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
    "baseCurrency" text,
    "journalMain" text NOT NULL DEFAULT 'main.ledger',
    "updatedAt" timestamp NOT NULL DEFAULT now()
  );
  CREATE TABLE IF NOT EXISTS "template" (
    "id" text PRIMARY KEY NOT NULL,
    "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
    "name" text NOT NULL,
    "draft" jsonb NOT NULL,
    "createdAt" timestamp NOT NULL DEFAULT now(),
    "updatedAt" timestamp NOT NULL DEFAULT now()
  );
  CREATE UNIQUE INDEX IF NOT EXISTS "template_user_name" ON "template"("userId","name");
  CREATE TABLE IF NOT EXISTS "commodity_price" (
    "id" serial PRIMARY KEY,
    "symbol" text NOT NULL,
    "quote" text NOT NULL,
    "price" real NOT NULL,
    "fetched_at" timestamp NOT NULL,
    "fetched_date" text NOT NULL,
    CONSTRAINT "commodity_price_unique_per_day" UNIQUE ("symbol","quote","fetched_date")
  );
  CREATE TABLE IF NOT EXISTS "price_fetch_run" (
    "id" serial PRIMARY KEY,
    "started_at" timestamp NOT NULL,
    "completed_at" timestamp,
    "status" text NOT NULL,
    "symbols_fetched" integer NOT NULL DEFAULT 0,
    "symbols_failed" integer NOT NULL DEFAULT 0,
    "error_message" text
  );
`;

export const setupTestDb = async (
  prefix = 'ledger-test-'
): Promise<TestDbContext> => {
  void prefix; // each PGlite() is an isolated in-memory database
  const client = new PGlite();
  await client.exec(SCHEMA_SQL);
  const db = drizzle(client, { schema }) as unknown as DbInstance;

  process.env.BETTER_AUTH_SECRET = 'x'.repeat(32);
  process.env.PRICE_REFRESH_ENABLED = 'false';

  const insertUser = async (
    id: string,
    name = id,
    email = `${id}@example.com`
  ): Promise<void> => {
    await client.query(
      `INSERT INTO "user" ("id","name","email") VALUES ($1,$2,$3)`,
      [id, name, email]
    );
  };

  return { client, db, insertUser };
};

export const teardownTestDb = async (ctx: TestDbContext): Promise<void> => {
  await ctx.client.close();
};
```

- [ ] **Step 2: Type-check the harness**

Run: `pnpm exec tsc --noEmit lib/test-utils/db.ts` (or full `tsc --noEmit` — harness errors should be zero).
Expected: no errors in `lib/test-utils/db.ts`.

- [ ] **Step 3: Commit**

```bash
git add lib/test-utils/db.ts
git commit -m "test(db): pglite-backed postgres test harness"
```

---

## Task 5: Settings repository → async

**Files:**
- Modify: `lib/settings/repository.ts`
- Modify: `lib/settings/service.ts`
- Modify: `lib/settings/getBaseCurrency.ts`
- Test: `lib/settings/repository.test.ts`

**Interfaces:**
- Consumes: `DbInstance`, `userSetting` (now with nullable `baseCurrency`), `TestDbContext`.
- Produces: `UserSettingRepository.get(userId): Promise<UserSetting | null>`, `.upsertBaseCurrency(userId, value): Promise<void>`. `UserSetting.baseCurrency` is `string | null`.

- [ ] **Step 1: Update the test to the PGlite harness**

Replace the full contents of `lib/settings/repository.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { UserSettingRepository } from './repository';
import {
  setupTestDb,
  teardownTestDb,
  type TestDbContext,
} from '@/lib/test-utils/db';

describe('UserSettingRepository', () => {
  let ctx: TestDbContext;
  let repo: UserSettingRepository;

  beforeEach(async () => {
    ctx = await setupTestDb('settings-');
    await ctx.insertUser('alice', 'Alice', 'alice@example.com');
    repo = new UserSettingRepository(ctx.db);
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
    await ctx.client.query(`DELETE FROM "user" WHERE id = $1`, ['alice']);
    expect(await repo.get('alice')).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run lib/settings/repository.test.ts`
Expected: FAIL — `repository.ts` still calls `.get()`/`.run()` (not valid on postgres.js drizzle).

- [ ] **Step 3: Rewrite `lib/settings/repository.ts`**

```ts
import { eq } from 'drizzle-orm';
import { userSetting, type UserSetting } from '@/db/schema/userSetting';
import type { DbInstance } from '@/lib/db/connection';

export class UserSettingRepository {
  constructor(private readonly db: DbInstance) {}

  async get(userId: string): Promise<UserSetting | null> {
    const rows = await this.db
      .select()
      .from(userSetting)
      .where(eq(userSetting.userId, userId))
      .limit(1);
    return rows[0] ?? null;
  }

  async upsertBaseCurrency(userId: string, value: string): Promise<void> {
    await this.db
      .insert(userSetting)
      .values({ userId, baseCurrency: value })
      .onConflictDoUpdate({
        target: userSetting.userId,
        set: { baseCurrency: value, updatedAt: new Date() },
      });
  }
}
```

- [ ] **Step 4: Confirm `getBaseCurrency.ts` handles nullable baseCurrency**

In `lib/settings/getBaseCurrency.ts`, change the row branch to guard null:

```ts
  const user = await getOptionalUser();
  if (user) {
    const row = await userSettingRepository.get(user.id);
    if (row?.baseCurrency) return row.baseCurrency;
  }
```

(`lib/settings/service.ts` needs no change — `get` returns the row as-is; the `UserSetting` type now carries `baseCurrency: string | null`.)

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm exec vitest run lib/settings/repository.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add lib/settings/repository.ts lib/settings/service.ts lib/settings/getBaseCurrency.ts lib/settings/repository.test.ts
git commit -m "refactor(settings): async postgres repository"
```

---

## Task 6: Templates repository → async

**Files:**
- Modify: `lib/templates/repository.ts`
- Test: `lib/templates/repository.test.ts`

**Interfaces:**
- Produces: `TemplateRepository.find/findByName/list/save/update/delete` — all async, postgres-backed.

- [ ] **Step 1: Update the test's setup + UNIQUE assertions**

In `lib/templates/repository.test.ts`:

1. Remove the `import * as schema` line, the `import { drizzle } from 'drizzle-orm/better-sqlite3'` line, and the `TEMPLATE_TABLE` constant.
2. Replace the `beforeEach` body with:

```ts
  beforeEach(async () => {
    ctx = await setupTestDb('templates-');
    await ctx.insertUser('alice', 'Alice', 'alice@example.com');
    await ctx.insertUser('bob', 'Bob', 'bob@example.com');
    repo = new TemplateRepository(ctx.db);
  });
```

3. Change both UNIQUE-violation assertions from `/UNIQUE constraint failed/i` to `/duplicate key value/i` (two occurrences: the `save throws…` and `update throws…` tests).

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run lib/templates/repository.test.ts`
Expected: FAIL — `.get()`/`.all()`/`.run()` invalid on postgres.js drizzle.

- [ ] **Step 3: Rewrite `lib/templates/repository.ts`**

```ts
import { and, eq, sql } from 'drizzle-orm';
import type { TemplateDraft, TemplateInput } from './schema';
import { template, type Template } from '@/db/schema/template';
import type { DbInstance } from '@/lib/db/connection';
import { generateUid } from '@/lib/journal/uid';

export type TemplateUpdate = Partial<{ name: string; draft: TemplateDraft }>;

export class TemplateRepository {
  constructor(private readonly db: DbInstance) {}

  async find(userId: string, id: string): Promise<Template | null> {
    const rows = await this.db
      .select()
      .from(template)
      .where(and(eq(template.userId, userId), eq(template.id, id)))
      .limit(1);
    return rows[0] ?? null;
  }

  async findByName(userId: string, name: string): Promise<Template | null> {
    const rows = await this.db
      .select()
      .from(template)
      .where(and(eq(template.userId, userId), eq(template.name, name)))
      .limit(1);
    return rows[0] ?? null;
  }

  async list(userId: string): Promise<Template[]> {
    return this.db
      .select()
      .from(template)
      .where(eq(template.userId, userId))
      .orderBy(sql`lower(${template.name})`);
  }

  /** Inserts a new row. Throws on UNIQUE constraint violation. */
  async save(userId: string, input: TemplateInput): Promise<Template> {
    const rows = await this.db
      .insert(template)
      .values({
        id: generateUid(),
        userId,
        name: input.name,
        draft: input.draft,
      })
      .returning();
    return rows[0];
  }

  /** Updates name and/or draft. Returns null if no row matches. Throws on UNIQUE violation. */
  async update(
    userId: string,
    id: string,
    patch: TemplateUpdate
  ): Promise<Template | null> {
    const updates: { name?: string; draft?: TemplateDraft; updatedAt: Date } = {
      updatedAt: new Date(),
    };
    if (patch.name !== undefined) updates.name = patch.name;
    if (patch.draft !== undefined) updates.draft = patch.draft;
    const rows = await this.db
      .update(template)
      .set(updates)
      .where(and(eq(template.userId, userId), eq(template.id, id)))
      .returning();
    return rows[0] ?? null;
  }

  async delete(userId: string, id: string): Promise<void> {
    await this.db
      .delete(template)
      .where(and(eq(template.userId, userId), eq(template.id, id)));
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run lib/templates/repository.test.ts`
Expected: PASS (all template tests).

- [ ] **Step 5: Commit**

```bash
git add lib/templates/repository.ts lib/templates/repository.test.ts
git commit -m "refactor(templates): async postgres repository"
```

---

## Task 7: Prices repository + service → async

**Files:**
- Modify: `lib/prices/repository.ts`
- Modify: `lib/prices/service.ts`
- Test: `lib/prices/repository.test.ts`
- Test: `lib/prices/service.test.ts` (update harness usage only)

**Interfaces:**
- Consumes: `user` from `@naeemba/next-starter/schema` (for `listUsers`), `userSetting`.
- Produces: `CommodityPriceRepository.insert/listForQuote/knownSymbolsForQuote`, `PriceFetchRunRepository.insert/update/latest` — all async.

- [ ] **Step 1: Update `lib/prices/repository.test.ts` setup**

1. Remove `import * as schema`, the `drizzle` import, and the `PRICE_TABLE` / `RUN_TABLE` constants.
2. In both `beforeEach` blocks, replace the `ctx.sqlite.exec(...)` + `drizzle(ctx.sqlite,...)` lines with the harness `db`:

```ts
    ctx = await setupTestDb('prices-repo-');
    repo = new CommodityPriceRepository(ctx.db);
```

and for the runs describe block:

```ts
    ctx = await setupTestDb('runs-repo-');
    repo = new PriceFetchRunRepository(ctx.db);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run lib/prices/repository.test.ts`
Expected: FAIL — sync `.run()`/`.all()`/`.get()` invalid.

- [ ] **Step 3: Rewrite `lib/prices/repository.ts`**

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
      await this.db
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
        });
    }
  }

  async listForQuote(quote: string): Promise<CommodityPrice[]> {
    return this.db
      .select()
      .from(commodityPrice)
      .where(eq(commodityPrice.quote, quote))
      .orderBy(commodityPrice.fetchedAt);
  }

  /** Distinct symbols already fetched against the given quote. */
  async knownSymbolsForQuote(quote: string): Promise<string[]> {
    const rows = await this.db
      .selectDistinct({ symbol: commodityPrice.symbol })
      .from(commodityPrice)
      .where(eq(commodityPrice.quote, quote));
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
    const rows = await this.db
      .insert(priceFetchRun)
      .values(input)
      .returning();
    return rows[0]!;
  }

  async update(id: number, patch: PriceFetchRunUpdate): Promise<void> {
    await this.db
      .update(priceFetchRun)
      .set(patch)
      .where(eq(priceFetchRun.id, id));
  }

  async latest(): Promise<PriceFetchRun | null> {
    const rows = await this.db
      .select()
      .from(priceFetchRun)
      .orderBy(desc(priceFetchRun.id))
      .limit(1);
    return rows[0] ?? null;
  }
}
```

- [ ] **Step 4: Rewrite the two sync reads in `lib/prices/service.ts`**

Change the `user` import to the package and convert `listUsers`/`resolveBaseCurrency` to async reads.

Replace the import line `import { user as userTable, userSetting } from '@/db/schema';` with:

```ts
import { userSetting } from '@/db/schema';
import { user as userTable } from '@naeemba/next-starter/schema';
```

Replace `listUsers`:

```ts
  private async listUsers(): Promise<string[]> {
    const rows = await this.deps.db
      .select({ id: userTable.id })
      .from(userTable);
    return rows.map((r) => r.id);
  }
```

Replace `resolveBaseCurrency`:

```ts
  private async resolveBaseCurrency(userId: string): Promise<string> {
    const rows = await this.deps.db
      .select({ baseCurrency: userSetting.baseCurrency })
      .from(userSetting)
      .where(eq(userSetting.userId, userId))
      .limit(1);
    return rows[0]?.baseCurrency ?? env.DEFAULT_CURRENCY;
  }
```

- [ ] **Step 5: Update `lib/prices/service.test.ts` harness usage**

In `lib/prices/service.test.ts`, wherever it builds a drizzle instance from `ctx.sqlite` / creates tables via raw SQL, switch to `ctx.db` and `ctx.insertUser(...)` (mirroring the pattern in Task 5/6). Remove any `import { drizzle } from 'drizzle-orm/better-sqlite3'` and per-test `CREATE TABLE` strings — the harness now provisions all tables. Update any base-currency seeding to `await new UserSettingRepository(ctx.db).upsertBaseCurrency(userId, currency)` or a direct `ctx.client.query` insert into `userSetting`.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm exec vitest run lib/prices/`
Expected: PASS (repository + service suites).

- [ ] **Step 7: Commit**

```bash
git add lib/prices/repository.ts lib/prices/service.ts lib/prices/repository.test.ts lib/prices/service.test.ts
git commit -m "refactor(prices): async postgres repository + service reads"
```

---

## Task 8: Journal repository → async + journalMain from userSetting

**Files:**
- Modify: `lib/journal/repository.ts`
- Test: `lib/journal/repository.test.ts`

**Interfaces:**
- Consumes: `userSetting` (reads/writes `journalMain`).
- Produces: `JournalRepository.getLayout/ensureLayout/setMainFile/...` — `journalMain` now stored in `userSetting`, reads default to `'main.ledger'`.

- [ ] **Step 1: Update `lib/journal/repository.test.ts` setup**

1. Remove `import * as schema`, the `drizzle` import, and replace the `insertTestUser` helper + `drizzle(ctx.sqlite,...)` with harness usage:

```ts
  beforeEach(async () => {
    ctx = await setupTestDb('repo-mtime-');
    await ctx.insertUser('test-user', 'Test', 'test@example.com');
    repo = new JournalRepository(ctx.db);
  });
```

(The mtime tests don't depend on `journalMain`; they exercise filesystem layout and remain valid.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run lib/journal/repository.test.ts`
Expected: FAIL — `.get()`/`.run()` invalid, and `userTable` import is gone.

- [ ] **Step 3: Rewrite the DB-touching parts of `lib/journal/repository.ts`**

Change the import line `import { user as userTable } from '@/db/schema';` to:

```ts
import { userSetting } from '@/db/schema';
```

Replace `getLayout`:

```ts
  /** Resolves journal layout from the user's setting row + filesystem. */
  async getLayout(userId: string): Promise<JournalLayout> {
    const rows = await this.db
      .select({ journalMain: userSetting.journalMain })
      .from(userSetting)
      .where(eq(userSetting.userId, userId))
      .limit(1);
    const mainFile = rows[0]?.journalMain ?? DEFAULT_MAIN;
    const dir = getJournalDir(userId);
    return {
      dir,
      mainFile,
      mainPath: path.join(dir, mainFile),
      priceDbPath: await this.findPriceDb(dir),
    };
  }
```

Replace `setMainFile` with an upsert (a user may have no `userSetting` row yet):

```ts
  /** Updates the user's journalMain pointer, creating the setting row if needed. */
  async setMainFile(userId: string, mainFile: string): Promise<void> {
    await this.db
      .insert(userSetting)
      .values({ userId, journalMain: mainFile })
      .onConflictDoUpdate({
        target: userSetting.userId,
        set: { journalMain: mainFile, updatedAt: new Date() },
      });
  }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run lib/journal/repository.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full suite**

Run: `pnpm test`
Expected: all suites PASS. Fix any remaining `.get()/.run()/.all()` or `drizzle-orm/better-sqlite3` import the suite surfaces.

- [ ] **Step 6: Commit**

```bash
git add lib/journal/repository.ts lib/journal/repository.test.ts
git commit -m "refactor(journal): async repository; journalMain in userSetting"
```

---

## Task 9: Auth shims (adopt the starter)

**Files:**
- Create: `lib/auth.ts`, `lib/auth-client.ts`, `lib/auth-server.ts`, `proxy.ts`
- Create: `app/sign-in/page.tsx`, `app/sign-in/error/page.tsx`, `app/settings/passkeys/page.tsx`
- Modify: `lib/auth/require-user.ts`, `app/api/auth/[...all]/route.ts`
- Delete: `lib/auth/index.ts`, `lib/auth/client.ts`, `lib/auth/use-auth.ts`, `lib/auth/schemas.ts`, `app/login/`, `app/signup/`

**Interfaces:**
- Produces: `auth` (resolved Better Auth instance), `authClient` + `signIn/signOut/useSession`, `getSession`/`requireSession`, `requireUser`/`getOptionalUser` adapters.

- [ ] **Step 1: Create `lib/auth.ts`**

```ts
import { APP_NAME } from '@/lib/app';
import { createAuth } from '@naeemba/next-starter/auth';

const googleConfigured =
  !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET;

export const auth = await createAuth({
  singleAdmin: 'sharp.fk@gmail.com',
  passkey: { rpName: APP_NAME },
  ...(googleConfigured && { google: {} }),
});
```

- [ ] **Step 2: Create `lib/auth-client.ts`**

```ts
'use client';
import { passkeyClient } from '@better-auth/passkey/client';
import { createAuthClient } from '@naeemba/next-starter/client';

export const authClient = createAuthClient({ passkey: passkeyClient });
export const { signIn, signOut, useSession } = authClient;
```

- [ ] **Step 3: Create `lib/auth-server.ts`**

```ts
import { auth } from './auth';
import { createServer } from '@naeemba/next-starter/server';

export const { getSession, requireSession } = createServer(auth);
```

- [ ] **Step 4: Rewrite `lib/auth/require-user.ts` as an adapter**

```ts
import 'server-only';
import { getSession, requireSession } from '@/lib/auth-server';

export const requireUser = async () => (await requireSession()).user;

export const getOptionalUser = async () =>
  (await getSession())?.user ?? null;
```

- [ ] **Step 5: Rewrite `app/api/auth/[...all]/route.ts`**

```ts
import { auth } from '@/lib/auth';
import { createAuthRoute } from '@naeemba/next-starter/auth-route';

export const { GET, POST } = createAuthRoute(auth);
```

- [ ] **Step 6: Create `app/sign-in/page.tsx`**

```tsx
'use client';

import { authClient } from '@/lib/auth-client';
import { SignInPage } from '@naeemba/next-starter/pages/sign-in';

const googleEnabled = process.env.NEXT_PUBLIC_ENABLE_GOOGLE === '1';

export default function Page() {
  return (
    <SignInPage
      authClient={authClient}
      callbackUrl="/"
      errorCallbackUrl="/sign-in/error"
      google={googleEnabled}
      passkey
      classNames={{
        main: 'min-h-screen flex items-center justify-center bg-background',
        heading: 'text-2xl font-semibold tracking-tight',
        emailInput:
          'w-full rounded-md border bg-background px-3 py-2 text-sm',
        submitButton:
          'w-full rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground',
        googleButton: 'w-full rounded-md border px-3 py-2 text-sm',
        error: 'text-sm text-destructive mt-1',
      }}
    />
  );
}
```

- [ ] **Step 7: Create `app/sign-in/error/page.tsx`**

```tsx
import { SignInErrorPage } from '@naeemba/next-starter/pages/sign-in';

export default function Page() {
  return <SignInErrorPage />;
}
```

- [ ] **Step 8: Create `app/settings/passkeys/page.tsx`**

```tsx
'use client';

import { authClient } from '@/lib/auth-client';
import { PasskeyManagerPage } from '@naeemba/next-starter/pages/passkey-manager';

export default function Page() {
  return <PasskeyManagerPage authClient={authClient} />;
}
```

- [ ] **Step 9: Create `proxy.ts` (project root)**

```ts
import { createProxy } from '@naeemba/next-starter/proxy';

export default createProxy({
  protect: ['/((?!sign-in|api/auth).*)'],
  signInPath: '/sign-in',
});

export const config = {
  matcher: ['/((?!_next/|favicon.ico|api/auth/).*)'],
};
```

- [ ] **Step 10: Delete the obsolete auth + password files**

```bash
git rm lib/auth/index.ts lib/auth/client.ts lib/auth/use-auth.ts lib/auth/schemas.ts
git rm -r app/login app/signup
```

- [ ] **Step 11: Repoint old auth-client consumers**

Find every importer of the deleted files and fix:

```bash
grep -rln "@/lib/auth/client\|@/lib/auth/use-auth\|@/lib/auth/schemas\|from '@/lib/auth'\|'/login'\|'/signup'" app lib --include="*.ts" --include="*.tsx" | grep -v ".test."
```

For each hit:
- `useAuth()`/`authClient` from `@/lib/auth/use-auth` or `@/lib/auth/client` → import `authClient` / `useSession` from `@/lib/auth-client`.
- `useSession()` shape: `const { data, isPending } = authClient.useSession()` → user at `data?.user`.
- Any `signOut()` that redirected to `/login` → redirect to `/sign-in`.
- Any `redirect('/login')` / links to `/login` or `/signup` → `/sign-in`.

- [ ] **Step 12: Type-check + lint**

Run: `pnpm type-check && pnpm lint`
Expected: no errors. Resolve any remaining references to deleted modules.

- [ ] **Step 13: Commit**

```bash
git add -A
git commit -m "feat(auth): adopt next-starter magic-link + passkey + google shims"
```

---

## Task 10: Migration scripts + deploy ordering

**Files:**
- Modify: `package.json` (scripts)

**Interfaces:**
- Produces: `prebuild`, `prestart`, `db:migrate`, `db:migrate:auth`, `db:generate` scripts wired per the starter README.

- [ ] **Step 1: Update `package.json` scripts**

Set these keys (keep existing unrelated scripts):

```jsonc
{
  "scripts": {
    "dev": "dotenv -e .env -- next dev",
    "prebuild": "next-starter migrate",
    "build": "next build",
    "prestart": "next-starter migrate && drizzle-kit migrate",
    "start": "next start",
    "db:generate": "drizzle-kit generate",
    "db:migrate:auth": "next-starter migrate",
    "db:migrate": "drizzle-kit migrate"
  }
}
```

- [ ] **Step 2: Apply both migration tracks to a local Postgres**

```bash
# assumes DATABASE_URL points at a reachable local postgres
pnpm db:migrate:auth   # creates user/session/account/verification/passkey
pnpm db:migrate        # creates the 4 app tables, FKs to user resolve
```

Expected: both complete; `\dt` in psql shows all 9 tables.

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "build: next-starter + drizzle migration scripts and deploy ordering"
```

---

## Task 11: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Test suite**

Run: `pnpm test`
Expected: all suites PASS.

- [ ] **Step 2: Type-check**

Run: `pnpm type-check`
Expected: 0 errors.

- [ ] **Step 3: Lint**

Run: `pnpm lint`
Expected: 0 errors.

- [ ] **Step 4: Clean production build (reproduces the Coolify build container)**

Run: `BETTER_AUTH_SECRET=$(openssl rand -base64 32) DATABASE_URL=postgres://u:p@localhost:5432/nope pnpm build`
Expected: build SUCCEEDS. `prebuild` runs `next-starter migrate` (needs a reachable DB) — if you only want to prove the build step itself no longer opens a DB at import time, run `pnpm exec next build` directly with `DATABASE_URL` set to a syntactically valid but unused URL and confirm no "Cannot open database"/connection error during page-data collection.

- [ ] **Step 5: Manual smoke (against a real local Postgres)**

- [ ] Start dev (`pnpm dev`), visit `/sign-in`, request a magic link, copy the `[magic-link-log]` URL from stdout, confirm sign-in lands on `/`.
- [ ] Confirm sign-in is rejected for an email other than `sharp.fk@gmail.com` (singleAdmin).
- [ ] Register a passkey at `/settings/passkeys`; sign out; sign in with the passkey.
- [ ] Change base currency in settings; reload; value persists (Postgres `userSetting`).
- [ ] Create/rename/delete a template.
- [ ] Trigger a price fetch; confirm a `price_fetch_run` row and `commodity_price` rows exist.

- [ ] **Step 6: Update project memory + plan doc**

Update `PLAN.md` if it tracks infra phases, and mark this plan complete. Commit:

```bash
git add -A
git commit -m "docs: mark postgres + next-starter migration complete"
```

---

## Self-Review

**Spec coverage:**
- Postgres engine → Tasks 2–4, 7–8. ✓
- Starter magic-link + passkey + Google, singleAdmin → Task 9. ✓
- Fresh start (no data transfer) → no migration-of-data task exists by design. ✓
- Topology B (two migration tracks) → Tasks 2 (tablesFilter), 10 (script chaining). ✓
- journalMain → userSetting → Tasks 2, 8; nullable baseCurrency → Tasks 2, 5. ✓
- ~18 sync→async sites → Tasks 5–8 cover settings(2), templates(6), prices repo(6)+service(2), journal(2). ✓
- Shim files + sign-in/passkey pages + proxy → Task 9. ✓
- Deploy ordering verbatim → Task 10. ✓
- Deps add/remove → Task 1. ✓
- FK-to-user drizzle-kit risk → Task 2 Step 8 (inspect + reconcile). ✓
- Resend-in-prod, passkey rpID, peer/runtime → covered by env (Task 1) and verification (Task 11); operational notes live in the spec.

**Placeholder scan:** No TBD/TODO; every code step shows full code; test steps include assertions. The one judgement step (Task 9 Step 11) enumerates the exact transforms per match rather than saying "fix imports".

**Type consistency:** `DbInstance` defined in Task 3, consumed unchanged by all repos. `UserSetting.baseCurrency: string | null` introduced in Task 2, handled in Tasks 5 (`getBaseCurrency`) and 7 (`resolveBaseCurrency`). `setMainFile` upsert (Task 8) relies on `journalMain` default from Task 2. Test harness `ctx.db`/`ctx.insertUser` (Task 4) used identically in Tasks 5–8.
