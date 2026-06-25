# Phase 7 Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-user rate limiting, a strict nonce-based CSP + security headers, and a cumulative per-user journal quota to close the three open Phase 7 hardening gaps.

**Architecture:** A self-contained in-memory rate limiter (`lib/rate-limit/`) behind a one-method store interface, applied at `/api/upload` and every authenticated mutating server action. Security headers (incl. a nonce-based CSP) are emitted from a Next.js 16 `proxy.ts` using a pure `buildSecurityHeaders(nonce)` helper. A quota helper (`lib/journal/quota.ts`) plus a new `JOURNAL_QUOTA_MB` env var caps total journal-dir bytes, enforced centrally in `JournalService`.

**Tech Stack:** Next.js 16.2.6 (App Router, `proxy` convention), TypeScript (strict), Zod v4, Drizzle/Postgres, Vitest, pnpm. Edge runtime for `proxy.ts` (Web Crypto + `btoa` available).

## Global Constraints

- **Next.js 16 `proxy` convention:** the request-interception file is `proxy.ts` at the repo root, exporting `export function proxy(request: NextRequest)` and a `config.matcher`. Do NOT create `middleware.ts` (removed convention in this version).
- **Package manager is pnpm.** Verification commands: `pnpm test` (vitest run), `pnpm type-check` (tsc --noEmit), `pnpm lint` (eslint .).
- **Code style:** single quotes, semicolons, 2-space indent, Prettier-formatted (matches existing files). `server-only` import at the top of server-only modules; OMIT it from pure utilities that have unit tests (`lib/rate-limit/store.ts`, `lib/security/headers.ts`) so Vitest can import them.
- **Result-shape rule:** rate-limited/quota outcomes must reuse each action's EXISTING result variants and fields — do NOT widen any `reason` union or change any consumer UI. Exact mappings are given per task.
- **Rate-limit state is in-memory, single-process** (single-container deploy). Keys are always `${policy.name}:${userId}` — every guarded surface is authenticated.
- **Single-sourced limits:** quota MB is read from `process.env.JOURNAL_QUOTA_MB` (default 100) lazily, mirroring `lib/journal/layout.ts`'s `DATA_DIR` pattern, AND declared in `lib/env/index.ts` for startup validation.

---

### Task 1: Rate-limit core module (`lib/rate-limit/`)

**Files:**
- Create: `lib/rate-limit/store.ts`
- Create: `lib/rate-limit/limits.ts`
- Create: `lib/rate-limit/index.ts`
- Test: `lib/rate-limit/store.test.ts`

**Interfaces:**
- Produces:
  - `interface RateLimitPolicy { name: string; max: number; windowMs: number }`
  - `interface RateLimitResult { allowed: boolean; remaining: number; resetAt: number }`
  - `class MemoryStore { constructor(now?: () => number); hit(key: string, policy: RateLimitPolicy): RateLimitResult }`
  - `const UPLOAD`, `WRITE`, `DESTRUCTIVE: RateLimitPolicy`; `const RATE_LIMIT_MESSAGE: string`
  - `function rateLimit(policy: RateLimitPolicy, userId: string): RateLimitResult`

- [ ] **Step 1: Write the failing test**

Create `lib/rate-limit/store.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { MemoryStore, type RateLimitPolicy } from './store';

const policy: RateLimitPolicy = { name: 'test', max: 3, windowMs: 1000 };

describe('MemoryStore', () => {
  it('allows hits up to the limit then blocks', () => {
    const store = new MemoryStore(() => 0);
    expect(store.hit('k', policy).allowed).toBe(true); // 1
    expect(store.hit('k', policy).allowed).toBe(true); // 2
    expect(store.hit('k', policy).allowed).toBe(true); // 3
    const fourth = store.hit('k', policy); // 4
    expect(fourth.allowed).toBe(false);
    expect(fourth.remaining).toBe(0);
    expect(fourth.resetAt).toBe(1000);
  });

  it('resets after the window elapses', () => {
    let now = 0;
    const store = new MemoryStore(() => now);
    store.hit('k', policy);
    store.hit('k', policy);
    store.hit('k', policy);
    expect(store.hit('k', policy).allowed).toBe(false);
    now = 1000; // window boundary reached
    expect(store.hit('k', policy).allowed).toBe(true);
  });

  it('tracks keys independently', () => {
    const store = new MemoryStore(() => 0);
    store.hit('a', policy);
    store.hit('a', policy);
    store.hit('a', policy);
    expect(store.hit('a', policy).allowed).toBe(false);
    expect(store.hit('b', policy).allowed).toBe(true);
  });

  it('reports remaining correctly', () => {
    const store = new MemoryStore(() => 0);
    expect(store.hit('k', policy).remaining).toBe(2);
    expect(store.hit('k', policy).remaining).toBe(1);
    expect(store.hit('k', policy).remaining).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test lib/rate-limit/store.test.ts`
Expected: FAIL — cannot find module `./store`.

- [ ] **Step 3: Write `lib/rate-limit/store.ts`**

```ts
export interface RateLimitPolicy {
  name: string;
  max: number;
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

export interface RateLimitStore {
  hit(key: string, policy: RateLimitPolicy): RateLimitResult;
}

interface Bucket {
  count: number;
  resetAt: number;
}

const SWEEP_EVERY = 1000;

/**
 * Fixed-window counter, single-process. Keyed by an opaque string. The clock is
 * injectable for deterministic tests. Stale buckets are swept lazily so the map
 * cannot grow without bound.
 */
export class MemoryStore implements RateLimitStore {
  private readonly buckets = new Map<string, Bucket>();
  private hits = 0;

  constructor(private readonly now: () => number = Date.now) {}

  hit(key: string, policy: RateLimitPolicy): RateLimitResult {
    const t = this.now();
    if (++this.hits % SWEEP_EVERY === 0) this.sweep(t);

    let bucket = this.buckets.get(key);
    if (!bucket || t >= bucket.resetAt) {
      bucket = { count: 0, resetAt: t + policy.windowMs };
      this.buckets.set(key, bucket);
    }
    bucket.count++;
    return {
      allowed: bucket.count <= policy.max,
      remaining: Math.max(0, policy.max - bucket.count),
      resetAt: bucket.resetAt,
    };
  }

  private sweep(t: number): void {
    for (const [key, bucket] of this.buckets) {
      if (t >= bucket.resetAt) this.buckets.delete(key);
    }
  }
}
```

- [ ] **Step 4: Write `lib/rate-limit/limits.ts`**

```ts
import type { RateLimitPolicy } from './store';

/** Expensive import + ledger parse. */
export const UPLOAD: RateLimitPolicy = {
  name: 'upload',
  max: 10,
  windowMs: 60_000,
};

/** Journal/template/saved-view/settings mutations. */
export const WRITE: RateLimitPolicy = {
  name: 'write',
  max: 60,
  windowMs: 60_000,
};

/** Account-deletion request & verify. */
export const DESTRUCTIVE: RateLimitPolicy = {
  name: 'destructive',
  max: 5,
  windowMs: 60_000,
};

export const RATE_LIMIT_MESSAGE =
  'Too many requests. Please wait a moment and try again.';
```

- [ ] **Step 5: Write `lib/rate-limit/index.ts`**

```ts
import 'server-only';
import { MemoryStore, type RateLimitPolicy, type RateLimitResult } from './store';

const store = new MemoryStore();

/** Per-user rate-limit check against a named policy. */
export function rateLimit(
  policy: RateLimitPolicy,
  userId: string
): RateLimitResult {
  return store.hit(`${policy.name}:${userId}`, policy);
}

export { UPLOAD, WRITE, DESTRUCTIVE, RATE_LIMIT_MESSAGE } from './limits';
export type { RateLimitPolicy, RateLimitResult } from './store';
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm test lib/rate-limit/store.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 7: Type-check and commit**

```bash
pnpm type-check
git add lib/rate-limit
git commit -m "feat(rate-limit): in-memory fixed-window rate limiter"
```

---

### Task 2: Rate-limit `/api/upload`

**Files:**
- Modify: `app/api/upload/route.ts`

**Interfaces:**
- Consumes: `rateLimit`, `UPLOAD` from `@/lib/rate-limit`.

- [ ] **Step 1: Add the guard after `requireUser()`**

In `app/api/upload/route.ts`, add to the imports:

```ts
import { rateLimit, UPLOAD } from '@/lib/rate-limit';
```

Then immediately after `const user = await requireUser();` (line 11), insert:

```ts
  const limit = rateLimit(UPLOAD, user.id);
  if (!limit.allowed) {
    const retryAfter = Math.ceil((limit.resetAt - Date.now()) / 1000);
    return NextResponse.json(
      { error: 'Too many uploads. Please wait a moment and try again.' },
      { status: 429, headers: { 'Retry-After': String(Math.max(1, retryAfter)) } }
    );
  }
```

- [ ] **Step 2: Verify**

Run: `pnpm type-check && pnpm lint`
Expected: both pass.

- [ ] **Step 3: Commit**

```bash
git add app/api/upload/route.ts
git commit -m "feat(rate-limit): throttle /api/upload (429 + Retry-After)"
```

---

### Task 3: Rate-limit transaction actions

**Files:**
- Modify: `features/transactions/actions/createTransaction.ts`
- Modify: `features/transactions/actions/updateTransaction.ts`
- Modify: `features/transactions/actions/deleteTransaction.ts`

**Interfaces:**
- Consumes: `rateLimit`, `WRITE`, `RATE_LIMIT_MESSAGE` from `@/lib/rate-limit`.
- Mapping: these return `TransactionActionState` (`{ ok; fieldErrors?; formError? }`). Rate-limited → `{ ok: false, formError: RATE_LIMIT_MESSAGE }`.

- [ ] **Step 1: Guard `createTransaction.ts`**

Add import:

```ts
import { rateLimit, WRITE, RATE_LIMIT_MESSAGE } from '@/lib/rate-limit';
```

After `const user = await requireUser();`, insert:

```ts
  if (!rateLimit(WRITE, user.id).allowed) {
    return { ok: false, formError: RATE_LIMIT_MESSAGE };
  }
```

- [ ] **Step 2: Guard `updateTransaction.ts` and `deleteTransaction.ts` the same way**

Open each file. Add the same import. After the file's `const user = await requireUser();`, insert the same three-line guard returning `{ ok: false, formError: RATE_LIMIT_MESSAGE }` (both return `TransactionActionState`, so this shape type-checks in both).

- [ ] **Step 3: Verify**

Run: `pnpm type-check && pnpm lint`
Expected: both pass.

- [ ] **Step 4: Commit**

```bash
git add features/transactions/actions
git commit -m "feat(rate-limit): throttle transaction add/edit/delete actions"
```

---

### Task 4: Rate-limit template, saved-view, and saved-currency actions

**Files:**
- Modify: `features/templates/actions/saveTemplate.ts`
- Modify: `features/templates/actions/renameTemplate.ts`
- Modify: `features/templates/actions/deleteTemplate.ts`
- Modify: `features/savedViews/actions/saveSavedView.ts`
- Modify: `features/savedViews/actions/renameSavedView.ts`
- Modify: `features/savedViews/actions/deleteSavedView.ts`
- Modify: `features/settings/actions/setSavedBaseCurrency.ts`

**Interfaces:**
- Consumes: `rateLimit`, `WRITE`, `RATE_LIMIT_MESSAGE` from `@/lib/rate-limit`.
- Each guard goes right after that file's `const user = await requireUser();`. Map onto each file's existing union (no union widening):

| File | Rate-limited return value |
|------|---------------------------|
| `saveTemplate.ts` | `{ ok: false, reason: 'invalid', message: RATE_LIMIT_MESSAGE }` |
| `renameTemplate.ts` | `{ ok: false, reason: 'invalid', message: RATE_LIMIT_MESSAGE }` |
| `deleteTemplate.ts` | `{ ok: false, message: RATE_LIMIT_MESSAGE }` |
| `saveSavedView.ts` | `{ ok: false, reason: 'invalid', message: RATE_LIMIT_MESSAGE }` |
| `renameSavedView.ts` | `{ ok: false, reason: 'invalid', message: RATE_LIMIT_MESSAGE }` |
| `deleteSavedView.ts` | `{ ok: false, message: RATE_LIMIT_MESSAGE }` |
| `setSavedBaseCurrency.ts` | `{ ok: false, message: RATE_LIMIT_MESSAGE }` |

> NOT rate-limited (documented exclusions): `setSessionBaseCurrency` / `clearSessionBaseCurrency` are anonymous cookie writes (no `userId` to key on, not abuse vectors); `refreshPrices` is already throttled to once-per-day at the price-service layer.

- [ ] **Step 1: Add import + guard to each of the seven files**

For every file above, add:

```ts
import { rateLimit, WRITE, RATE_LIMIT_MESSAGE } from '@/lib/rate-limit';
```

and, immediately after `const user = await requireUser();`, insert (substituting that file's return value from the table):

```ts
  if (!rateLimit(WRITE, user.id).allowed) {
    return <rate-limited return value for this file>;
  }
```

Example, `saveTemplate.ts`:

```ts
  if (!rateLimit(WRITE, user.id).allowed) {
    return { ok: false, reason: 'invalid', message: RATE_LIMIT_MESSAGE };
  }
```

- [ ] **Step 2: Verify**

Run: `pnpm type-check && pnpm lint`
Expected: both pass (each return value already matches its file's union).

- [ ] **Step 3: Commit**

```bash
git add features/templates/actions features/savedViews/actions features/settings/actions/setSavedBaseCurrency.ts
git commit -m "feat(rate-limit): throttle template, saved-view, and saved-currency writes"
```

---

### Task 5: Rate-limit account-deletion actions

**Files:**
- Modify: `features/settings/actions/requestAccountDeletion.ts`
- Modify: `features/settings/actions/deleteAccount.ts`

**Interfaces:**
- Consumes: `rateLimit`, `DESTRUCTIVE` from `@/lib/rate-limit`.
- Mapping (reuse existing reasons — no union change, no UI change):
  - `requestAccountDeletion` returns `IssueResult` → rate-limited = `{ ok: false, reason: 'throttled' }`.
  - `deleteAccount` returns `VerifyResult` → rate-limited = `{ ok: false, reason: 'too-many-attempts' }`.

- [ ] **Step 1: Guard `requestAccountDeletion.ts`**

```ts
import { rateLimit, DESTRUCTIVE } from '@/lib/rate-limit';
```

After `const user = await requireUser();`:

```ts
  if (!rateLimit(DESTRUCTIVE, user.id).allowed) {
    return { ok: false, reason: 'throttled' };
  }
```

- [ ] **Step 2: Guard `deleteAccount.ts`**

```ts
import { rateLimit, DESTRUCTIVE } from '@/lib/rate-limit';
```

After `const user = await requireUser();`:

```ts
  if (!rateLimit(DESTRUCTIVE, user.id).allowed) {
    return { ok: false, reason: 'too-many-attempts' };
  }
```

- [ ] **Step 3: Verify**

Run: `pnpm type-check && pnpm lint`
Expected: both pass.

- [ ] **Step 4: Commit**

```bash
git add features/settings/actions/requestAccountDeletion.ts features/settings/actions/deleteAccount.ts
git commit -m "feat(rate-limit): throttle account-deletion request/verify actions"
```

---

### Task 6: Security-headers helper (`lib/security/headers.ts`)

**Files:**
- Create: `lib/security/headers.ts`
- Test: `lib/security/headers.test.ts`

**Interfaces:**
- Produces: `function buildSecurityHeaders(nonce: string): Record<string, string>`.

- [ ] **Step 1: Write the failing test**

Create `lib/security/headers.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildSecurityHeaders } from './headers';

describe('buildSecurityHeaders', () => {
  it('embeds the nonce in script-src with strict-dynamic', () => {
    const h = buildSecurityHeaders('abc123');
    const csp = h['Content-Security-Policy'];
    expect(csp).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
  });

  it('sets the core directives and static headers', () => {
    const csp = buildSecurityHeaders('n')['Content-Security-Policy'];
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
    expect(csp).toContain("img-src 'self' data:");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");

    const h = buildSecurityHeaders('n');
    expect(h['X-Content-Type-Options']).toBe('nosniff');
    expect(h['X-Frame-Options']).toBe('DENY');
    expect(h['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
    expect(h['Strict-Transport-Security']).toContain('max-age=');
    expect(h['Permissions-Policy']).toContain('camera=()');
  });

  it('varies the nonce per call', () => {
    const a = buildSecurityHeaders('one')['Content-Security-Policy'];
    const b = buildSecurityHeaders('two')['Content-Security-Policy'];
    expect(a).not.toBe(b);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test lib/security/headers.test.ts`
Expected: FAIL — cannot find module `./headers`.

- [ ] **Step 3: Write `lib/security/headers.ts`**

```ts
/**
 * Builds the full security-header set, including a strict nonce-based CSP.
 * Pure and framework-free so it can be unit-tested and called from proxy.ts.
 *
 * style-src keeps 'unsafe-inline' because Recharts and Base UI write inline
 * `style=` attributes that a nonce cannot cover; injected CSS is far lower-risk
 * than injected script, which 'nonce' + 'strict-dynamic' fully gate.
 */
export function buildSecurityHeaders(nonce: string): Record<string, string> {
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ');

  return {
    'Content-Security-Policy': csp,
    'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test lib/security/headers.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
pnpm type-check
git add lib/security
git commit -m "feat(security): buildSecurityHeaders with strict nonce CSP"
```

---

### Task 7: Wire `proxy.ts`

**Files:**
- Create: `proxy.ts` (repo root)

**Interfaces:**
- Consumes: `buildSecurityHeaders` from `@/lib/security/headers`.

- [ ] **Step 1: Write `proxy.ts`**

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { buildSecurityHeaders } from '@/lib/security/headers';

export function proxy(request: NextRequest): NextResponse {
  // Per-request nonce (Web Crypto + btoa are available in the Edge runtime).
  const nonce = btoa(crypto.randomUUID());
  const headers = buildSecurityHeaders(nonce);

  // Forward the nonce + CSP on the request so Next threads the nonce into its
  // own bootstrap <script> tags.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', headers['Content-Security-Policy']);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  for (const [key, value] of Object.entries(headers)) {
    response.headers.set(key, value);
  }
  return response;
}

export const config = {
  matcher: [
    {
      source: '/((?!_next/static|_next/image|favicon.ico).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
```

- [ ] **Step 2: Verify it loads and the app renders**

Run: `pnpm type-check`
Then start the dev server and confirm it boots without a "proxy must export" error and pages render:

```bash
pnpm dev
```

Open `http://localhost:3000`, sign in, and visit the Dashboard. In the browser devtools **Console**, confirm there are **no CSP violation errors**, and check **Network → the document response Headers** show `Content-Security-Policy` with a `nonce-…`, plus `Strict-Transport-Security`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`. Specifically exercise: Dashboard charts (Recharts), Cmd+K command palette / a dialog (Base UI), and a toast (save a transaction → sonner). All must render with no console CSP errors.

> If the build reports the proxy export is wrong, switch `export function proxy` to `export default function proxy` and re-verify — both are accepted; the named form is the Next 16 default.

- [ ] **Step 3: Commit**

```bash
git add proxy.ts
git commit -m "feat(security): emit nonce CSP + security headers via proxy.ts"
```

---

### Task 8: Quota helper + env var (`lib/journal/quota.ts`)

**Files:**
- Create: `lib/journal/quota.ts`
- Modify: `lib/env/index.ts` (add `JOURNAL_QUOTA_MB`)
- Test: `lib/journal/quota.test.ts`

**Interfaces:**
- Produces:
  - `function journalQuotaBytes(): number`
  - `async function getJournalDirSize(userId: string): Promise<number>`

- [ ] **Step 1: Declare the env var**

In `lib/env/index.ts`, inside `envSchema.extend({ ... })`, add (next to `DATA_DIR`):

```ts
    // Per-user cumulative journal-dir size cap (MB). Read lazily at runtime via
    // process.env in lib/journal/quota.ts (so tests can override per-case);
    // validated here so a bad value fails fast at startup.
    JOURNAL_QUOTA_MB: z.coerce.number().int().positive().default(100),
```

- [ ] **Step 2: Write the failing test**

Create `lib/journal/quota.test.ts`:

```ts
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getJournalDirSize, journalQuotaBytes } from './quota';

let dataDir: string;
const userId = 'user-quota';

beforeEach(async () => {
  dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'quota-'));
  process.env.DATA_DIR = dataDir;
});

afterEach(async () => {
  await fs.rm(dataDir, { recursive: true, force: true });
  delete process.env.JOURNAL_QUOTA_MB;
});

describe('journalQuotaBytes', () => {
  it('defaults to 100 MB', () => {
    delete process.env.JOURNAL_QUOTA_MB;
    expect(journalQuotaBytes()).toBe(100 * 1024 * 1024);
  });

  it('reads JOURNAL_QUOTA_MB from the environment', () => {
    process.env.JOURNAL_QUOTA_MB = '5';
    expect(journalQuotaBytes()).toBe(5 * 1024 * 1024);
  });
});

describe('getJournalDirSize', () => {
  it('returns 0 when the dir does not exist', async () => {
    expect(await getJournalDirSize(userId)).toBe(0);
  });

  it('sums nested file sizes', async () => {
    const dir = path.join(dataDir, 'journals', userId);
    await fs.mkdir(path.join(dir, 'sub'), { recursive: true });
    await fs.writeFile(path.join(dir, 'main.ledger'), 'a'.repeat(100));
    await fs.writeFile(path.join(dir, 'sub', 'inc.ledger'), 'b'.repeat(50));
    expect(await getJournalDirSize(userId)).toBe(150);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm test lib/journal/quota.test.ts`
Expected: FAIL — cannot find module `./quota`.

- [ ] **Step 4: Write `lib/journal/quota.ts`**

```ts
import { promises as fs } from 'fs';
import path from 'path';
import 'server-only';
import { listLocalRelPaths } from '@/lib/storage/manifest';
import { getJournalDir } from './layout';

/**
 * Per-user cumulative journal-dir cap in bytes. Read lazily from process.env so
 * tests can override it, mirroring DATA_DIR in layout.ts. The Zod-validated env
 * in @/lib/env is the production source of truth.
 */
export const journalQuotaBytes = (): number =>
  Number(process.env.JOURNAL_QUOTA_MB ?? 100) * 1024 * 1024;

/** Total bytes of all files under the user's journal dir (0 if absent). */
export const getJournalDirSize = async (userId: string): Promise<number> => {
  const dir = getJournalDir(userId);
  const rels = await listLocalRelPaths(dir);
  let total = 0;
  for (const rel of rels) {
    try {
      total += (await fs.stat(path.join(dir, rel))).size;
    } catch {
      // File vanished between listing and stat — ignore.
    }
  }
  return total;
};
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test lib/journal/quota.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Type-check and commit**

```bash
pnpm type-check
git add lib/journal/quota.ts lib/journal/quota.test.ts lib/env/index.ts
git commit -m "feat(quota): journalQuotaBytes + getJournalDirSize helper and env var"
```

---

### Task 9: Enforce quota in `JournalService` + map at `/api/upload`

**Files:**
- Modify: `lib/journal/service.ts`
- Modify: `app/api/upload/route.ts`
- Test: `lib/journal/quota-enforcement.test.ts`

**Interfaces:**
- Consumes: `journalQuotaBytes`, `getJournalDirSize` from `./quota`.
- Produces (return-type additions, both optional so existing callers are unaffected):
  - `replaceFromSingleFile` / `replaceFromZip` return objects gain `quotaExceeded?: boolean`.
  - `addTransaction` returns its existing `AddTransactionResult` with a `formError` on quota failure.

- [ ] **Step 1: Write the failing test**

Create `lib/journal/quota-enforcement.test.ts`:

```ts
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { journalService } from '@/lib/journal';

let dataDir: string;
const userId = 'user-quota-enforce';

beforeEach(async () => {
  dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'quota-enf-'));
  process.env.DATA_DIR = dataDir;
  process.env.STORAGE_BACKEND = 'memory';
  process.env.JOURNAL_QUOTA_MB = '1'; // 1 MB cap
});

afterEach(async () => {
  await fs.rm(dataDir, { recursive: true, force: true });
  delete process.env.JOURNAL_QUOTA_MB;
});

describe('quota enforcement', () => {
  it('rejects a single-file import over the quota without writing', async () => {
    const big = Buffer.alloc(2 * 1024 * 1024, '\n'); // 2 MB > 1 MB cap
    const result = await journalService.replaceFromSingleFile(userId, big);
    expect(result.quotaExceeded).toBe(true);
    // Nothing was written to the journal dir.
    const dir = path.join(dataDir, 'journals', userId, 'main.ledger');
    await expect(fs.stat(dir)).rejects.toBeTruthy();
  });

  it('allows a small import', async () => {
    const small = Buffer.from('2020-01-01 Opening\n  Assets  1\n  Equity  -1\n');
    const result = await journalService.replaceFromSingleFile(userId, small);
    expect(result.quotaExceeded).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test lib/journal/quota-enforcement.test.ts`
Expected: FAIL — `result.quotaExceeded` is `undefined` (not yet implemented), the first assertion fails.

- [ ] **Step 3: Add the import + guards in `lib/journal/service.ts`**

Add to the imports block (near the other `./` imports):

```ts
import { getJournalDirSize, journalQuotaBytes } from './quota';
```

**3a.** Widen the two import return types. Change `replaceFromSingleFile`'s signature return to:

```ts
  ): Promise<{ uidsAdded: number; parseFailure?: string; quotaExceeded?: boolean }> {
```

and `replaceFromZip`'s to:

```ts
  ): Promise<{
    mainFile: string;
    fileCount: number;
    uidsAdded: number;
    parseFailure?: string;
    quotaExceeded?: boolean;
  }> {
```

**3b.** In `replaceFromSingleFile`, as the FIRST statement inside the `withUserLock(userId, async () => {` callback (before `await pull(userId)`):

```ts
      if (content.length > journalQuotaBytes()) {
        return { uidsAdded: 0, quotaExceeded: true };
      }
```

**3c.** In `replaceFromZip`, after the path-traversal validation loop and BEFORE `return withUserLock(...)` (so we never wipe the dir when the extracted payload is too big), compute the extracted size from the already-parsed `entries`:

```ts
    const extractedBytes = entries.reduce(
      (sum, entry) => sum + entry.getData().length,
      0
    );
    if (extractedBytes > journalQuotaBytes()) {
      return {
        mainFile: '',
        fileCount: entries.length,
        uidsAdded: 0,
        quotaExceeded: true,
      };
    }
```

**3d.** In `addTransaction`, inside the `withUserLock` callback, after `const block = ...` and BEFORE `await this.repo.appendFile(mainPath, block)`:

```ts
      const projected =
        (await getJournalDirSize(userId)) + Buffer.byteLength(block);
      if (projected > journalQuotaBytes()) {
        return {
          ok: false,
          fieldErrors: {},
          formError: `This transaction would exceed your ${process.env.JOURNAL_QUOTA_MB ?? 100} MB journal limit.`,
        };
      }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test lib/journal/quota-enforcement.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Map `quotaExceeded` to HTTP 413 in `app/api/upload/route.ts`**

In both the `ext === ZIP_EXT` branch and the `ALLOWED_SINGLE_EXTS.has(ext)` branch, right after the `const result = await journalService.replace...` line and BEFORE building the success `NextResponse.json`, insert:

```ts
      if (result.quotaExceeded) {
        return NextResponse.json(
          {
            error: `Importing this would exceed your ${process.env.JOURNAL_QUOTA_MB ?? 100} MB journal limit.`,
          },
          { status: 413 }
        );
      }
```

- [ ] **Step 6: Verify everything**

Run: `pnpm type-check && pnpm lint && pnpm test`
Expected: all pass (full suite green, including the prior account-deletion/journal tests).

- [ ] **Step 7: Commit**

```bash
git add lib/journal/service.ts app/api/upload/route.ts lib/journal/quota-enforcement.test.ts
git commit -m "feat(quota): enforce per-user journal cap on imports and adds"
```

---

### Task 10: Update PLAN.md and final whole-branch verification

**Files:**
- Modify: `PLAN.md`

- [ ] **Step 1: Check off the three Phase 7 items in `PLAN.md`**

Under `## Phase 7 — Multi-user hardening / backups`, change these three lines from `[ ]` to `[x]` and append a one-line note + spec reference to each:

- `Rate limit /api/upload and any future write endpoint` → `[x] Rate limit ... — in-memory per-user fixed-window limiter (lib/rate-limit/) on /api/upload + all mutating server actions; auth endpoints covered by better-auth.`
- `Quota on per-user journal size` → `[x] Quota on per-user journal size — JOURNAL_QUOTA_MB (default 100) enforced in JournalService for imports + adds; lib/journal/quota.ts.`
- `CSP / security headers pass` → `[x] CSP / security headers pass — strict nonce-based CSP + HSTS/X-Frame-Options/nosniff/Referrer-Policy/Permissions-Policy via proxy.ts (lib/security/headers.ts).`

Add a trailing reference line after the Phase 7 list:
`Spec: docs/superpowers/specs/2026-06-25-phase7-hardening-design.md.`

- [ ] **Step 2: Full verification**

Run: `pnpm test && pnpm type-check && pnpm lint`
Expected: all green.

- [ ] **Step 3: Commit**

```bash
git add PLAN.md
git commit -m "docs(phase7): mark rate-limit, quota, security-headers items done"
```

- [ ] **Step 4: Manual smoke (must do before opening the PR)**

With `pnpm dev` running and signed in:
1. Confirm Dashboard/charts/command-palette/toast all render with **no CSP console errors** (re-confirm Task 7 if skipped).
2. Set `JOURNAL_QUOTA_MB=0.001` in `.env`, restart, and import a normal journal → expect a 413 / "would exceed your … limit" message; saving a transaction shows the limit error. Then restore `JOURNAL_QUOTA_MB` (or remove it to default 100).

---

## Self-Review

**Spec coverage:**
- Rate limiting store/limits/index → Task 1. ✓
- Rate limit `/api/upload` (429 + Retry-After) → Task 2. ✓
- Rate limit all mutating actions → Tasks 3–5 (transactions, templates, saved-views, saved-currency, account-deletion); documented exclusions for anonymous cookie toggles + already-throttled price refresh. ✓
- `buildSecurityHeaders` with strict nonce CSP + static headers → Task 6. ✓
- `proxy.ts` nonce + matcher + manual CSP verification → Task 7. ✓
- `JOURNAL_QUOTA_MB` env + `getJournalDirSize` → Task 8. ✓
- Quota enforcement in service (imports + add) + 413 mapping → Task 9. ✓
- PLAN.md check-off → Task 10. ✓

**Placeholder scan:** No TBD/TODO. The one templated string `<rate-limited return value for this file>` in Task 4 is immediately resolved by the explicit per-file table and worked example in the same task. ✓

**Type consistency:** `RateLimitPolicy`/`RateLimitResult`/`MemoryStore`/`rateLimit` names match across Tasks 1–5. `journalQuotaBytes`/`getJournalDirSize` match across Tasks 8–9. `quotaExceeded` field name matches between service return types (Task 9 step 3) and route mapping (Task 9 step 5). Account-deletion mappings use only reasons that exist in `IssueResult` (`throttled`) and `VerifyResult` (`too-many-attempts`). ✓
