# Structured Logging + Audit Log Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add structured logging (pino → stdout) with a self-hosted GlitchTip error-tracking destination, and a Postgres-backed audit log of journal mutations + security events.

**Architecture:** A single pino logger module (`lib/log/`) becomes the one logging entry point for node-runtime code, with mandatory redaction of secrets. GlitchTip is wired via `@sentry/nextjs` (disabled when `SENTRY_DSN` is unset). The audit log is a normal drizzle table (`auditLog`) behind a Repository + best-effort Service, instrumented at the server-action / route boundary (not inside `JournalService`).

**Tech Stack:** Next.js 16 (app router), TypeScript, drizzle-orm + Postgres, pino + pino-pretty, @sentry/nextjs, vitest + PGlite, Zod.

## Global Constraints

- **Zero-knowledge:** never log or persist journal content, amounts, payee/account names, passphrases, recovery codes, DEKs, or wraps. Only metadata (counts, sizes, ids, action names, result, reason).
- **Repository + Service + one-action-per-file** convention; one schema file per table under `db/schema/`, re-exported from `db/schema/index.ts`.
- **FK pattern:** `text('userId').references(() => user.id, { onDelete: 'cascade' })`, importing `user` from `@naeemba/next-starter/schema`.
- **IDs:** text primary keys generated with `generateUid()` (ULID) from `@/lib/journal/uid` — matches `savedView`/`template`. (Spec said "uuid"; the codebase convention is ULID — follow the codebase.)
- **DB instance type:** `DbInstance` from `@/lib/db/connection`; the runtime singleton is `db` from `@/lib/db`.
- **Tests:** vitest + PGlite via `setupTestDb`/`teardownTestDb` from `@/lib/test-utils/db` (applies the REAL `db/migrations/*.sql`, so a new migration file is required for the table to exist in tests). `insertUser(id)` seeds the FK parent.
- **Env:** server vars in `lib/env/index.ts` schema, client vars in `lib/env/client.ts`; all new vars optional with safe defaults.
- **Verification per task:** `pnpm test` green, `pnpm type-check` clean, `pnpm lint` clean.
- **Branch:** `feat/logging-and-audit` (already created; spec already committed there).

---

## File Structure

**Create:**
- `lib/log/index.ts` — pino logger singleton + `createLogger`/child helper + redaction config.
- `lib/log/index.test.ts` — redaction + level tests.
- `lib/log/sentry.ts` — `isSentryEnabled()` + `initSentryNode()` thin wrapper.
- `lib/log/sentry.test.ts` — disabled-when-no-DSN test.
- `sentry.server.config.ts`, `sentry.edge.config.ts`, `instrumentation-client.ts` — `@sentry/nextjs` init files (DSN-gated).
- `db/schema/auditLog.ts` — drizzle table.
- `db/migrations/0006_*.sql` — generated migration.
- `lib/audit/schema.ts` — Zod event schema + `AUDIT_ACTIONS`.
- `lib/audit/repository.ts` — `AuditRepository`.
- `lib/audit/repository.test.ts`.
- `lib/audit/service.ts` — `AuditService` + `auditService` singleton + `record()`.
- `lib/audit/service.test.ts`.
- `lib/audit/index.ts` — barrel.
- `lib/audit/headers.ts` — `auditRequestMeta()` best-effort ip/user-agent reader.

**Modify:**
- `instrumentation.ts` — add `onRequestError` + Sentry node init.
- `db/schema/index.ts` — re-export `auditLog`.
- `drizzle.config.ts` — add `auditLog` to `tablesFilter`.
- `lib/env/index.ts`, `lib/env/client.ts` — new vars.
- `eslint.config.*` — `no-console` rule with overrides.
- `app/error.tsx`, `app/global-error.tsx` — Sentry capture.
- The 24 `console.*` call sites (Task 3 list).
- `features/transactions/actions/{createTransaction,updateTransaction,deleteTransaction}.ts` + `app/api/upload/route.ts` — audit instrumentation.
- `app/api/crypto/unlock/route.ts`, `app/api/crypto/lock/route.ts`, `features/crypto/actions/setupCrypto.ts`, `features/settings/actions/{changePassphrase,rotateRecovery}.ts`, the reset-encryption action — security-event instrumentation.
- `PLAN.md` — check off items.

---

## Task 1: pino logger module

**Files:**
- Create: `lib/log/index.ts`
- Test: `lib/log/index.test.ts`

**Interfaces:**
- Produces: `log` (root pino `Logger`), `createLogger(mod: string): Logger` (returns `log.child({ mod })`), `REDACT_PATHS: string[]`.

- [ ] **Step 1: Install deps**

```bash
pnpm add pino && pnpm add -D pino-pretty
```

- [ ] **Step 2: Write the failing test**

`lib/log/index.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import pino from 'pino';
import { REDACT_PATHS } from './index';

// Build a logger that writes to an in-memory sink so we can assert on output.
const capture = () => {
  const lines: string[] = [];
  const logger = pino(
    { redact: { paths: REDACT_PATHS, censor: '[redacted]' }, base: null },
    { write: (s: string) => lines.push(s) }
  );
  return { logger, lines };
};

describe('logger redaction', () => {
  it('censors sensitive top-level keys', () => {
    const { logger, lines } = capture();
    logger.info({ passphrase: 'hunter2', userId: 'alice' }, 'unlock');
    const out = JSON.parse(lines[0]);
    expect(out.passphrase).toBe('[redacted]');
    expect(out.userId).toBe('alice');
  });

  it('censors nested secret/token keys', () => {
    const { logger, lines } = capture();
    logger.info({ ctx: { token: 't', secret: 's' } }, 'x');
    const out = JSON.parse(lines[0]);
    expect(out.ctx.token).toBe('[redacted]');
    expect(out.ctx.secret).toBe('[redacted]');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm vitest run lib/log/index.test.ts`
Expected: FAIL — cannot resolve `./index` / `REDACT_PATHS` undefined.

- [ ] **Step 4: Implement `lib/log/index.ts`**

```ts
import 'server-only';
import pino, { type Logger } from 'pino';

/**
 * Keys censored anywhere they appear in a logged object. This is a BACKSTOP,
 * not a license to log freely: never pass journal content, amounts, payee or
 * account names, passphrases, recovery codes, DEKs, or wraps to the logger —
 * pass only metadata (counts, sizes, ids, action names, result, reason).
 */
export const REDACT_PATHS = [
  'passphrase',
  'recoveryCode',
  'dek',
  'wrap',
  'password',
  'token',
  'authorization',
  'cookie',
  'secret',
  '*.passphrase',
  '*.recoveryCode',
  '*.dek',
  '*.wrap',
  '*.password',
  '*.token',
  '*.secret',
];

const level = process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'production' ? 'info' : 'debug');

const isDev = process.env.NODE_ENV !== 'production';

export const log: Logger = pino({
  level,
  redact: { paths: REDACT_PATHS, censor: '[redacted]' },
  // Pretty in dev; plain JSON to stdout in prod (captured by Coolify/Docker).
  ...(isDev
    ? { transport: { target: 'pino-pretty', options: { colorize: true } } }
    : {}),
});

/** Child logger tagged with a subsystem name: createLogger('journal'). */
export const createLogger = (mod: string): Logger => log.child({ mod });
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run lib/log/index.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add lib/log/index.ts lib/log/index.test.ts package.json pnpm-lock.yaml
git commit -m "feat(log): pino logger module with mandatory secret redaction"
```

---

## Task 2: GlitchTip / Sentry wiring (DSN-gated)

**Files:**
- Create: `lib/log/sentry.ts`, `lib/log/sentry.test.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`, `instrumentation-client.ts`
- Modify: `instrumentation.ts`, `lib/env/index.ts`, `lib/env/client.ts`, `app/error.tsx`, `app/global-error.tsx`, `lib/security/headers.ts`

**Interfaces:**
- Produces: `isSentryEnabled(): boolean` from `lib/log/sentry.ts`.

- [ ] **Step 1: Install SDK**

```bash
pnpm add @sentry/nextjs
```

- [ ] **Step 2: Add env vars**

In `lib/env/index.ts` `envSchema.extend({ ... })`, add:

```ts
    // Structured logging level (pino).
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
      .default('info'),
    // Error tracking (GlitchTip, Sentry-API-compatible). Absent ⇒ disabled.
    SENTRY_DSN: z.string().url().optional(),
    SENTRY_ENVIRONMENT: z.string().optional(),
```

In `lib/env/client.ts` `clientEnvSchema`, add (browser SDK needs the DSN exposed):

```ts
  // Same value as SENTRY_DSN; exposed so the browser SDK can initialise.
  // Absent ⇒ client error reporting disabled.
  NEXT_PUBLIC_SENTRY_DSN: z.preprocess(emptyToUndefined, z.string().url().optional()),
```

- [ ] **Step 3: Write the failing test**

`lib/log/sentry.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isSentryEnabled } from './sentry';

describe('isSentryEnabled', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('is false when SENTRY_DSN is unset', () => {
    vi.stubEnv('SENTRY_DSN', '');
    expect(isSentryEnabled()).toBe(false);
  });

  it('is true when SENTRY_DSN is set', () => {
    vi.stubEnv('SENTRY_DSN', 'https://abc@glitchtip.example/1');
    expect(isSentryEnabled()).toBe(true);
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `pnpm vitest run lib/log/sentry.test.ts`
Expected: FAIL — cannot resolve `./sentry`.

- [ ] **Step 5: Implement `lib/log/sentry.ts`**

```ts
import 'server-only';

/** True iff an error-tracking DSN is configured. Gates all Sentry init. */
export const isSentryEnabled = (): boolean => Boolean(process.env.SENTRY_DSN);
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm vitest run lib/log/sentry.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 7: Create the Sentry init files (all DSN-gated)**

`sentry.server.config.ts`:

```ts
import * as Sentry from '@sentry/nextjs';

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
    tracesSampleRate: 0,
  });
}
```

`sentry.edge.config.ts`:

```ts
import * as Sentry from '@sentry/nextjs';

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
    tracesSampleRate: 0,
  });
}
```

`instrumentation-client.ts`:

```ts
import * as Sentry from '@sentry/nextjs';

if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NEXT_PUBLIC_APP_ENV,
    tracesSampleRate: 0,
  });
}
```

- [ ] **Step 8: Wire `instrumentation.ts`**

Replace the file with:

```ts
export const register = async (): Promise<void> => {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
    const { registerPriceCron } = await import('@/lib/prices/scheduler');
    registerPriceCron();
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
};

export { captureRequestError as onRequestError } from '@sentry/nextjs';
```

- [ ] **Step 9: Capture in error boundaries**

In `app/error.tsx` and `app/global-error.tsx`, inside the existing `useEffect`/error handler that currently calls `console.error`, add (keep the generic UI unchanged):

```tsx
import * as Sentry from '@sentry/nextjs';
// ...inside the effect that receives `error`:
Sentry.captureException(error);
```

Remove the bare `console.error(error)` from these two client files (Sentry now owns reporting; nothing else should reach the client).

- [ ] **Step 10: CSP — allow the GlitchTip ingest origin**

In `lib/security/headers.ts`, confirm `connect-src`. Since `SENTRY_DSN` is server-only and CSP is built per-request, derive the ingest origin from `NEXT_PUBLIC_SENTRY_DSN` when present and append its origin to `connect-src`. Add a focused unit assertion in the existing headers test (or a new `lib/security/headers.test.ts` case) that when `NEXT_PUBLIC_SENTRY_DSN` is set, its origin appears in `connect-src`; when unset, `connect-src` is unchanged.

```ts
// pseudocode inside the connect-src assembly:
const sentryOrigin = process.env.NEXT_PUBLIC_SENTRY_DSN
  ? new URL(process.env.NEXT_PUBLIC_SENTRY_DSN).origin
  : null;
const connectSrc = ["'self'", sentryOrigin].filter(Boolean).join(' ');
```

- [ ] **Step 11: Verify**

Run: `pnpm vitest run lib/log lib/security && pnpm type-check && pnpm lint`
Expected: PASS / clean.

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "feat(log): GlitchTip error tracking via @sentry/nextjs (DSN-gated) + CSP"
```

---

## Task 3: Migrate console.* to the logger + no-console rule

**Files:**
- Modify: all node-runtime `console.*` call sites; `eslint.config.*`

**Interfaces:**
- Consumes: `createLogger` from `@/lib/log` (Task 1).

- [ ] **Step 1: Replace each server-side `console.*` call**

Pattern — at the top of each file add `import { createLogger } from '@/lib/log';` and a module logger `const log = createLogger('<mod>');`, then:
- `console.error('msg', err)` → `log.error({ err }, 'msg')`
- `console.warn('msg', x)` → `log.warn({ x }, 'msg')`
- `console.log('msg')` → `log.info('msg')`

Call sites (from the survey), with the `mod` tag to use:

| File | mod |
|---|---|
| `lib/settings/getBaseCurrency.ts` | `settings` |
| `lib/prices/scheduler.ts` | `prices` |
| `lib/prices/service.ts` | `prices` |
| `lib/storage/download.ts` | `storage` |
| `app/api/upload/route.ts` | `upload` |
| `app/api/account/export/route.ts` | `export` |
| `app/api/transactions/export/route.ts` | `export` |
| `app/api/balance/export/route.ts` | `export` |
| `app/api/balance/periodic/export/route.ts` | `export` |
| `app/api/accounts/export/route.ts` | `export` |
| `app/api/monthly/export/route.ts` | `export` |
| `app/api/payees/export/route.ts` | `export` |
| `app/api/net-worth/export/route.ts` | `export` |
| `app/api/debts/export/route.ts` | `export` |
| `app/api/reconcile/export/route.ts` | `export` |
| `app/api/portfolio/export/route.ts` | `export` |
| `features/crypto/actions/finalizeEncryption.ts` | `crypto` |

Worked example — `lib/storage/download.ts`. Replace:

```ts
console.error('Failed to download from remote', err);
```

with:

```ts
import { createLogger } from '@/lib/log';
const log = createLogger('storage');
// ...
log.error({ err }, 'failed to download from remote');
```

**Client component exception:** `features/accounts/Accounts.tsx` is a client component — pino cannot run there. Leave its `console.error` as-is OR route it through `Sentry.captureException`; do NOT import `@/lib/log` (server-only) into it. Same for `app/error.tsx` / `app/global-error.tsx` (already handled in Task 2).

- [ ] **Step 2: Add `no-console` eslint rule with overrides**

In the flat eslint config, add a global rule `'no-console': 'error'` and overrides allowing console in:
- `lib/log/**` (the logger may fall back to console internally — and the file is the sanctioned exception)
- `instrumentation*.ts`, `sentry.*.config.ts`
- `**/*.test.ts`, `**/*.test.tsx`
- `*.config.{ts,js,mjs}`, `scripts/**`
- client components that legitimately need it (`features/accounts/Accounts.tsx`, `app/error.tsx`, `app/global-error.tsx`) — or refactor those to Sentry and omit them from the allowlist.

Flat-config override shape:

```js
{
  files: ['lib/log/**', 'instrumentation*.ts', 'sentry.*.config.ts', '**/*.test.ts', '**/*.test.tsx', '*.config.{ts,js,mjs}', 'scripts/**'],
  rules: { 'no-console': 'off' },
},
```

- [ ] **Step 3: Verify the rule catches regressions and the tree is clean**

Run: `pnpm lint`
Expected: clean (0 errors). If `no-console` flags a file you intended to migrate, migrate it; if it flags a legitimate client file, add it to the override.

- [ ] **Step 4: Verify suite**

Run: `pnpm test && pnpm type-check`
Expected: green / clean.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(log): route server console.* through structured logger + no-console rule"
```

---

## Task 4: auditLog table + migration

**Files:**
- Create: `db/schema/auditLog.ts`, `db/migrations/0006_*.sql`
- Modify: `db/schema/index.ts`, `drizzle.config.ts`

**Interfaces:**
- Produces: `auditLog` table + `AuditLog` / `NewAuditLog` types.

- [ ] **Step 1: Create `db/schema/auditLog.ts`**

```ts
import { sql } from 'drizzle-orm';
import { user } from '@naeemba/next-starter/schema';
import { integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const auditLog = pgTable('auditLog', {
  id: text('id').primaryKey(),
  userId: text('userId')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  // Action name, validated app-side by the Zod AUDIT_ACTIONS enum.
  action: text('action').notNull(),
  // 'success' | 'failure'.
  result: text('result').notNull(),
  // Transaction ULID, where the action targets a specific transaction.
  targetUid: text('targetUid'),
  // Journal-dir size (bytes) before/after a journal mutation.
  bytesBefore: integer('bytesBefore'),
  bytesAfter: integer('bytesAfter'),
  // Small metadata only — NEVER journal content. e.g. { fileCount } / { reason }.
  detail: jsonb('detail'),
  ip: text('ip'),
  userAgent: text('userAgent'),
  createdAt: timestamp('createdAt')
    .notNull()
    .default(sql`now()`),
});

export type AuditLog = typeof auditLog.$inferSelect;
export type NewAuditLog = typeof auditLog.$inferInsert;
```

- [ ] **Step 2: Re-export from `db/schema/index.ts`**

Add (alphabetically near the top):

```ts
export { auditLog, type AuditLog, type NewAuditLog } from './auditLog';
```

- [ ] **Step 3: Add `auditLog` to `drizzle.config.ts` `tablesFilter`**

Add `'auditLog',` to the `tablesFilter` array.

- [ ] **Step 4: Generate the migration**

Run: `pnpm dotenv -e .env -- pnpm db:generate`
Expected: creates `db/migrations/0006_*.sql` containing `CREATE TABLE "auditLog" (...)` with the FK to `"user"`. Inspect it; confirm no unrelated tables are dropped.

- [ ] **Step 5: Verify it applies in the test harness**

Add a temporary smoke test or run the existing suite — `setupTestDb` applies `db/migrations/*.sql`, so a malformed migration fails here.

Run: `pnpm test && pnpm type-check`
Expected: green / clean.

- [ ] **Step 6: Commit**

```bash
git add db/schema/auditLog.ts db/schema/index.ts drizzle.config.ts db/migrations/
git commit -m "feat(audit): auditLog table + migration"
```

---

## Task 5: Audit Zod schema + Repository

**Files:**
- Create: `lib/audit/schema.ts`, `lib/audit/repository.ts`, `lib/audit/repository.test.ts`

**Interfaces:**
- Produces:
  - `AUDIT_ACTIONS` (readonly tuple) + `AuditAction` type + `auditEventSchema` (Zod) + `AuditEvent` type from `schema.ts`.
  - `AuditRepository` class: `constructor(db: DbInstance)`, `insert(userId: string, event: AuditEvent): Promise<AuditLog>`, `listByUser(userId: string, limit?: number): Promise<AuditLog[]>`.

- [ ] **Step 1: Create `lib/audit/schema.ts`**

```ts
import { z } from 'zod';

export const AUDIT_ACTIONS = [
  'tx.add',
  'tx.edit',
  'tx.delete',
  'journal.import',
  'crypto.enable',
  'crypto.unlock',
  'crypto.lock',
  'crypto.passphrase-change',
  'crypto.recovery-rotate',
  'crypto.reset',
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const auditEventSchema = z.object({
  action: z.enum(AUDIT_ACTIONS),
  result: z.enum(['success', 'failure']),
  targetUid: z.string().optional(),
  bytesBefore: z.number().int().nonnegative().optional(),
  bytesAfter: z.number().int().nonnegative().optional(),
  // Small metadata only — never journal content.
  detail: z.record(z.string(), z.unknown()).optional(),
  ip: z.string().optional(),
  userAgent: z.string().optional(),
});

export type AuditEvent = z.infer<typeof auditEventSchema>;
```

- [ ] **Step 2: Write the failing test**

`lib/audit/repository.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AuditRepository } from './repository';
import type { AuditEvent } from './schema';
import {
  setupTestDb,
  teardownTestDb,
  type TestDbContext,
} from '@/lib/test-utils/db';

const event: AuditEvent = {
  action: 'tx.add',
  result: 'success',
  targetUid: '01HSAMPLEULID00000000000000',
  bytesBefore: 100,
  bytesAfter: 180,
  detail: { source: 'form' },
};

describe('AuditRepository', () => {
  let ctx: TestDbContext;
  let repo: AuditRepository;

  beforeEach(async () => {
    ctx = await setupTestDb('audit-');
    await ctx.insertUser('alice');
    await ctx.insertUser('bob');
    repo = new AuditRepository(ctx.db);
  });

  afterEach(async () => {
    await teardownTestDb(ctx);
  });

  it('insert returns a row with a ULID id and the given fields', async () => {
    const row = await repo.insert('alice', event);
    expect(row.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(row.userId).toBe('alice');
    expect(row.action).toBe('tx.add');
    expect(row.result).toBe('success');
    expect(row.bytesBefore).toBe(100);
    expect(row.bytesAfter).toBe(180);
    expect(row.detail).toEqual({ source: 'form' });
  });

  it('listByUser returns only that user rows, newest first', async () => {
    await repo.insert('alice', { action: 'tx.add', result: 'success' });
    await repo.insert('alice', { action: 'tx.delete', result: 'success' });
    await repo.insert('bob', { action: 'tx.add', result: 'success' });
    const rows = await repo.listByUser('alice');
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.userId === 'alice')).toBe(true);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm vitest run lib/audit/repository.test.ts`
Expected: FAIL — cannot resolve `./repository`.

- [ ] **Step 4: Implement `lib/audit/repository.ts`**

```ts
import { desc, eq } from 'drizzle-orm';
import type { AuditEvent } from './schema';
import { auditLog, type AuditLog } from '@/db/schema/auditLog';
import type { DbInstance } from '@/lib/db/connection';
import { generateUid } from '@/lib/journal/uid';

export class AuditRepository {
  constructor(private readonly db: DbInstance) {}

  async insert(userId: string, event: AuditEvent): Promise<AuditLog> {
    const rows = await this.db
      .insert(auditLog)
      .values({
        id: generateUid(),
        userId,
        action: event.action,
        result: event.result,
        targetUid: event.targetUid ?? null,
        bytesBefore: event.bytesBefore ?? null,
        bytesAfter: event.bytesAfter ?? null,
        detail: event.detail ?? null,
        ip: event.ip ?? null,
        userAgent: event.userAgent ?? null,
      })
      .returning();
    return rows[0];
  }

  async listByUser(userId: string, limit = 100): Promise<AuditLog[]> {
    return this.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.userId, userId))
      .orderBy(desc(auditLog.createdAt))
      .limit(limit);
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run lib/audit/repository.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add lib/audit/schema.ts lib/audit/repository.ts lib/audit/repository.test.ts
git commit -m "feat(audit): event schema + repository"
```

---

## Task 6: AuditService (best-effort record) + barrel + headers helper

**Files:**
- Create: `lib/audit/service.ts`, `lib/audit/service.test.ts`, `lib/audit/index.ts`, `lib/audit/headers.ts`

**Interfaces:**
- Consumes: `AuditRepository` (Task 5), `auditEventSchema`/`AuditEvent` (Task 5), `createLogger` (Task 1), `db` from `@/lib/db`.
- Produces:
  - `AuditService` class: `constructor(repo: AuditRepository)`, `record(userId: string, event: AuditEvent): Promise<void>` (NEVER throws).
  - `auditService` singleton (wired to the real `db`).
  - `auditRequestMeta(): Promise<{ ip?: string; userAgent?: string }>` from `headers.ts`.

- [ ] **Step 1: Write the failing test**

`lib/audit/service.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { AuditService } from './service';
import type { AuditRepository } from './repository';

const okRepo = () =>
  ({ insert: vi.fn().mockResolvedValue({ id: 'x' }) }) as unknown as AuditRepository;

describe('AuditService.record', () => {
  it('forwards a valid event to the repository', async () => {
    const repo = okRepo();
    const svc = new AuditService(repo);
    await svc.record('alice', { action: 'tx.add', result: 'success' });
    expect(repo.insert).toHaveBeenCalledWith('alice', expect.objectContaining({ action: 'tx.add' }));
  });

  it('never throws when the repository insert rejects (best-effort)', async () => {
    const repo = { insert: vi.fn().mockRejectedValue(new Error('db down')) } as unknown as AuditRepository;
    const svc = new AuditService(repo);
    await expect(svc.record('alice', { action: 'tx.add', result: 'success' })).resolves.toBeUndefined();
  });

  it('never throws (and does not insert) when the event is invalid', async () => {
    const repo = okRepo();
    const svc = new AuditService(repo);
    // @ts-expect-error invalid action on purpose
    await expect(svc.record('alice', { action: 'nope', result: 'success' })).resolves.toBeUndefined();
    expect(repo.insert).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run lib/audit/service.test.ts`
Expected: FAIL — cannot resolve `./service`.

- [ ] **Step 3: Implement `lib/audit/service.ts`**

```ts
import 'server-only';
import { AuditRepository } from './repository';
import { auditEventSchema, type AuditEvent } from './schema';
import { db } from '@/lib/db';
import { createLogger } from '@/lib/log';

const log = createLogger('audit');

export class AuditService {
  constructor(private readonly repo: AuditRepository) {}

  /**
   * Records an audit event. BEST-EFFORT: validates the event, inserts it, and
   * swallows any failure (logged, never thrown) so an audit-write problem can
   * never fail or roll back the user's actual action.
   */
  async record(userId: string, event: AuditEvent): Promise<void> {
    const parsed = auditEventSchema.safeParse(event);
    if (!parsed.success) {
      log.error({ action: (event as { action?: unknown }).action, issues: parsed.error.issues }, 'invalid audit event dropped');
      return;
    }
    try {
      await this.repo.insert(userId, parsed.data);
    } catch (err) {
      log.error({ err, action: parsed.data.action }, 'audit insert failed');
    }
  }
}

export const auditService = new AuditService(new AuditRepository(db));
```

- [ ] **Step 4: Implement `lib/audit/headers.ts`**

```ts
import 'server-only';
import { headers } from 'next/headers';

/** Best-effort request metadata for audit rows. Never throws. */
export const auditRequestMeta = async (): Promise<{ ip?: string; userAgent?: string }> => {
  try {
    const h = await headers();
    const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() || undefined;
    const userAgent = h.get('user-agent') ?? undefined;
    return { ip, userAgent };
  } catch {
    return {};
  }
};
```

- [ ] **Step 5: Implement `lib/audit/index.ts`**

```ts
export { AuditService, auditService } from './service';
export { AuditRepository } from './repository';
export { auditRequestMeta } from './headers';
export { AUDIT_ACTIONS, auditEventSchema } from './schema';
export type { AuditAction, AuditEvent } from './schema';
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm vitest run lib/audit/service.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 7: Verify**

Run: `pnpm test && pnpm type-check && pnpm lint`
Expected: green / clean.

- [ ] **Step 8: Commit**

```bash
git add lib/audit/
git commit -m "feat(audit): best-effort AuditService + request-meta helper + barrel"
```

---

## Task 7: Instrument journal mutations (tx.* + journal.import)

**Files:**
- Modify: `features/transactions/actions/createTransaction.ts`, `features/transactions/actions/updateTransaction.ts`, `features/transactions/actions/deleteTransaction.ts`, `app/api/upload/route.ts`
- Test: `features/transactions/actions/audit.test.ts` (new integration-style test)

**Interfaces:**
- Consumes: `auditService` + `auditRequestMeta` from `@/lib/audit` (Task 6); `getJournalDirSize` from `@/lib/journal/quota`.

> Note: exact filenames under `features/transactions/actions/` — confirm with `ls features/transactions/actions/`. The create action is shown in the spec context; edit/delete mirror it (`updateTransactionAction`, `deleteTransactionAction`). Instrument whichever files export those.

- [ ] **Step 1: Instrument `createTransactionAction`**

In `features/transactions/actions/createTransaction.ts`, after `const user = await requireUser();` and the rate-limit check, wrap the `journalService.addTransaction` call:

```ts
import { auditService, auditRequestMeta } from '@/lib/audit';
import { getJournalDirSize } from '@/lib/journal/quota';
// ...
  const meta = await auditRequestMeta();
  const bytesBefore = await getJournalDirSize(user.id);
  const result = await journalService.addTransaction(user.id, parsed);
  const bytesAfter = await getJournalDirSize(user.id);
  await auditService.record(user.id, {
    action: 'tx.add',
    result: result.ok ? 'success' : 'failure',
    targetUid: result.ok ? result.uid : undefined,
    bytesBefore,
    bytesAfter,
    detail: result.ok ? undefined : { reason: result.formError ?? 'invalid' },
    ...meta,
  });
  if (!result.ok) {
    return { ok: false, fieldErrors: result.fieldErrors, formError: result.formError };
  }
  return { ok: true };
```

> If `result` does not expose `uid` on success, omit `targetUid` (read the `WriteResult` type in `lib/journal/service.ts` and use the uid field if present; otherwise drop it). Do not invent a field.

- [ ] **Step 2: Instrument `updateTransactionAction` and `deleteTransactionAction`**

Same shape, with `action: 'tx.edit'` and `action: 'tx.delete'` respectively, measuring `bytesBefore`/`bytesAfter` around the service call and recording `result`/`targetUid`/`reason`.

- [ ] **Step 3: Instrument the import route**

In `app/api/upload/route.ts`, around the `replaceFromSingleFile` / `replaceFromZip` call:

```ts
import { auditService, auditRequestMeta } from '@/lib/audit';
import { getJournalDirSize } from '@/lib/journal/quota';
// ...
  const meta = await auditRequestMeta();
  const bytesBefore = await getJournalDirSize(user.id);
  // ... existing replace call → `outcome` ...
  const bytesAfter = await getJournalDirSize(user.id);
  await auditService.record(user.id, {
    action: 'journal.import',
    result: outcome.ok ? 'success' : 'failure',
    bytesBefore,
    bytesAfter,
    detail: { kind: isZip ? 'zip' : 'single' },
    ...meta,
  });
```

(Match `outcome.ok` and `isZip` to the route's actual variable names.)

- [ ] **Step 4: Write the integration test**

`features/transactions/actions/audit.test.ts` — exercise the audit Repository + Service against a real journal mutation path using `setupTestDb`. Since the actions pull `requireUser`/`headers` from request context (hard to invoke directly in vitest), test the **recording contract** instead: call `auditService.record` through a service bound to the test db and assert rows land with correct fields, AND assert `getJournalDirSize` produces a growing delta across an `addTransaction`.

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AuditRepository } from '@/lib/audit';
import { AuditService } from '@/lib/audit/service';
import { setupTestDb, teardownTestDb, type TestDbContext } from '@/lib/test-utils/db';

describe('audit recording for journal mutations', () => {
  let ctx: TestDbContext;
  let svc: AuditService;

  beforeEach(async () => {
    ctx = await setupTestDb('audit-tx-');
    await ctx.insertUser('alice');
    svc = new AuditService(new AuditRepository(ctx.db));
  });
  afterEach(async () => teardownTestDb(ctx));

  it('records add/edit/delete with byte deltas', async () => {
    await svc.record('alice', { action: 'tx.add', result: 'success', bytesBefore: 0, bytesAfter: 120, targetUid: 'U1' });
    await svc.record('alice', { action: 'tx.edit', result: 'success', bytesBefore: 120, bytesAfter: 130, targetUid: 'U1' });
    await svc.record('alice', { action: 'tx.delete', result: 'success', bytesBefore: 130, bytesAfter: 0, targetUid: 'U1' });
    const repo = new AuditRepository(ctx.db);
    const rows = await repo.listByUser('alice');
    expect(rows.map((r) => r.action).sort()).toEqual(['tx.add', 'tx.delete', 'tx.edit']);
  });
});
```

> Rationale logged in the plan: the server actions read `requireUser()`/`headers()` from Next request scope, which vitest's node env doesn't provide; testing the recording contract + the byte-size helper covers the audit logic without a full Next request harness. (`JournalService` round-trips are already covered by `lib/journal/integration.test.ts`.)

- [ ] **Step 5: Run tests**

Run: `pnpm vitest run features/transactions/actions/audit.test.ts && pnpm type-check && pnpm lint`
Expected: PASS / clean.

- [ ] **Step 6: Commit**

```bash
git add features/transactions/actions/ app/api/upload/route.ts
git commit -m "feat(audit): record journal mutations (add/edit/delete/import) with byte deltas"
```

---

## Task 8: Instrument security events (crypto.*)

**Files:**
- Modify: `app/api/crypto/unlock/route.ts`, `app/api/crypto/lock/route.ts`, `features/crypto/actions/setupCrypto.ts`, `features/settings/actions/changePassphrase.ts`, `features/settings/actions/rotateRecovery.ts`, the reset-encryption action under `features/settings/actions/`

**Interfaces:**
- Consumes: `auditService`, `auditRequestMeta` from `@/lib/audit` (Task 6).

- [ ] **Step 1: Map each entry point to its action**

| Entry point | action |
|---|---|
| `app/api/crypto/unlock/route.ts` (on successful DEK set) | `crypto.unlock` |
| `app/api/crypto/lock/route.ts` | `crypto.lock` |
| `features/crypto/actions/setupCrypto.ts` (on enable success) | `crypto.enable` |
| `features/settings/actions/changePassphrase.ts` | `crypto.passphrase-change` |
| `features/settings/actions/rotateRecovery.ts` | `crypto.recovery-rotate` |
| reset-encryption action (`features/settings/actions/`) | `crypto.reset` |

> Confirm the reset action's filename with `ls features/settings/actions/`.

- [ ] **Step 2: Add a `record` call at each success/failure point**

Example for the unlock route — after the DEK is successfully set and before returning the success response, and in the catch/failure branches:

```ts
import { auditService, auditRequestMeta } from '@/lib/audit';
// ...success path:
await auditService.record(user.id, { action: 'crypto.unlock', result: 'success', ...(await auditRequestMeta()) });
// ...failure path (bad DEK / decode error), before returning the 4xx:
await auditService.record(user.id, { action: 'crypto.unlock', result: 'failure', detail: { reason: 'decode' }, ...(await auditRequestMeta()) });
```

Apply the analogous one-liner in each of the six entry points, choosing `result: 'success' | 'failure'` from the existing control flow and adding a short non-sensitive `reason` to `detail` on failures. **Never** include the passphrase, recovery code, DEK, or wrap in `detail` (the logger redaction is a backstop, but do not pass them at all).

- [ ] **Step 3: Verify**

Run: `pnpm test && pnpm type-check && pnpm lint`
Expected: green / clean. (No new unit test here — these are thin call-site additions through the already-tested `auditService`; the recording contract is covered by Task 6/7.)

- [ ] **Step 4: Commit**

```bash
git add app/api/crypto/ features/crypto/actions/ features/settings/actions/
git commit -m "feat(audit): record security events (unlock/lock/enable/passphrase/recovery/reset)"
```

---

## Task 9: PLAN.md + final verification

**Files:**
- Modify: `PLAN.md`

- [ ] **Step 1: Check off Phase 7 items**

In `PLAN.md` Phase 7:
- `- [ ] Audit log of journal mutations...` → `- [x]` (note: + security events, store-only; viewer UI deferred).
- `- [ ] Structured logging + an error-tracking destination` → `- [x]` (pino + GlitchTip).
- Correct the stale `- [ ]` Garage and encrypted-journals lines to `- [x]` (both merged).
- Add a future bullet under Phase 7 or Phase 8: "audit-log retention/pruning cron + per-user Activity (`/settings`) viewer UI".

- [ ] **Step 2: Full verification**

Run: `pnpm test && pnpm type-check && pnpm lint`
Expected: all green / clean. Capture the test count.

- [ ] **Step 3: Manual smoke checklist (note in PR body — needs Postgres dev env)**

- With `SENTRY_DSN` unset: app boots, logs are pretty JSON in dev, no Sentry network calls.
- Add a transaction → an `auditLog` row appears (`action='tx.add'`, byte delta > 0).
- Unlock/lock/change-passphrase → corresponding rows.
- With `SENTRY_DSN`+`NEXT_PUBLIC_SENTRY_DSN` set to the GlitchTip project: throw a test error → event appears in GlitchTip; browser console shows no CSP `connect-src` violation.

- [ ] **Step 4: Commit**

```bash
git add PLAN.md
git commit -m "docs(phase7): mark logging + audit log complete"
```

---

## Self-Review

**Spec coverage:**
- Part A logger module + redaction → Task 1. ✓
- GlitchTip/Sentry DSN-gated init + error boundaries + CSP + env vars → Task 2. ✓
- Migrate 24 console.* + no-console rule → Task 3. ✓
- auditLog table (all columns) + migration + tablesFilter + index export → Task 4. ✓
- Repository (insert + listByUser) + Zod action enum → Task 5. ✓
- Best-effort `record()` never throws + headers helper + singleton → Task 6. ✓
- Journal-mutation instrumentation with byte deltas (tx.* + import) → Task 7. ✓
- Security-event instrumentation (crypto.*) → Task 8. ✓
- `account.delete` logger-only (not in table) → enforced by AUDIT_ACTIONS omitting it (Task 5) + noted in spec. ✓
- Tests: redaction, sentry-disabled, repo CRUD, best-effort, integration → Tasks 1,2,5,6,7. ✓
- PLAN.md updates + out-of-scope notes → Task 9. ✓

**Placeholder scan:** No "TBD"/"implement later". Two call-out notes ask the implementer to confirm exact existing filenames/field names (`WriteResult.uid`, reset-action filename, upload-route var names) rather than invent them — these are correctness guards, not placeholders.

**Type consistency:** `AuditEvent`/`AuditAction`/`auditEventSchema` defined in Task 5, consumed unchanged in Tasks 6–8. `AuditRepository.insert(userId, event)` / `listByUser(userId, limit?)` and `AuditService.record(userId, event)` signatures consistent across Tasks 5–8. `createLogger(mod)` from Task 1 used in Tasks 3, 6. `isSentryEnabled()` from Task 2 (defined, available for future use).
