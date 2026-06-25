# Account Deletion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a self-service "delete my account" flow on `/settings`, gated behind an emailed 6-digit verification code, that permanently wipes the user's journals (Garage + local), all DB rows, and the auth identity.

**Architecture:** Self-contained in `ledger-cli-ui` (no `@naeemba/next-starter` change). Follows the repo's Repository + Service + one-action-per-file convention. A new `accountDeletionChallenge` table holds a hashed, expiring, attempt-capped code. A `purgeUserData` orchestration unit does the destructive wipe in a fixed order (Garage → local → `db.delete(user)` cascade). Backup export is a new `GET /api/account/export` route reusing existing storage + zip helpers.

**Tech Stack:** Next.js 16 (app router), TypeScript, Drizzle ORM (Postgres), Vitest (+ PGlite test db), `adm-zip`, shadcn/ui, sonner, better-auth (via the starter), Postal email transport.

## Global Constraints

- **Code params (verbatim):** 6 digits, 10-minute expiry, 5-attempt cap, 30-second re-send throttle.
- **Code is stored hashed** (SHA-256 hex), never plaintext; compared in constant time (`crypto.timingSafeEqual`).
- **Deletion order is load-bearing:** `clearRemote(userId)` (Garage, source of truth) → remove local journal dir → `db.delete(user)` (DB cascade). Never reorder.
- **All actions/routes are `requireUser`-gated and self-scoped** — only ever operate on the caller's own `user.id`; no user-supplied id reaches the service.
- **Never log the plaintext code or leak `ledger`/DB internals to the client.** Server-only `console.error` for real errors; generic messages to the user.
- **`ledger` is never shelled out in this feature.**
- Follow existing import style: `import 'server-only'` at the top of server-only modules; drizzle schema tables reference `user` from `@naeemba/next-starter/schema` with `{ onDelete: 'cascade' }`.
- Test db pattern: `setupTestDb('<prefix>-')` / `teardownTestDb(ctx)` / `ctx.insertUser(id, name, email)` from `@/lib/test-utils/db`.
- Commands: tests `pnpm test`, type-check `pnpm type-check`, migration generate `pnpm db:generate`.

---

### Task 1: `accountDeletionChallenge` schema + migration

**Files:**
- Create: `db/schema/accountDeletionChallenge.ts`
- Modify: `db/schema/index.ts` (add export)
- Create (generated): `db/migrations/XXXX_*.sql` via `pnpm db:generate`

**Interfaces:**
- Produces: `accountDeletionChallenge` table + `AccountDeletionChallenge` row type. Columns: `userId` (text PK, FK→user cascade), `codeHash` (text), `expiresAt` (timestamp), `attempts` (integer, default 0), `createdAt` (timestamp, default now).

- [ ] **Step 1: Write the schema file**

`db/schema/accountDeletionChallenge.ts`:
```ts
import { sql } from 'drizzle-orm';
import { user } from '@naeemba/next-starter/schema';
import { integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

// One active deletion challenge per user (PK = userId; re-requesting a code
// upserts this row). Holds only a hash of the 6-digit code — never plaintext.
export const accountDeletionChallenge = pgTable('accountDeletionChallenge', {
  userId: text('userId')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  codeHash: text('codeHash').notNull(),
  expiresAt: timestamp('expiresAt').notNull(),
  attempts: integer('attempts').notNull().default(0),
  createdAt: timestamp('createdAt')
    .notNull()
    .default(sql`now()`),
});

export type AccountDeletionChallenge =
  typeof accountDeletionChallenge.$inferSelect;
```

- [ ] **Step 2: Export from the schema barrel**

Add to `db/schema/index.ts` (keep alphabetical-ish ordering, place after the `account…`/before `commodityPrice` line is fine):
```ts
export {
  accountDeletionChallenge,
  type AccountDeletionChallenge,
} from './accountDeletionChallenge';
```

- [ ] **Step 3: Generate the migration**

Run: `pnpm db:generate`
Expected: drizzle-kit writes a new `db/migrations/XXXX_*.sql` creating table `accountDeletionChallenge` with the FK to `user(id)` `ON DELETE cascade`. No prompts (new table, no renames).

- [ ] **Step 4: Type-check**

Run: `pnpm type-check`
Expected: PASS (no errors).

- [ ] **Step 5: Commit**

```bash
git add db/schema/accountDeletionChallenge.ts db/schema/index.ts db/migrations
git commit -m "feat(account-deletion): accountDeletionChallenge table + migration"
```

---

### Task 2: `AccountDeletionChallengeRepository`

**Files:**
- Create: `lib/account-deletion/repository.ts`
- Test: `lib/account-deletion/repository.test.ts`

**Interfaces:**
- Consumes: `accountDeletionChallenge`, `AccountDeletionChallenge` (Task 1); `DbInstance` from `@/lib/db/connection`.
- Produces: `class AccountDeletionChallengeRepository` with:
  - `upsert(userId: string, codeHash: string, expiresAt: Date): Promise<void>` — inserts or replaces the row, resetting `attempts` to 0 and `createdAt` to now.
  - `get(userId: string): Promise<AccountDeletionChallenge | null>`
  - `incrementAttempts(userId: string): Promise<number>` — returns the new attempts count.
  - `delete(userId: string): Promise<void>`

- [ ] **Step 1: Write the failing test**

`lib/account-deletion/repository.test.ts`:
```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AccountDeletionChallengeRepository } from './repository';
import {
  setupTestDb,
  teardownTestDb,
  type TestDbContext,
} from '@/lib/test-utils/db';

describe('AccountDeletionChallengeRepository', () => {
  let ctx: TestDbContext;
  let repo: AccountDeletionChallengeRepository;
  const future = () => new Date(Date.now() + 600_000);

  beforeEach(async () => {
    ctx = await setupTestDb('acct-del-');
    await ctx.insertUser('alice', 'Alice', 'alice@example.com');
    repo = new AccountDeletionChallengeRepository(ctx.db);
  });

  afterEach(async () => {
    await teardownTestDb(ctx);
  });

  it('upsert inserts a row with attempts=0', async () => {
    await repo.upsert('alice', 'hash1', future());
    const row = await repo.get('alice');
    expect(row?.codeHash).toBe('hash1');
    expect(row?.attempts).toBe(0);
  });

  it('upsert replaces an existing row and resets attempts', async () => {
    await repo.upsert('alice', 'hash1', future());
    await repo.incrementAttempts('alice');
    await repo.upsert('alice', 'hash2', future());
    const row = await repo.get('alice');
    expect(row?.codeHash).toBe('hash2');
    expect(row?.attempts).toBe(0);
  });

  it('get returns null when no challenge exists', async () => {
    expect(await repo.get('alice')).toBeNull();
  });

  it('incrementAttempts returns the new count', async () => {
    await repo.upsert('alice', 'hash1', future());
    expect(await repo.incrementAttempts('alice')).toBe(1);
    expect(await repo.incrementAttempts('alice')).toBe(2);
  });

  it('delete removes the row', async () => {
    await repo.upsert('alice', 'hash1', future());
    await repo.delete('alice');
    expect(await repo.get('alice')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test lib/account-deletion/repository.test.ts`
Expected: FAIL — cannot find module `./repository`.

- [ ] **Step 3: Write the repository**

`lib/account-deletion/repository.ts`:
```ts
import { eq, sql } from 'drizzle-orm';
import {
  accountDeletionChallenge,
  type AccountDeletionChallenge,
} from '@/db/schema/accountDeletionChallenge';
import type { DbInstance } from '@/lib/db/connection';

export class AccountDeletionChallengeRepository {
  constructor(private readonly db: DbInstance) {}

  async upsert(
    userId: string,
    codeHash: string,
    expiresAt: Date
  ): Promise<void> {
    await this.db
      .insert(accountDeletionChallenge)
      .values({ userId, codeHash, expiresAt, attempts: 0 })
      .onConflictDoUpdate({
        target: accountDeletionChallenge.userId,
        set: { codeHash, expiresAt, attempts: 0, createdAt: sql`now()` },
      });
  }

  async get(userId: string): Promise<AccountDeletionChallenge | null> {
    const rows = await this.db
      .select()
      .from(accountDeletionChallenge)
      .where(eq(accountDeletionChallenge.userId, userId))
      .limit(1);
    return rows[0] ?? null;
  }

  async incrementAttempts(userId: string): Promise<number> {
    const rows = await this.db
      .update(accountDeletionChallenge)
      .set({ attempts: sql`${accountDeletionChallenge.attempts} + 1` })
      .where(eq(accountDeletionChallenge.userId, userId))
      .returning({ attempts: accountDeletionChallenge.attempts });
    return rows[0]?.attempts ?? 0;
  }

  async delete(userId: string): Promise<void> {
    await this.db
      .delete(accountDeletionChallenge)
      .where(eq(accountDeletionChallenge.userId, userId));
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test lib/account-deletion/repository.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/account-deletion/repository.ts lib/account-deletion/repository.test.ts
git commit -m "feat(account-deletion): challenge repository"
```

---

### Task 3: Code Zod schema

**Files:**
- Create: `lib/account-deletion/schema.ts`
- Test: `lib/account-deletion/schema.test.ts`

**Interfaces:**
- Produces: `deletionCodeSchema` (Zod) accepting exactly 6 ASCII digits; `DeletionCode = string`.

- [ ] **Step 1: Write the failing test**

`lib/account-deletion/schema.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { deletionCodeSchema } from './schema';

describe('deletionCodeSchema', () => {
  it('accepts exactly 6 digits', () => {
    expect(deletionCodeSchema.safeParse('012345').success).toBe(true);
  });
  it('rejects fewer than 6 digits', () => {
    expect(deletionCodeSchema.safeParse('12345').success).toBe(false);
  });
  it('rejects more than 6 digits', () => {
    expect(deletionCodeSchema.safeParse('1234567').success).toBe(false);
  });
  it('rejects non-numeric input', () => {
    expect(deletionCodeSchema.safeParse('12a456').success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test lib/account-deletion/schema.test.ts`
Expected: FAIL — cannot find module `./schema`.

- [ ] **Step 3: Write the schema**

`lib/account-deletion/schema.ts`:
```ts
import { z } from 'zod';

export const deletionCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, 'Enter the 6-digit code from your email');

export type DeletionCode = z.infer<typeof deletionCodeSchema>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test lib/account-deletion/schema.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/account-deletion/schema.ts lib/account-deletion/schema.test.ts
git commit -m "feat(account-deletion): code validation schema"
```

---

### Task 4: `purgeUserData` orchestration

**Files:**
- Create: `lib/account-deletion/purge.ts`
- Test: `lib/account-deletion/purge.test.ts`

**Interfaces:**
- Consumes: `clearRemote` from `@/lib/storage/sync`; `getJournalDir` from `@/lib/journal/layout`; `user` from `@naeemba/next-starter/schema`; `DbInstance`.
- Produces:
  ```ts
  type PurgeDeps = {
    clearRemote?: (userId: string) => Promise<void>;
    removeLocalJournal?: (userId: string) => Promise<void>;
  };
  function purgeUserData(userId: string, db: DbInstance, deps?: PurgeDeps): Promise<void>;
  ```
  Runs, in order: `clearRemote(userId)` → `removeLocalJournal(userId)` → `db.delete(user).where(eq(user.id, userId))`. Defaults wire the real storage + `fs.rm`.

- [ ] **Step 1: Write the failing test**

`lib/account-deletion/purge.test.ts`:
```ts
import { promises as fs } from 'fs';
import path from 'path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { user } from '@naeemba/next-starter/schema';
import { purgeUserData } from './purge';
import {
  setupTestDb,
  teardownTestDb,
  type TestDbContext,
} from '@/lib/test-utils/db';

describe('purgeUserData', () => {
  let ctx: TestDbContext;

  beforeEach(async () => {
    ctx = await setupTestDb('acct-purge-');
    await ctx.insertUser('alice', 'Alice', 'alice@example.com');
  });

  afterEach(async () => {
    await teardownTestDb(ctx);
  });

  it('runs clear → removeLocal → db.delete(user) in order', async () => {
    const calls: string[] = [];
    await purgeUserData('alice', ctx.db, {
      clearRemote: async () => {
        calls.push('clear');
      },
      removeLocalJournal: async () => {
        calls.push('local');
      },
    });
    expect(calls).toEqual(['clear', 'local']);
    const rows = await ctx.db
      .select()
      .from(user)
      .where(eq(user.id, 'alice'));
    expect(rows).toHaveLength(0);
  });

  it('default removeLocalJournal deletes the journal dir', async () => {
    const dir = path.join(ctx.tmpDir, 'journals', 'alice');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'main.ledger'), '; test\n');
    const prev = process.env.DATA_DIR;
    process.env.DATA_DIR = ctx.tmpDir;
    try {
      await purgeUserData('alice', ctx.db, { clearRemote: async () => {} });
    } finally {
      process.env.DATA_DIR = prev;
    }
    await expect(fs.access(dir)).rejects.toThrow();
  });
});
```

> Note: `ctx.tmpDir` is provided by `setupTestDb` (see `lib/test-utils/db.ts` — it returns `{ client, db, insertUser, tmpDir }`).

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test lib/account-deletion/purge.test.ts`
Expected: FAIL — cannot find module `./purge`.

- [ ] **Step 3: Write the orchestration**

`lib/account-deletion/purge.ts`:
```ts
import 'server-only';
import { promises as fs } from 'fs';
import { eq } from 'drizzle-orm';
import { user } from '@naeemba/next-starter/schema';
import type { DbInstance } from '@/lib/db/connection';
import { getJournalDir } from '@/lib/journal/layout';
import { clearRemote as clearRemoteDefault } from '@/lib/storage/sync';

export type PurgeDeps = {
  clearRemote?: (userId: string) => Promise<void>;
  removeLocalJournal?: (userId: string) => Promise<void>;
};

const removeLocalJournalDefault = (userId: string): Promise<void> =>
  fs.rm(getJournalDir(userId), { recursive: true, force: true });

/**
 * Permanently wipe all of a user's data. ORDER MATTERS: Garage (the source of
 * truth) first, then the local cache, then the user row (which cascades every
 * DB row that references it — session, account, passkey, userSetting,
 * savedView, template, accountDeletionChallenge). A mid-failure leaves only
 * inert orphans (data with no user); re-running completes the purge.
 */
export async function purgeUserData(
  userId: string,
  db: DbInstance,
  deps: PurgeDeps = {}
): Promise<void> {
  const clearRemote = deps.clearRemote ?? clearRemoteDefault;
  const removeLocalJournal =
    deps.removeLocalJournal ?? removeLocalJournalDefault;

  await clearRemote(userId);
  await removeLocalJournal(userId);
  await db.delete(user).where(eq(user.id, userId));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test lib/account-deletion/purge.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/account-deletion/purge.ts lib/account-deletion/purge.test.ts
git commit -m "feat(account-deletion): purgeUserData orchestration"
```

---

### Task 5: `AccountDeletionService` + DI wiring

**Files:**
- Create: `lib/account-deletion/service.ts`
- Create: `lib/account-deletion/index.ts`
- Test: `lib/account-deletion/service.test.ts`

**Interfaces:**
- Consumes: `AccountDeletionChallengeRepository` (Task 2); `purgeUserData` (Task 4); `postalTransport` from `@/lib/email-transport`; `APP_NAME` from `@/lib/app`; `db` from `@/lib/db`.
- Produces:
  ```ts
  type IssueResult = { ok: true } | { ok: false; reason: 'throttled' };
  type VerifyResult =
    | { ok: true }
    | { ok: false; reason: 'no-code' | 'expired' | 'too-many-attempts' }
    | { ok: false; reason: 'invalid'; remaining: number };

  class AccountDeletionService {
    constructor(repo, deps: {
      sendCode: (email: string, code: string) => Promise<void>;
      purge: (userId: string) => Promise<void>;
      now?: () => number; // injectable clock for tests; defaults to Date.now
    });
    issueCode(userId: string, email: string): Promise<IssueResult>;
    verifyAndDelete(userId: string, code: string): Promise<VerifyResult>;
  }
  ```
  Constants: `CODE_TTL_MS = 600_000`, `MAX_ATTEMPTS = 5`, `RESEND_THROTTLE_MS = 30_000`.
  Singleton export from `index.ts`: `accountDeletionService`.

- [ ] **Step 1: Write the failing test**

`lib/account-deletion/service.test.ts`:
```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AccountDeletionChallengeRepository } from './repository';
import { AccountDeletionService } from './service';
import {
  setupTestDb,
  teardownTestDb,
  type TestDbContext,
} from '@/lib/test-utils/db';

describe('AccountDeletionService', () => {
  let ctx: TestDbContext;
  let repo: AccountDeletionChallengeRepository;
  let sent: { email: string; code: string }[];
  let purged: string[];
  let nowMs: number;

  const makeService = () =>
    new AccountDeletionService(repo, {
      sendCode: async (email, code) => {
        sent.push({ email, code });
      },
      purge: async (userId) => {
        purged.push(userId);
      },
      now: () => nowMs,
    });

  beforeEach(async () => {
    ctx = await setupTestDb('acct-svc-');
    await ctx.insertUser('alice', 'Alice', 'alice@example.com');
    repo = new AccountDeletionChallengeRepository(ctx.db);
    sent = [];
    purged = [];
    nowMs = 1_000_000;
  });

  afterEach(async () => {
    await teardownTestDb(ctx);
  });

  it('issueCode emails a 6-digit code', async () => {
    const res = await makeService().issueCode('alice', 'alice@example.com');
    expect(res).toEqual({ ok: true });
    expect(sent).toHaveLength(1);
    expect(sent[0].email).toBe('alice@example.com');
    expect(sent[0].code).toMatch(/^\d{6}$/);
  });

  it('issueCode throttles a re-send within 30s', async () => {
    const svc = makeService();
    await svc.issueCode('alice', 'alice@example.com');
    nowMs += 10_000;
    const res = await svc.issueCode('alice', 'alice@example.com');
    expect(res).toEqual({ ok: false, reason: 'throttled' });
    expect(sent).toHaveLength(1);
  });

  it('issueCode allows a re-send after 30s', async () => {
    const svc = makeService();
    await svc.issueCode('alice', 'alice@example.com');
    nowMs += 31_000;
    const res = await svc.issueCode('alice', 'alice@example.com');
    expect(res).toEqual({ ok: true });
    expect(sent).toHaveLength(2);
  });

  it('verifyAndDelete purges on the correct code', async () => {
    const svc = makeService();
    await svc.issueCode('alice', 'alice@example.com');
    const res = await svc.verifyAndDelete('alice', sent[0].code);
    expect(res).toEqual({ ok: true });
    expect(purged).toEqual(['alice']);
  });

  it('verifyAndDelete returns no-code when none issued', async () => {
    const res = await makeService().verifyAndDelete('alice', '000000');
    expect(res).toEqual({ ok: false, reason: 'no-code' });
    expect(purged).toHaveLength(0);
  });

  it('verifyAndDelete rejects a wrong code and reports remaining attempts', async () => {
    const svc = makeService();
    await svc.issueCode('alice', 'alice@example.com');
    const wrong = sent[0].code === '000000' ? '111111' : '000000';
    const res = await svc.verifyAndDelete('alice', wrong);
    expect(res).toEqual({ ok: false, reason: 'invalid', remaining: 4 });
    expect(purged).toHaveLength(0);
  });

  it('verifyAndDelete invalidates after 5 failed attempts', async () => {
    const svc = makeService();
    await svc.issueCode('alice', 'alice@example.com');
    const wrong = sent[0].code === '000000' ? '111111' : '000000';
    let res;
    for (let i = 0; i < 5; i++) res = await svc.verifyAndDelete('alice', wrong);
    expect(res).toEqual({ ok: false, reason: 'too-many-attempts' });
    // challenge is gone — a follow-up reads as no-code
    expect(await svc.verifyAndDelete('alice', sent[0].code)).toEqual({
      ok: false,
      reason: 'no-code',
    });
  });

  it('verifyAndDelete rejects an expired code', async () => {
    const svc = makeService();
    await svc.issueCode('alice', 'alice@example.com');
    nowMs += 600_001;
    const res = await svc.verifyAndDelete('alice', sent[0].code);
    expect(res).toEqual({ ok: false, reason: 'expired' });
    expect(purged).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test lib/account-deletion/service.test.ts`
Expected: FAIL — cannot find module `./service`.

- [ ] **Step 3: Write the service**

`lib/account-deletion/service.ts`:
```ts
import 'server-only';
import { createHash, randomInt, timingSafeEqual } from 'crypto';
import type { AccountDeletionChallengeRepository } from './repository';

export const CODE_TTL_MS = 600_000; // 10 minutes
export const MAX_ATTEMPTS = 5;
export const RESEND_THROTTLE_MS = 30_000;

export type IssueResult = { ok: true } | { ok: false; reason: 'throttled' };

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: 'no-code' | 'expired' | 'too-many-attempts' }
  | { ok: false; reason: 'invalid'; remaining: number };

export type AccountDeletionDeps = {
  sendCode: (email: string, code: string) => Promise<void>;
  purge: (userId: string) => Promise<void>;
  now?: () => number;
};

const hashCode = (code: string): string =>
  createHash('sha256').update(code).digest('hex');

const constantTimeEqual = (a: string, b: string): boolean => {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
};

export class AccountDeletionService {
  private readonly now: () => number;

  constructor(
    private readonly repo: AccountDeletionChallengeRepository,
    private readonly deps: AccountDeletionDeps
  ) {
    this.now = deps.now ?? Date.now;
  }

  async issueCode(userId: string, email: string): Promise<IssueResult> {
    const existing = await this.repo.get(userId);
    if (
      existing &&
      this.now() - existing.createdAt.getTime() < RESEND_THROTTLE_MS
    ) {
      return { ok: false, reason: 'throttled' };
    }
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const expiresAt = new Date(this.now() + CODE_TTL_MS);
    await this.repo.upsert(userId, hashCode(code), expiresAt);
    await this.deps.sendCode(email, code);
    return { ok: true };
  }

  async verifyAndDelete(userId: string, code: string): Promise<VerifyResult> {
    const challenge = await this.repo.get(userId);
    if (!challenge) return { ok: false, reason: 'no-code' };

    if (challenge.expiresAt.getTime() < this.now()) {
      await this.repo.delete(userId);
      return { ok: false, reason: 'expired' };
    }

    if (!constantTimeEqual(hashCode(code), challenge.codeHash)) {
      const attempts = await this.repo.incrementAttempts(userId);
      if (attempts >= MAX_ATTEMPTS) {
        await this.repo.delete(userId);
        return { ok: false, reason: 'too-many-attempts' };
      }
      return { ok: false, reason: 'invalid', remaining: MAX_ATTEMPTS - attempts };
    }

    await this.deps.purge(userId);
    // The challenge row is cascade-deleted with the user; nothing to clean up.
    return { ok: true };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test lib/account-deletion/service.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Write the DI wiring + email body**

`lib/account-deletion/index.ts`:
```ts
import 'server-only';
import { AccountDeletionChallengeRepository } from './repository';
import { AccountDeletionService } from './service';
import { purgeUserData } from './purge';
import { APP_NAME } from '@/lib/app';
import { db } from '@/lib/db';
import { postalTransport } from '@/lib/email-transport';

const sendCode = async (email: string, code: string): Promise<void> => {
  const from = process.env.EMAIL_FROM;
  if (!from) {
    throw new Error('[account-deletion] EMAIL_FROM is not configured.');
  }
  const subject = `${APP_NAME}: confirm account deletion`;
  const text = [
    `Your account deletion code is ${code}.`,
    `It expires in 10 minutes.`,
    `If you didn't request this, ignore this email — nothing will happen.`,
  ].join('\n\n');
  const html =
    `<p>Your account deletion code is <strong style="font-size:1.25rem;letter-spacing:0.15em">${code}</strong>.</p>` +
    `<p>It expires in 10 minutes.</p>` +
    `<p>If you didn't request this, ignore this email — nothing will happen.</p>`;
  await postalTransport({ to: email, from, subject, html, text });
};

const accountDeletionChallengeRepository =
  new AccountDeletionChallengeRepository(db);

export const accountDeletionService = new AccountDeletionService(
  accountDeletionChallengeRepository,
  { sendCode, purge: (userId) => purgeUserData(userId, db) }
);

export { AccountDeletionChallengeRepository } from './repository';
export { AccountDeletionService } from './service';
export type { IssueResult, VerifyResult } from './service';
export { deletionCodeSchema, type DeletionCode } from './schema';
```

- [ ] **Step 6: Type-check + run the whole account-deletion suite**

Run: `pnpm type-check && pnpm test lib/account-deletion`
Expected: PASS (type-check clean; all account-deletion tests green).

- [ ] **Step 7: Commit**

```bash
git add lib/account-deletion/service.ts lib/account-deletion/service.test.ts lib/account-deletion/index.ts
git commit -m "feat(account-deletion): service (issue/verify) + DI wiring"
```

---

### Task 6: Backup export route `GET /api/account/export`

**Files:**
- Create: `app/api/account/export/route.ts`
- Test: `app/api/account/export/route.test.ts`

**Interfaces:**
- Consumes: `requireUser`; `pullLocked` from `@/lib/storage/sync`; `listLocalRelPaths` from `@/lib/storage/manifest`; `getJournalDir` from `@/lib/journal/layout`; `adm-zip`.
- Produces: a `GET` handler returning a `.zip` of every file under the user's journal dir, `Content-Type: application/zip`, `Content-Disposition: attachment; filename="journals-<userId>-backup.zip"`.

The route's auth + storage calls are hard to unit test without a live session/store, so the testable seam is a pure helper `buildJournalZip`. Test the helper; keep the route a thin wrapper.

- [ ] **Step 1: Write the failing test (pure zip helper)**

`app/api/account/export/route.test.ts`:
```ts
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import AdmZip from 'adm-zip';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildJournalZip } from './route';

describe('buildJournalZip', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'zip-test-'));
    await fs.writeFile(path.join(dir, 'main.ledger'), '; main\n');
    await fs.mkdir(path.join(dir, 'sub'), { recursive: true });
    await fs.writeFile(path.join(dir, 'sub', 'jan.ledger'), '; jan\n');
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('zips every file with its relative path', async () => {
    const buf = await buildJournalZip(dir);
    const names = new AdmZip(buf)
      .getEntries()
      .map((e) => e.entryName)
      .sort();
    expect(names).toEqual(['main.ledger', 'sub/jan.ledger']);
  });

  it('preserves file contents', async () => {
    const buf = await buildJournalZip(dir);
    const entry = new AdmZip(buf).getEntry('main.ledger');
    expect(entry?.getData().toString('utf-8')).toBe('; main\n');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test app/api/account/export/route.test.ts`
Expected: FAIL — cannot find module `./route`.

- [ ] **Step 3: Write the route + helper**

`app/api/account/export/route.ts`:
```ts
import { promises as fs } from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import { requireUser } from '@/lib/auth/require-user';
import { getJournalDir } from '@/lib/journal/layout';
import { listLocalRelPaths } from '@/lib/storage/manifest';
import { pullLocked } from '@/lib/storage/sync';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/** Build a .zip of every file under `dir`, keyed by POSIX relative path. */
export async function buildJournalZip(dir: string): Promise<Buffer> {
  const zip = new AdmZip();
  const relPaths = await listLocalRelPaths(dir);
  for (const rel of relPaths) {
    const data = await fs.readFile(path.join(dir, rel));
    zip.addFile(rel.split(path.sep).join('/'), data);
  }
  return zip.toBuffer();
}

export async function GET(): Promise<Response> {
  const user = await requireUser();
  try {
    await pullLocked(user.id);
    const buf = await buildJournalZip(getJournalDir(user.id));
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="journals-${user.id}-backup.zip"`,
      },
    });
  } catch (e) {
    console.error('journal backup export failed', e);
    return NextResponse.json(
      { error: 'Could not export your journal' },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test app/api/account/export/route.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add app/api/account/export/route.ts app/api/account/export/route.test.ts
git commit -m "feat(account-deletion): journal backup .zip export route"
```

---

### Task 7: Server actions

**Files:**
- Create: `features/settings/actions/requestAccountDeletion.ts`
- Create: `features/settings/actions/deleteAccount.ts`
- Modify: `features/settings/actions/index.ts` (add exports)

**Interfaces:**
- Consumes: `requireUser`; `accountDeletionService`, `deletionCodeSchema` from `@/lib/account-deletion`; `IssueResult`, `VerifyResult` types.
- Produces:
  - `requestAccountDeletionAction(): Promise<IssueResult>`
  - `deleteAccountAction(code: unknown): Promise<VerifyResult>` — validates `code` first; returns `{ ok: false, reason: 'invalid', remaining: 0 }` shape on bad input so the client renders one inline error path. (Uses `remaining: 0` to mean "not a valid code format"; the UI shows the schema message.)

Actions are thin; their logic is covered by the service tests. No separate action test (consistent with `setSavedBaseCurrency.ts`, which has none beyond the schema/service tests).

- [ ] **Step 1: Write `requestAccountDeletion.ts`**

`features/settings/actions/requestAccountDeletion.ts`:
```ts
'use server';

import { requireUser } from '@/lib/auth/require-user';
import { accountDeletionService, type IssueResult } from '@/lib/account-deletion';

export const requestAccountDeletionAction = async (): Promise<IssueResult> => {
  const user = await requireUser();
  return accountDeletionService.issueCode(user.id, user.email);
};
```

- [ ] **Step 2: Write `deleteAccount.ts`**

`features/settings/actions/deleteAccount.ts`:
```ts
'use server';

import { requireUser } from '@/lib/auth/require-user';
import {
  accountDeletionService,
  deletionCodeSchema,
  type VerifyResult,
} from '@/lib/account-deletion';

export const deleteAccountAction = async (
  code: unknown
): Promise<VerifyResult> => {
  const user = await requireUser();
  const parsed = deletionCodeSchema.safeParse(code);
  if (!parsed.success) {
    return { ok: false, reason: 'invalid', remaining: 0 };
  }
  return accountDeletionService.verifyAndDelete(user.id, parsed.data);
};
```

- [ ] **Step 3: Export both from the barrel**

Append to `features/settings/actions/index.ts`:
```ts
export { requestAccountDeletionAction } from './requestAccountDeletion';
export { deleteAccountAction } from './deleteAccount';
```

- [ ] **Step 4: Type-check**

Run: `pnpm type-check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add features/settings/actions/requestAccountDeletion.ts features/settings/actions/deleteAccount.ts features/settings/actions/index.ts
git commit -m "feat(account-deletion): request-code + delete server actions"
```

---

### Task 8: Goodbye page + public-path registration

**Files:**
- Create: `app/account/deleted/page.tsx`
- Modify: `components/AppShell/publicPaths.ts`
- Modify: `components/AppShell/publicPaths.test.ts`

**Interfaces:**
- Produces: a public `/account/deleted` confirmation page rendered chrome-free (no sidebar/header — the user is signed out). `PUBLIC_PATHS` includes `/account/deleted`.

- [ ] **Step 1: Update the failing test first**

Add to `components/AppShell/publicPaths.test.ts` (inside the existing describe; mirror the existing assertion style):
```ts
it('treats /account/deleted as public', () => {
  expect(isPublicPath('/account/deleted')).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test components/AppShell/publicPaths.test.ts`
Expected: FAIL — `/account/deleted` not yet in the set.

- [ ] **Step 3: Add the path**

In `components/AppShell/publicPaths.ts`, change the set:
```ts
export const PUBLIC_PATHS = new Set(['/', '/account/deleted']);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test components/AppShell/publicPaths.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the goodbye page**

`app/account/deleted/page.tsx`:
```tsx
import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';

export default function AccountDeletedPage() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 px-6 text-center">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Your account was deleted</h1>
        <p className="text-muted-foreground max-w-md">
          Your journals and account have been permanently removed. There is
          nothing left to recover.
        </p>
      </div>
      <Link href="/" className={buttonVariants({ variant: 'outline' })}>
        Back to home
      </Link>
    </main>
  );
}
```

- [ ] **Step 6: Type-check**

Run: `pnpm type-check`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/account/deleted/page.tsx components/AppShell/publicPaths.ts components/AppShell/publicPaths.test.ts
git commit -m "feat(account-deletion): post-deletion goodbye page"
```

---

### Task 9: Danger Zone UI + Settings wiring

**Files:**
- Create: `features/settings/DangerZone.tsx`
- Modify: `features/settings/Settings.tsx` (mount the card)

**Interfaces:**
- Consumes: `requestAccountDeletionAction`, `deleteAccountAction` from `./actions`; `deletionCodeSchema` for client-side pre-check (optional); `authClient` from `@/lib/auth-client`; shadcn `Card`, `Button`, `Input`, `Alert`, `Label`; `sonner` `toast`; `useRouter`.
- Produces: `<DangerZone />` client component rendering the backup button, irreversible notice, "email me a code" button, code input, and confirm button. On `verifyResult.ok` → `authClient.signOut()` then `router.push('/account/deleted')`.

This is UI; behavior is exercised via the underlying action/service tests. No new automated test (consistent with other client components like `BaseCurrencyForm`). Manual verification in Step 4.

- [ ] **Step 1: Write the component**

`features/settings/DangerZone.tsx`:
```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { deleteAccountAction, requestAccountDeletionAction } from './actions';
import { authClient } from '@/lib/auth-client';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Phase = 'idle' | 'code-sent';

const DangerZone = () => {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('idle');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const sendCode = async () => {
    setPending(true);
    setError(null);
    try {
      const res = await requestAccountDeletionAction();
      if (!res.ok) {
        toast.error('Please wait a moment before requesting another code.');
        return;
      }
      setPhase('code-sent');
      toast.success('Verification code sent to your email.');
    } finally {
      setPending(false);
    }
  };

  const confirmDelete = async () => {
    setPending(true);
    setError(null);
    try {
      const res = await deleteAccountAction(code);
      if (res.ok) {
        await authClient.signOut();
        router.push('/account/deleted');
        return;
      }
      switch (res.reason) {
        case 'no-code':
        case 'expired':
          setError('That code expired. Request a new one.');
          setPhase('idle');
          setCode('');
          break;
        case 'too-many-attempts':
          setError('Too many attempts. Request a new code.');
          setPhase('idle');
          setCode('');
          break;
        case 'invalid':
          setError(
            res.remaining > 0
              ? `Incorrect code. ${res.remaining} attempt(s) left.`
              : 'Enter the 6-digit code from your email.'
          );
          break;
      }
    } finally {
      setPending(false);
    }
  };

  return (
    <Card className="border-destructive/50">
      <CardHeader>
        <CardTitle className="text-destructive">Danger zone</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium">Download a backup</span>
          <p className="text-muted-foreground text-sm">
            Export a .zip of your journal before deleting. Recommended.
          </p>
          <a
            href="/api/account/export"
            className={buttonVariants({ variant: 'outline', size: 'sm' }) + ' w-fit'}
          >
            Download backup (.zip)
          </a>
        </div>

        <Alert variant="destructive">
          <AlertTitle>Delete account</AlertTitle>
          <AlertDescription>
            This permanently deletes your journals and your account. This cannot
            be undone.
          </AlertDescription>
        </Alert>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {phase === 'idle' ? (
          <Button
            variant="destructive"
            size="sm"
            className="w-fit"
            disabled={pending}
            onClick={sendCode}
          >
            Email me a verification code
          </Button>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="deletion-code">
                Enter the 6-digit code from your email
              </Label>
              <Input
                id="deletion-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) =>
                  setCode(e.target.value.replace(/\D/g, '').slice(0, 6))
                }
                className="w-40 tracking-[0.3em]"
              />
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="destructive"
                size="sm"
                disabled={pending || code.length !== 6}
                onClick={confirmDelete}
              >
                Permanently delete my account
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() => {
                  setPhase('idle');
                  setCode('');
                  setError(null);
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default DangerZone;
```

- [ ] **Step 2: Mount it in Settings**

In `features/settings/Settings.tsx`: add the import near the other local imports:
```tsx
import DangerZone from './DangerZone';
```
Then render `<DangerZone />` as the last child inside the outer `<div className="flex flex-col gap-6">`, after the Base currency `</Card>`:
```tsx
      </Card>

      <DangerZone />
    </div>
```

- [ ] **Step 3: Type-check + lint**

Run: `pnpm type-check && pnpm lint`
Expected: PASS (no type errors; eslint clean).

- [ ] **Step 4: Manual verification**

Run: `pnpm dev`, sign in, visit `/settings`. Confirm: Danger Zone card renders; "Download backup (.zip)" downloads a non-empty zip; "Email me a verification code" sends mail (or check server logs / Postal) and reveals the code input; a wrong code shows "Incorrect code. N attempt(s) left."; the correct code signs out and lands on `/account/deleted`. (Use a throwaway test user — this really deletes.)

- [ ] **Step 5: Commit**

```bash
git add features/settings/DangerZone.tsx features/settings/Settings.tsx
git commit -m "feat(account-deletion): Settings danger-zone UI"
```

---

### Task 10: PLAN.md update + full verification

**Files:**
- Modify: `PLAN.md`

- [ ] **Step 1: Update Phase 7 in `PLAN.md`**

In the Phase 7 list, check off the backup item and add the account-deletion line. Change:
```markdown
- [ ] Backup / restore endpoint (download `.zip` of the journal directory)
- [ ] Account deletion (wipe journals + DB rows)
```
to:
```markdown
- [x] Backup endpoint — `GET /api/account/export` streams a `.zip` of the user's journal directory (reuses `pullLocked` + `listLocalRelPaths` + `adm-zip`). (Restore-from-backup upload still pending; import covers re-upload.)
- [x] **Account deletion** — self-service on `/settings` Danger Zone: emailed 6-digit code (hashed, 10-min expiry, 5-attempt cap, 30s resend throttle) → `purgeUserData` wipes Garage (`clearRemote`) + local journal dir + `db.delete(user)` cascade → sign-out + `/account/deleted`. Spec: `docs/superpowers/specs/2026-06-25-account-deletion-design.md`.
```

- [ ] **Step 2: Run the full suite + type-check + lint**

Run: `pnpm type-check && pnpm test && pnpm lint`
Expected: all PASS — full test suite green, no type errors, eslint clean.

- [ ] **Step 3: Commit**

```bash
git add PLAN.md
git commit -m "docs: mark account-deletion + journal backup done in PLAN"
```

---

## Self-Review

**Spec coverage:**
- Verification code (6-digit, hashed, expiry, attempt cap, throttle) → Tasks 1,2,5 ✓
- Backup .zip export → Task 6 ✓
- Deletion orchestration (Garage → local → DB cascade) → Task 4 ✓
- Server actions (request + delete) → Task 7 ✓
- Danger Zone UI + Settings wiring → Task 9 ✓
- Goodbye page (public, chrome-free) → Task 8 ✓
- Email via Postal transport → Task 5 (DI wiring) ✓
- Tests: repository, schema, purge, service, export → Tasks 2,3,4,5,6 ✓
- PLAN.md update → Task 10 ✓

**Type consistency:** `accountDeletionService`, `deletionCodeSchema`, `IssueResult`, `VerifyResult`, `purgeUserData`, `buildJournalZip`, `AccountDeletionChallengeRepository` names match across producing/consuming tasks. The `now` clock injection is consistent (service constructor + tests). `VerifyResult.invalid` always carries `remaining` (number); actions emit `remaining: 0` for bad-format input, which the UI maps to the schema message.

**Placeholder scan:** No TBD/TODO; every code step has full code; every test step has runnable assertions and expected output.
