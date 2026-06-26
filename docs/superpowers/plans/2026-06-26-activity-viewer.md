# Activity Viewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each user a read-only, filterable, paginated view of their own audit log at `/settings/activity`, plus a 3-event summary card on `/settings`.

**Architecture:** Reuse the existing `auditLog` table and `AuditService`. Extend the repository with composite-keyset pagination + action/result filters; add a `listForUser` read method to the service that maps 3 user-facing type groups to raw actions. All UI is server components reading URL search params (project convention) — no client JS; rows expand via native `<details>`. A pure `describeAuditEvent` maps each `(action, result)` to plain-English copy.

**Tech Stack:** Next.js 16 (App Router, async `searchParams`), Drizzle ORM (Postgres), Vitest, Tailwind v4 + shadcn/ui, TypeScript.

## Global Constraints

- Repository = data access only; Service = business logic. Singletons live in `lib/<area>/index.ts`. (project convention)
- UI lives in `features/`; `app/` pages are thin route shells. Non-UI shared logic lives in `lib/`. (project convention)
- Server components read filters from URL search params; `searchParams` is a `Promise` and must be `await`ed. (Next 16 convention; see `features/transactions/Transactions.tsx:37`)
- Audit `detail` jsonb NEVER contains journal content — display it as-is, it is already safe metadata.
- Result colors use the `text-positive` / `text-negative` Tailwind utilities. Cards use shadcn `Card`. Page width/`AppShell` wrapping is automatic via `app/layout.tsx` — subpages do NOT wrap themselves.
- No `console.*` — the repo has a `no-console` lint rule (use `@/lib/log` if logging is ever needed; not needed here).
- Page size constant: `ACTIVITY_PAGE_SIZE = 50`.
- Type-check (`pnpm type-check`) and lint must pass before each commit (a pre-commit hook runs them).

---

## File Structure

- `lib/audit/repository.ts` (modify) — `listByUser` gains an options object: composite cursor + `actions[]` + `result` filters. Export `AuditCursor` type.
- `lib/audit/service.ts` (modify) — add `listForUser(userId, opts)`; export `ActivityType`.
- `lib/audit/describe.ts` (create) — pure `describeAuditEvent(row)` → `{ label, icon }`.
- `features/activity/params.ts` (create) — `ACTIVITY_PAGE_SIZE`, cursor encode/decode, `parseType`/`parseResult`, `buildActivityQuery`.
- `features/activity/ActivityRow.tsx` (create) — one expandable row.
- `features/activity/ActivityList.tsx` (create) — page body: filters + rows + "Load more".
- `features/activity/ActivityCard.tsx` (create) — settings summary card.
- `features/activity/index.ts` (create) — barrel.
- `app/settings/activity/page.tsx` (create) — route shell.
- `app/settings/activity/loading.tsx` (create) — skeleton.
- `features/settings/Settings.tsx` (modify) + `app/settings/page.tsx` (modify) — render `ActivityCard`.
- Tests: `lib/audit/describe.test.ts` (create), `lib/audit/repository.test.ts` (extend), `lib/audit/service.test.ts` (extend), `features/activity/params.test.ts` (create).
- `PLAN.md` (modify) — tick the Activity-viewer half of the Phase 7 Future bullet.

---

## Task 1: Pure event describer (`lib/audit/describe.ts`)

**Files:**
- Create: `lib/audit/describe.ts`
- Test: `lib/audit/describe.test.ts`

**Interfaces:**
- Consumes: `AuditLog` type from `@/db/schema/auditLog`; `AUDIT_ACTIONS` from `./schema`.
- Produces: `describeAuditEvent(row: AuditLog): { label: string; icon: 'success' | 'failure' }`.

- [ ] **Step 1: Write the failing test**

Create `lib/audit/describe.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { describeAuditEvent } from './describe';
import { AUDIT_ACTIONS } from './schema';
import type { AuditLog } from '@/db/schema/auditLog';

const row = (over: Partial<AuditLog>): AuditLog =>
  ({
    id: '01HSAMPLEULID00000000000000',
    userId: 'alice',
    action: 'tx.add',
    result: 'success',
    targetUid: null,
    bytesBefore: null,
    bytesAfter: null,
    detail: null,
    ip: null,
    userAgent: null,
    createdAt: new Date('2026-06-26T14:02:00Z'),
    ...over,
  }) as AuditLog;

describe('describeAuditEvent', () => {
  it('every action renders a non-empty label for both results', () => {
    for (const action of AUDIT_ACTIONS) {
      for (const result of ['success', 'failure'] as const) {
        const out = describeAuditEvent(row({ action, result }));
        expect(out.label.length).toBeGreaterThan(0);
        expect(out.icon).toBe(result);
      }
    }
  });

  it('uses friendly success copy', () => {
    expect(describeAuditEvent(row({ action: 'tx.edit' })).label).toBe(
      'Edited a transaction'
    );
    expect(
      describeAuditEvent(row({ action: 'crypto.unlock' })).label
    ).toBe('Unlocked journal');
  });

  it('specializes import-failure copy by detail.reason', () => {
    expect(
      describeAuditEvent(
        row({ action: 'journal.import', result: 'failure', detail: { reason: 'quota' } })
      ).label
    ).toBe('Import failed — over quota');
    expect(
      describeAuditEvent(
        row({ action: 'journal.import', result: 'failure', detail: { reason: 'write-failed' } })
      ).label
    ).toBe('Import failed — could not write');
    expect(
      describeAuditEvent(
        row({ action: 'journal.import', result: 'failure', detail: null })
      ).label
    ).toBe('Import failed');
  });

  it('falls back gracefully for an unknown action', () => {
    const out = describeAuditEvent(row({ action: 'something.new' as AuditLog['action'] }));
    expect(out.label.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run lib/audit/describe.test.ts`
Expected: FAIL — `describeAuditEvent` not found / module missing.

- [ ] **Step 3: Write minimal implementation**

Create `lib/audit/describe.ts`:

```ts
import type { AuditLog } from '@/db/schema/auditLog';

type Described = { label: string; icon: 'success' | 'failure' };

// Plain-English copy per action. [successLabel, failureLabel].
const COPY: Record<string, [string, string]> = {
  'tx.add': ['Added a transaction', 'Failed to add a transaction'],
  'tx.edit': ['Edited a transaction', 'Failed to edit a transaction'],
  'tx.delete': ['Deleted a transaction', 'Failed to delete a transaction'],
  'journal.import': ['Imported journal', 'Import failed'],
  'crypto.enable': ['Enabled encryption', 'Failed to enable encryption'],
  'crypto.unlock': ['Unlocked journal', 'Failed to unlock journal'],
  'crypto.lock': ['Locked journal', 'Failed to lock journal'],
  'crypto.passphrase-change': [
    'Changed passphrase',
    'Failed to change passphrase',
  ],
  'crypto.recovery-rotate': [
    'Rotated recovery code',
    'Failed to rotate recovery code',
  ],
  'crypto.reset': ['Reset encryption', 'Failed to reset encryption'],
};

// More specific copy for a failed import, keyed by the recorded reason code.
const IMPORT_FAILURE: Record<string, string> = {
  quota: 'Import failed — over quota',
  'write-failed': 'Import failed — could not write',
};

export const describeAuditEvent = (row: AuditLog): Described => {
  const icon = row.result === 'success' ? 'success' : 'failure';

  if (row.action === 'journal.import' && row.result === 'failure') {
    const reason =
      row.detail && typeof (row.detail as Record<string, unknown>).reason === 'string'
        ? ((row.detail as Record<string, unknown>).reason as string)
        : undefined;
    if (reason && IMPORT_FAILURE[reason]) {
      return { label: IMPORT_FAILURE[reason], icon };
    }
  }

  const pair = COPY[row.action];
  if (!pair) {
    return { label: row.action.replace(/[._]/g, ' '), icon };
  }
  return { label: row.result === 'success' ? pair[0] : pair[1], icon };
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run lib/audit/describe.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/audit/describe.ts lib/audit/describe.test.ts
git commit -m "feat(activity): pure describeAuditEvent for friendly event labels"
```

---

## Task 2: Repository pagination + filters (`lib/audit/repository.ts`)

**Files:**
- Modify: `lib/audit/repository.ts`
- Test: `lib/audit/repository.test.ts` (extend)

**Interfaces:**
- Consumes: `AuditAction` from `./schema`; `auditLog`/`AuditLog` from `@/db/schema/auditLog`.
- Produces:
  - `export type AuditCursor = { createdAt: Date; id: string };`
  - `listByUser(userId: string, opts?: { limit?: number; before?: AuditCursor; actions?: AuditAction[]; result?: 'success' | 'failure' }): Promise<AuditLog[]>`

- [ ] **Step 1: Write the failing test**

Append to `lib/audit/repository.test.ts` inside the `describe('AuditRepository', ...)` block (after the existing `listByUser` test):

```ts
  it('listByUser paginates with a composite cursor (no overlap)', async () => {
    // Insert 3 rows oldest→newest; createdAt default now() is strictly increasing.
    await repo.insert('alice', { action: 'tx.add', result: 'success' });
    await repo.insert('alice', { action: 'tx.edit', result: 'success' });
    await repo.insert('alice', { action: 'tx.delete', result: 'success' });

    const page1 = await repo.listByUser('alice', { limit: 2 });
    expect(page1).toHaveLength(2);
    expect(page1[0].action).toBe('tx.delete'); // newest first

    const last = page1[1];
    const page2 = await repo.listByUser('alice', {
      limit: 2,
      before: { createdAt: last.createdAt, id: last.id },
    });
    expect(page2).toHaveLength(1);
    expect(page2[0].action).toBe('tx.add'); // oldest
    expect(page2.map((r) => r.id)).not.toContain(last.id);
  });

  it('listByUser filters by actions and result', async () => {
    await repo.insert('alice', { action: 'tx.add', result: 'success' });
    await repo.insert('alice', { action: 'crypto.unlock', result: 'success' });
    await repo.insert('alice', { action: 'crypto.unlock', result: 'failure' });

    const crypto = await repo.listByUser('alice', {
      actions: ['crypto.unlock', 'crypto.lock'],
    });
    expect(crypto).toHaveLength(2);
    expect(crypto.every((r) => r.action === 'crypto.unlock')).toBe(true);

    const failures = await repo.listByUser('alice', { result: 'failure' });
    expect(failures).toHaveLength(1);
    expect(failures[0].result).toBe('failure');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run lib/audit/repository.test.ts`
Expected: FAIL — `listByUser` rejects the options object / type error (current signature is `(userId, limit=100)`).

- [ ] **Step 3: Write minimal implementation**

Replace the imports line and the `listByUser` method in `lib/audit/repository.ts`.

Change the top import from:

```ts
import { desc, eq } from 'drizzle-orm';
```

to:

```ts
import { and, desc, eq, inArray, lt, or } from 'drizzle-orm';
```

Add the cursor type near the top (after imports, before the class):

```ts
import type { AuditAction } from './schema';

export type AuditCursor = { createdAt: Date; id: string };

type ListOpts = {
  limit?: number;
  before?: AuditCursor;
  actions?: AuditAction[];
  result?: 'success' | 'failure';
};
```

Replace the existing `listByUser` method with:

```ts
  async listByUser(userId: string, opts: ListOpts = {}): Promise<AuditLog[]> {
    const { limit = 100, before, actions, result } = opts;
    return this.db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.userId, userId),
          before
            ? or(
                lt(auditLog.createdAt, before.createdAt),
                and(
                  eq(auditLog.createdAt, before.createdAt),
                  lt(auditLog.id, before.id)
                )
              )
            : undefined,
          actions && actions.length > 0
            ? inArray(auditLog.action, actions)
            : undefined,
          result ? eq(auditLog.result, result) : undefined
        )
      )
      .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
      .limit(limit);
  }
```

(Drizzle's `and`/`or` ignore `undefined` arguments, so absent filters are no-ops.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run lib/audit/repository.test.ts`
Expected: PASS (the original 2 tests + 2 new). The original `listByUser('alice')` call still works since `opts` defaults to `{}`.

- [ ] **Step 5: Commit**

```bash
git add lib/audit/repository.ts lib/audit/repository.test.ts
git commit -m "feat(activity): composite-cursor pagination + action/result filters on listByUser"
```

---

## Task 3: Service read method (`lib/audit/service.ts`)

**Files:**
- Modify: `lib/audit/service.ts`, `lib/audit/index.ts`
- Test: `lib/audit/service.test.ts` (extend)

**Interfaces:**
- Consumes: `AuditRepository.listByUser` (Task 2); `AuditCursor`, `AuditAction`.
- Produces:
  - `export type ActivityType = 'all' | 'transactions' | 'imports' | 'security';`
  - `AuditService.listForUser(userId: string, opts?: { limit?: number; before?: AuditCursor; type?: ActivityType; result?: 'all' | 'success' | 'failure' }): Promise<AuditLog[]>`

- [ ] **Step 1: Write the failing test**

Append to `lib/audit/service.test.ts` a new top-level `describe` block:

```ts
import { AuditService, type ActivityType } from './service';

describe('AuditService.listForUser', () => {
  const listRepo = () =>
    ({ listByUser: vi.fn().mockResolvedValue([]) }) as unknown as AuditRepository;

  it('translates type=security to the crypto.* actions', async () => {
    const repo = listRepo();
    const svc = new AuditService(repo);
    await svc.listForUser('alice', { type: 'security' });
    expect(repo.listByUser).toHaveBeenCalledWith(
      'alice',
      expect.objectContaining({
        actions: expect.arrayContaining(['crypto.unlock', 'crypto.reset']),
      })
    );
  });

  it('translates type=transactions to tx.* and omits actions for all', async () => {
    const repo = listRepo();
    const svc = new AuditService(repo);
    await svc.listForUser('alice', { type: 'transactions' });
    expect(repo.listByUser).toHaveBeenCalledWith(
      'alice',
      expect.objectContaining({ actions: ['tx.add', 'tx.edit', 'tx.delete'] })
    );

    repo.listByUser = vi.fn().mockResolvedValue([]);
    await svc.listForUser('alice', { type: 'all' });
    expect(repo.listByUser).toHaveBeenCalledWith(
      'alice',
      expect.objectContaining({ actions: undefined })
    );
  });

  it('normalizes result=all to no result filter, forwards cursor + limit', async () => {
    const repo = listRepo();
    const svc = new AuditService(repo);
    const before = { createdAt: new Date('2026-06-26T00:00:00Z'), id: 'x' };
    await svc.listForUser('alice', { result: 'all', limit: 51, before });
    expect(repo.listByUser).toHaveBeenCalledWith(
      'alice',
      expect.objectContaining({ result: undefined, limit: 51, before })
    );

    repo.listByUser = vi.fn().mockResolvedValue([]);
    await svc.listForUser('alice', { result: 'failure' });
    expect(repo.listByUser).toHaveBeenCalledWith(
      'alice',
      expect.objectContaining({ result: 'failure' })
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run lib/audit/service.test.ts`
Expected: FAIL — `listForUser` / `ActivityType` export missing.

- [ ] **Step 3: Write minimal implementation**

In `lib/audit/service.ts`, add imports + types + the method.

Add to the existing imports:

```ts
import type { AuditCursor } from './repository';
import type { AuditAction } from './schema';
import type { AuditLog } from '@/db/schema/auditLog';
```

Add above the class:

```ts
export type ActivityType = 'all' | 'transactions' | 'imports' | 'security';

const TYPE_ACTIONS: Record<Exclude<ActivityType, 'all'>, AuditAction[]> = {
  transactions: ['tx.add', 'tx.edit', 'tx.delete'],
  imports: ['journal.import'],
  security: [
    'crypto.enable',
    'crypto.unlock',
    'crypto.lock',
    'crypto.passphrase-change',
    'crypto.recovery-rotate',
    'crypto.reset',
  ],
};
```

Add this method inside the `AuditService` class (after `record`):

```ts
  /** Read a user's own audit events, newest first, with optional group/result
   * filters and a keyset cursor. Reads are NOT best-effort — a query failure
   * propagates so the route error boundary can surface it. */
  async listForUser(
    userId: string,
    opts: {
      limit?: number;
      before?: AuditCursor;
      type?: ActivityType;
      result?: 'all' | 'success' | 'failure';
    } = {}
  ): Promise<AuditLog[]> {
    const { limit = 50, before, type = 'all', result = 'all' } = opts;
    return this.repo.listByUser(userId, {
      limit,
      before,
      actions: type === 'all' ? undefined : TYPE_ACTIONS[type],
      result: result === 'all' ? undefined : result,
    });
  }
```

In `lib/audit/index.ts`, add the type re-export so consumers import from the barrel:

```ts
export type { ActivityType } from './service';
export type { AuditCursor } from './repository';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run lib/audit/service.test.ts`
Expected: PASS (existing `record` tests + 3 new `listForUser` tests).

- [ ] **Step 5: Commit**

```bash
git add lib/audit/service.ts lib/audit/index.ts lib/audit/service.test.ts
git commit -m "feat(activity): AuditService.listForUser with type-group + result translation"
```

---

## Task 4: URL param + cursor helpers (`features/activity/params.ts`)

**Files:**
- Create: `features/activity/params.ts`
- Test: `features/activity/params.test.ts`

**Interfaces:**
- Consumes: `ActivityType` from `@/lib/audit`; `AuditCursor` from `@/lib/audit`.
- Produces:
  - `ACTIVITY_PAGE_SIZE = 50`
  - `parseType(raw: string | undefined): ActivityType`
  - `parseResult(raw: string | undefined): 'all' | 'success' | 'failure'`
  - `encodeCursor(row: { createdAt: Date; id: string }): string`
  - `decodeCursor(raw: string | undefined): AuditCursor | undefined`
  - `buildActivityQuery(opts: { type: ActivityType; result: 'all' | 'success' | 'failure'; before?: string }): string`

- [ ] **Step 1: Write the failing test**

Create `features/activity/params.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  buildActivityQuery,
  decodeCursor,
  encodeCursor,
  parseResult,
  parseType,
} from './params';

describe('activity params', () => {
  it('parseType accepts known values and defaults to all', () => {
    expect(parseType('security')).toBe('security');
    expect(parseType('transactions')).toBe('transactions');
    expect(parseType('bogus')).toBe('all');
    expect(parseType(undefined)).toBe('all');
  });

  it('parseResult accepts known values and defaults to all', () => {
    expect(parseResult('failure')).toBe('failure');
    expect(parseResult('nope')).toBe('all');
    expect(parseResult(undefined)).toBe('all');
  });

  it('encode/decode cursor round-trips', () => {
    const createdAt = new Date('2026-06-26T14:02:03.000Z');
    const token = encodeCursor({ createdAt, id: '01HSAMPLE' });
    const back = decodeCursor(token);
    expect(back?.id).toBe('01HSAMPLE');
    expect(back?.createdAt.getTime()).toBe(createdAt.getTime());
  });

  it('decodeCursor rejects garbage', () => {
    expect(decodeCursor(undefined)).toBeUndefined();
    expect(decodeCursor('')).toBeUndefined();
    expect(decodeCursor('notanumber_id')).toBeUndefined();
    expect(decodeCursor('123')).toBeUndefined();
  });

  it('buildActivityQuery omits defaults and includes cursor', () => {
    expect(buildActivityQuery({ type: 'all', result: 'all' })).toBe('');
    expect(
      buildActivityQuery({ type: 'security', result: 'failure', before: '123_x' })
    ).toBe('?type=security&result=failure&before=123_x');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run features/activity/params.test.ts`
Expected: FAIL — module `./params` missing.

- [ ] **Step 3: Write minimal implementation**

Create `features/activity/params.ts`:

```ts
import type { ActivityType, AuditCursor } from '@/lib/audit';

export const ACTIVITY_PAGE_SIZE = 50;

const TYPES: ActivityType[] = ['all', 'transactions', 'imports', 'security'];
const RESULTS = ['all', 'success', 'failure'] as const;
type ResultFilter = (typeof RESULTS)[number];

export const parseType = (raw: string | undefined): ActivityType =>
  TYPES.includes(raw as ActivityType) ? (raw as ActivityType) : 'all';

export const parseResult = (raw: string | undefined): ResultFilter =>
  RESULTS.includes(raw as ResultFilter) ? (raw as ResultFilter) : 'all';

export const encodeCursor = (row: { createdAt: Date; id: string }): string =>
  `${row.createdAt.getTime()}_${row.id}`;

export const decodeCursor = (raw: string | undefined): AuditCursor | undefined => {
  if (!raw) return undefined;
  const sep = raw.indexOf('_');
  if (sep <= 0) return undefined;
  const ms = Number(raw.slice(0, sep));
  const id = raw.slice(sep + 1);
  if (!Number.isInteger(ms) || ms <= 0 || id.length === 0) return undefined;
  return { createdAt: new Date(ms), id };
};

export const buildActivityQuery = (opts: {
  type: ActivityType;
  result: ResultFilter;
  before?: string;
}): string => {
  const p = new URLSearchParams();
  if (opts.type !== 'all') p.set('type', opts.type);
  if (opts.result !== 'all') p.set('result', opts.result);
  if (opts.before) p.set('before', opts.before);
  const s = p.toString();
  return s ? `?${s}` : '';
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run features/activity/params.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add features/activity/params.ts features/activity/params.test.ts
git commit -m "feat(activity): URL filter + composite-cursor param helpers"
```

---

## Task 5: Activity page UI (`features/activity/ActivityRow.tsx`, `ActivityList.tsx`, route shell)

**Files:**
- Create: `features/activity/ActivityRow.tsx`, `features/activity/ActivityList.tsx`, `features/activity/index.ts`
- Create: `app/settings/activity/page.tsx`, `app/settings/activity/loading.tsx`

**Interfaces:**
- Consumes: `auditService.listForUser` (Task 3); `describeAuditEvent` (Task 1); `params.ts` helpers (Task 4); `AuditLog`.
- Produces:
  - `ActivityRow({ row }: { row: AuditLog })`
  - `ActivityList({ rows, type, result, nextCursor }: { rows: AuditLog[]; type: ActivityType; result: 'all'|'success'|'failure'; nextCursor: string | null })`
  - barrel exports `ActivityList`, `ActivityCard` (ActivityCard added in Task 6).

- [ ] **Step 1: Create `ActivityRow.tsx`**

```tsx
import { describeAuditEvent } from '@/lib/audit/describe';
import type { AuditLog } from '@/db/schema/auditLog';
import getDefaultDateLocale from '@/utils/getDefaultDateLocale';

const formatWhen = (d: Date): string =>
  new Date(d).toLocaleString(getDefaultDateLocale(), {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

const DetailLine = ({ label, value }: { label: string; value: string }) => (
  <div className="flex gap-2">
    <span className="w-24 shrink-0 text-muted">{label}</span>
    <span className="break-all tabular-nums">{value}</span>
  </div>
);

const ActivityRow = ({ row }: { row: AuditLog }) => {
  const { label, icon } = describeAuditEvent(row);
  const hasBytes = row.bytesBefore !== null || row.bytesAfter !== null;
  const detailJson =
    row.detail && Object.keys(row.detail as object).length > 0
      ? JSON.stringify(row.detail)
      : null;

  return (
    <details className="border-b border-border py-2 text-sm">
      <summary className="flex cursor-pointer list-none items-center gap-3">
        <span
          className={`shrink-0 font-medium ${icon === 'success' ? 'text-positive' : 'text-negative'}`}
          aria-hidden
        >
          {icon === 'success' ? '✓' : '✗'}
        </span>
        <span className="flex-1">{label}</span>
        <time className="shrink-0 text-muted" dateTime={new Date(row.createdAt).toISOString()}>
          {formatWhen(row.createdAt)}
        </time>
      </summary>
      <div className="mt-2 flex flex-col gap-1 pl-6 text-muted">
        {row.targetUid && <DetailLine label="uid" value={row.targetUid} />}
        {hasBytes && (
          <DetailLine
            label="bytes"
            value={`${row.bytesBefore ?? '—'} → ${row.bytesAfter ?? '—'}`}
          />
        )}
        {row.ip && <DetailLine label="ip" value={row.ip} />}
        {row.userAgent && <DetailLine label="device" value={row.userAgent} />}
        {detailJson && <DetailLine label="detail" value={detailJson} />}
      </div>
    </details>
  );
};

export default ActivityRow;
```

- [ ] **Step 2: Create `ActivityList.tsx`**

```tsx
import Link from 'next/link';
import ActivityRow from './ActivityRow';
import { buildActivityQuery } from './params';
import type { ActivityType } from '@/lib/audit';
import type { AuditLog } from '@/db/schema/auditLog';
import { buttonVariants } from '@/components/ui/button';

type ResultFilter = 'all' | 'success' | 'failure';

const TYPE_TABS: { value: ActivityType; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'transactions', label: 'Transactions' },
  { value: 'imports', label: 'Imports' },
  { value: 'security', label: 'Security' },
];

const RESULT_TABS: { value: ResultFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'success', label: 'Success' },
  { value: 'failure', label: 'Failures' },
];

const Tabs = <T extends string>({
  tabs,
  active,
  href,
}: {
  tabs: { value: T; label: string }[];
  active: T;
  href: (value: T) => string;
}) => (
  <div className="flex flex-wrap gap-1">
    {tabs.map((t) => (
      <Link
        key={t.value}
        href={href(t.value)}
        className={buttonVariants({
          variant: t.value === active ? 'default' : 'ghost',
          size: 'sm',
        })}
      >
        {t.label}
      </Link>
    ))}
  </div>
);

const ActivityList = ({
  rows,
  type,
  result,
  nextCursor,
}: {
  rows: AuditLog[];
  type: ActivityType;
  result: ResultFilter;
  nextCursor: string | null;
}) => (
  <div className="flex flex-col gap-6">
    <h1 className="text-2xl font-semibold">Activity</h1>

    <div className="flex flex-col gap-3">
      <Tabs
        tabs={TYPE_TABS}
        active={type}
        href={(value) => `/settings/activity${buildActivityQuery({ type: value, result })}`}
      />
      <Tabs
        tabs={RESULT_TABS}
        active={result}
        href={(value) => `/settings/activity${buildActivityQuery({ type, result: value })}`}
      />
    </div>

    {rows.length === 0 ? (
      <p className="text-muted">No activity matches these filters yet.</p>
    ) : (
      <div className="flex flex-col">
        {rows.map((row) => (
          <ActivityRow key={row.id} row={row} />
        ))}
      </div>
    )}

    {nextCursor && (
      <Link
        href={`/settings/activity${buildActivityQuery({ type, result, before: nextCursor })}`}
        className={buttonVariants({ variant: 'outline', size: 'sm' })}
      >
        Load older
      </Link>
    )}
  </div>
);

export default ActivityList;
```

- [ ] **Step 3: Create the barrel `features/activity/index.ts`**

```ts
export { default as ActivityList } from './ActivityList';
export { default as ActivityCard } from './ActivityCard';
```

(`ActivityCard` is created in Task 6; the barrel referencing it now means Task 5's `pnpm type-check` will fail until Task 6. To keep Task 5 independently green, create a minimal placeholder now and flesh it out in Task 6 — OR export only `ActivityList` here and add `ActivityCard` to the barrel in Task 6. **Do the latter:** in this task the barrel contains only the `ActivityList` line; add the `ActivityCard` line in Task 6.)

So for THIS task, `features/activity/index.ts` is exactly:

```ts
export { default as ActivityList } from './ActivityList';
```

- [ ] **Step 4: Create the route shell `app/settings/activity/page.tsx`**

```tsx
import { ActivityList } from '@/features/activity';
import {
  ACTIVITY_PAGE_SIZE,
  decodeCursor,
  encodeCursor,
  parseResult,
  parseType,
} from '@/features/activity/params';
import { auditService } from '@/lib/audit';
import { requireUser } from '@/lib/auth/require-user';

type SearchParams = { type?: string; result?: string; before?: string };

const ActivityPage = async ({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) => {
  const user = await requireUser();
  const sp = await searchParams;
  const type = parseType(sp.type);
  const result = parseResult(sp.result);
  const before = decodeCursor(sp.before);

  const rows = await auditService.listForUser(user.id, {
    limit: ACTIVITY_PAGE_SIZE + 1,
    before,
    type,
    result,
  });

  const hasMore = rows.length > ACTIVITY_PAGE_SIZE;
  const page = hasMore ? rows.slice(0, ACTIVITY_PAGE_SIZE) : rows;
  const nextCursor =
    hasMore && page.length > 0 ? encodeCursor(page[page.length - 1]) : null;

  return (
    <ActivityList rows={page} type={type} result={result} nextCursor={nextCursor} />
  );
};

export default ActivityPage;
```

- [ ] **Step 5: Create `app/settings/activity/loading.tsx`**

First confirm the existing skeleton import shape:

Run: `cat app/settings/loading.tsx`

Then mirror it. Most likely it is:

```tsx
import PageSkeleton from '@/components/PageSkeleton';

export default function Loading() {
  return <PageSkeleton />;
}
```

If `app/settings/loading.tsx` passes props (e.g. `<PageSkeleton withChart={false} />`), copy that exact usage instead. Create `app/settings/activity/loading.tsx` with the same content.

- [ ] **Step 6: Verify type-check + lint**

Run: `pnpm type-check && pnpm lint`
Expected: PASS, no errors in the new files.

- [ ] **Step 7: Manual smoke check**

Run: `pnpm dev` (or confirm it's already running), then load `http://localhost:3000/settings/activity`.
Expected: page renders with the two filter rows; events list newest-first; clicking a filter updates the URL (`?type=security`); "Load older" appears only when there are >50 matching rows. (If you have <1 event, it shows the empty state — add a transaction via `/transactions/new` to generate a `tx.add` event, then refresh.)

- [ ] **Step 8: Commit**

```bash
git add features/activity/ActivityRow.tsx features/activity/ActivityList.tsx features/activity/index.ts app/settings/activity/page.tsx app/settings/activity/loading.tsx
git commit -m "feat(activity): /settings/activity page with filters + keyset pagination"
```

---

## Task 6: Settings summary card (`features/activity/ActivityCard.tsx` + wiring)

**Files:**
- Create: `features/activity/ActivityCard.tsx`
- Modify: `features/activity/index.ts`, `features/settings/Settings.tsx`, `app/settings/page.tsx`

**Interfaces:**
- Consumes: `describeAuditEvent` (Task 1); `AuditLog`; shadcn `Card`.
- Produces: `ActivityCard({ rows }: { rows: AuditLog[] })`; `Settings` gains a `recentActivity: AuditLog[]` prop.

- [ ] **Step 1: Create `ActivityCard.tsx`**

```tsx
import Link from 'next/link';
import { describeAuditEvent } from '@/lib/audit/describe';
import type { AuditLog } from '@/db/schema/auditLog';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import getDefaultDateLocale from '@/utils/getDefaultDateLocale';

const formatWhen = (d: Date): string =>
  new Date(d).toLocaleString(getDefaultDateLocale(), {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

const ActivityCard = ({ rows }: { rows: AuditLog[] }) => (
  <Card>
    <CardHeader className="flex flex-row items-center justify-between">
      <CardTitle>Activity</CardTitle>
      <Link
        href="/settings/activity"
        className={buttonVariants({ variant: 'link', size: 'sm' })}
      >
        View all activity →
      </Link>
    </CardHeader>
    <CardContent>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">No activity yet.</p>
      ) : (
        <ul className="flex flex-col gap-2 text-sm">
          {rows.map((row) => {
            const { label, icon } = describeAuditEvent(row);
            return (
              <li key={row.id} className="flex items-center gap-3">
                <span
                  className={`shrink-0 ${icon === 'success' ? 'text-positive' : 'text-negative'}`}
                  aria-hidden
                >
                  {icon === 'success' ? '✓' : '✗'}
                </span>
                <span className="flex-1">{label}</span>
                <time
                  className="shrink-0 text-muted"
                  dateTime={new Date(row.createdAt).toISOString()}
                >
                  {formatWhen(row.createdAt)}
                </time>
              </li>
            );
          })}
        </ul>
      )}
    </CardContent>
  </Card>
);

export default ActivityCard;
```

- [ ] **Step 2: Add `ActivityCard` to the barrel**

`features/activity/index.ts` becomes:

```ts
export { default as ActivityList } from './ActivityList';
export { default as ActivityCard } from './ActivityCard';
```

- [ ] **Step 3: Render the card in `Settings.tsx`**

In `features/settings/Settings.tsx`:

Add the imports:

```tsx
import { ActivityCard } from '@/features/activity';
import type { AuditLog } from '@/db/schema/auditLog';
```

Add `recentActivity` to `Props`:

```tsx
type Props = {
  base: string;
  currencies: string[];
  savedDefault: string | null;
  envFallback: string;
  encryptionEnabled: boolean;
  recentActivity: AuditLog[];
};
```

Destructure it in the component signature (add `recentActivity` to the param list), then render `<ActivityCard rows={recentActivity} />` between `<SecuritySection ... />` and `<DangerZone />`:

```tsx
      <SecuritySection enabled={encryptionEnabled} />

      <ActivityCard rows={recentActivity} />

      <DangerZone />
```

- [ ] **Step 4: Fetch the data in `app/settings/page.tsx`**

Add `auditService` to the imports:

```tsx
import { auditService } from '@/lib/audit';
```

Add a 4th promise to the `Promise.all` and pass the prop. The block becomes:

```tsx
  const user = await requireUser();
  const [{ currencies, base }, row, status, recentActivity] = await Promise.all([
    getAvailableCurrencies(),
    userSettingRepository.get(user.id),
    cryptoStatus(user.id),
    auditService.listForUser(user.id, { limit: 3 }),
  ]);
  return (
    <Settings
      base={base}
      currencies={currencies}
      savedDefault={row?.baseCurrency ?? null}
      envFallback={env.DEFAULT_CURRENCY}
      encryptionEnabled={status !== 'unset'}
      recentActivity={recentActivity}
    />
  );
```

- [ ] **Step 5: Verify type-check + lint**

Run: `pnpm type-check && pnpm lint`
Expected: PASS.

- [ ] **Step 6: Run the full audit test suite**

Run: `pnpm vitest run lib/audit features/activity`
Expected: PASS (all describe/repository/service/params tests).

- [ ] **Step 7: Manual smoke check**

Reload `http://localhost:3000/settings`.
Expected: an "Activity" card appears between Security and Danger Zone showing the last 3 events (or "No activity yet."), with a working "View all activity →" link.

- [ ] **Step 8: Tick the PLAN.md bullet**

In `PLAN.md`, the Phase 7 Future bullet currently reads:

```
- [ ] _Future:_ audit-log retention/pruning cron + per-user Activity (`/settings`) viewer UI (`AuditRepository.listByUser` already exists). Also: record import quota-exceeded / hard-error failure paths (currently only the parse-failure import path is audited).
```

Replace it with (viewer done, cron still pending; the import-failure paths already landed in PR #33):

```
- [ ] _Future:_ audit-log retention/pruning cron. _(Per-user Activity viewer UI shipped: `/settings/activity` + summary card — spec `docs/superpowers/specs/2026-06-26-activity-viewer-design.md`. Import quota/hard-error failure paths already audited.)_
```

- [ ] **Step 9: Commit**

```bash
git add features/activity/ActivityCard.tsx features/activity/index.ts features/settings/Settings.tsx app/settings/page.tsx PLAN.md
git commit -m "feat(activity): settings summary card + wire recent activity; update PLAN"
```

---

## Self-Review notes

- **Spec coverage:** routes (Task 5), summary card (Task 6), composite-cursor pagination (Task 2), type/result filters (Tasks 2–4), `describeAuditEvent` (Task 1), `listForUser` (Task 3), native-`<details>` expansion (Task 5), tests for describe/repository/service/params (Tasks 1–4), empty states (Tasks 5–6), deferred cron (PLAN update, Task 6). All covered.
- **Type consistency:** `AuditCursor = { createdAt: Date; id: string }` defined in Task 2, imported by Tasks 3–4. `ActivityType` defined in Task 3, used in Tasks 4–5. `describeAuditEvent` signature identical across Tasks 1/5/6. `listForUser` opts identical across Tasks 3/5/6.
- **Known cross-task ordering:** the `features/activity/index.ts` barrel only exports `ActivityList` after Task 5 and gains `ActivityCard` in Task 6 — each task's barrel is independently type-clean. Do not add the `ActivityCard` export early.
```
