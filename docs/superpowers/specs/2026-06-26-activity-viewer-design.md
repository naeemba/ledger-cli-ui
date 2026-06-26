# Activity Viewer — Design

**Date:** 2026-06-26
**Phase:** 7 (Multi-user hardening) — the open "per-user Activity viewer UI" Future bullet.
**Status:** Approved, ready for implementation plan.

## Goal

Give each user a self-service view of their own audit log: the security and
journal-mutation events already recorded by `AuditService.record()`. Read-only.
No new event types, no schema changes to `auditLog`.

**In scope:** a dedicated `/settings/activity` page (filterable, paginated) plus a
small summary card on `/settings`.

**Explicitly out of scope (deferred):** the audit-log retention/pruning cron. The
table grows unbounded for now — fine at current volume. The PLAN.md Phase 7
"Future" bullet for the cron stays open.

## Background

Existing infrastructure (no changes needed to the recording path):

- `db/schema/auditLog.ts` — table `auditLog` with `(userId, createdAt desc)` index.
  Columns: `id` (ULID pk), `userId` (FK cascade), `action`, `result`
  (`success`|`failure`), `targetUid`, `bytesBefore`, `bytesAfter`, `detail` (jsonb),
  `ip`, `userAgent`, `createdAt`.
- `lib/audit/schema.ts` — `AUDIT_ACTIONS` (10): `tx.add`, `tx.edit`, `tx.delete`,
  `journal.import`, `crypto.enable`, `crypto.unlock`, `crypto.lock`,
  `crypto.passphrase-change`, `crypto.recovery-rotate`, `crypto.reset`.
- `lib/audit/repository.ts` — `AuditRepository.listByUser(userId, limit=100)`.
- `lib/audit/service.ts` — `AuditService.record()` (best-effort) + delegates.
- `lib/audit/index.ts` — singletons `auditRepository`, `auditService`.
- `/settings` is a server component (`app/settings/page.tsx`) rendering
  `features/settings/Settings.tsx`, which stacks `Card` sections. `/settings/passkeys`
  is the precedent for a settings subpage.

## Architecture

### Routes & surfaces

1. **`/settings/activity`** (`app/settings/activity/page.tsx`) — async server component,
   `requireUser()` guard, wrapped by the standard `AppShell`. Reads filter + cursor
   from `searchParams`, calls the service, renders the list. A `loading.tsx` sibling
   reuses the existing `PageSkeleton`.

2. **Activity card on `/settings`** — a new `Card` rendered in `Settings.tsx` between
   `SecuritySection` and `DangerZone`. Server-fed with the last 3 events; links to
   `/settings/activity` ("View all activity →"). Empty state when there are no events.

### Pagination — server-component, URL-param cursor

No client component, no extra server action. Matches the project-wide "server
component reads URL search params" convention (DateFilter, transactions, saved views).

- Cursor is the opaque `id` (ULID, time-sortable) of the last row on the current page.
- "Load more" is a plain `<Link>` to `?…&before=<lastId>` → full-page navigation.
- Page size: 50 (constant `ACTIVITY_PAGE_SIZE`).

### Filters — URL search params

- `type` ∈ `all` | `transactions` | `imports` | `security` (default `all`).
- `result` ∈ `all` | `success` | `failure` (default `all`).
- Changing either filter is a `<Link>` navigation that drops `before` (resets to page 1).
- **Action groups** collapse the 10 raw actions into 3 user-facing buckets:
  - `transactions` → `tx.add`, `tx.edit`, `tx.delete`
  - `imports` → `journal.import`
  - `security` → all `crypto.*`

## Data layer changes

### `AuditRepository.listByUser` — options object

Replace the `(userId, limit=100)` signature with `(userId, opts?)`:

```ts
type ListOpts = {
  limit?: number;          // default 100
  before?: string;         // cursor: only rows with id < before
  actions?: AuditAction[]; // restrict to these raw actions (filter group)
  result?: 'success' | 'failure';
};
async listByUser(userId: string, opts?: ListOpts): Promise<AuditLog[]>
```

Query: `where userId = ?` AND (`before` ? `id < before`) AND
(`actions` ? `action in (...)`) AND (`result` ? `result = ?`),
`order by createdAt desc, id desc`, `limit`.

The `id < before` tiebreak on a ULID gives stable keyset pagination consistent with
`createdAt desc` ordering; the existing `(userId, createdAt desc)` index still serves
the scan. The one existing caller (none yet outside tests — `listByUser` is currently
only referenced by the repo's own tests) is updated to the new signature.

### `AuditService` — read method

Add a read method alongside `record()`:

```ts
async listForUser(userId: string, opts?: {
  limit?: number;
  before?: string;
  type?: 'all' | 'transactions' | 'imports' | 'security';
  result?: 'all' | 'success' | 'failure';
}): Promise<AuditLog[]>
```

Translates `type` → `actions[]` and normalizes `result: 'all'` → undefined, then
delegates to the repository. Fetches `limit + 1` rows so the page can tell whether a
"Load more" link is warranted without a second count query.

## Presentation — `features/activity/`

Per the features/ convention (UI in features/, page is a thin shell):

- **`ActivityCard.tsx`** — settings summary (last 3 rows + link). Server component.
- **`ActivityList.tsx`** — the page body: filter controls (two `Link`-driven
  dropdowns/segmented controls), the row list, and the "Load more" link. Server
  component.
- **`ActivityRow.tsx`** — one row. The summary line is always visible; the detail is
  revealed by a native `<details>`/`<summary>` (no client JS) — timestamp · description ·
  success/fail glyph in `<summary>`, and uid / `bytesBefore→bytesAfter` / ip /
  userAgent / pretty-printed `detail` JSON inside.
- **`lib/audit/describe.ts`** — pure function
  `describeAuditEvent(row): { label: string; icon: 'success' | 'failure' }`
  mapping every `(action, result)` to a plain-English label
  (e.g. `tx.edit`+success → "Edited a transaction"; `journal.import`+failure with
  `detail.reason === 'quota'` → "Import failed — over quota"). Lives in lib/ because
  it's pure, non-UI, and unit-tested independently.
- **`features/activity/index.ts`** — barrel export.

Styling reuses existing tokens: `--positive`/`--negative` for the result glyph,
shadcn `Card`, the project date-format helper for timestamps. No new shadcn primitives
expected (native `<details>` for expansion; segmented filters via existing
`buttonVariants`/`ToggleGroup` or simple `Link`s).

## Error handling

- Reads are best-effort-irrelevant: a DB error on the page surfaces the standard
  route error boundary (no special handling — unlike `record()`, a failed *read* should
  not be swallowed silently).
- Empty state: friendly "No activity yet" on both the card and the page.
- `before` cursor is untrusted input — treated as an opaque string compared with `<`;
  a garbage value simply yields no rows (no injection surface via parameterized query),
  but the page validates it as a non-empty string and ignores it otherwise.
- Filter params are validated against their enums; unknown values fall back to `all`.

## Testing

- **`lib/audit/describe.test.ts`** — table-driven: all 10 actions × {success, failure}
  produce a non-empty, sensible label and correct icon; the quota/write-failed
  `journal.import` detail variants render their specific copy.
- **`lib/audit/repository.test.ts`** (extend) — cursor pagination returns the next page
  and stops cleanly; `actions[]` filter and `result` filter narrow correctly;
  ordering is `createdAt desc, id desc`.
- **`lib/audit/service.test.ts`** (extend) — `type` → `actions[]` translation for each
  group; `result: 'all'` normalizes to no filter; `limit + 1` fetch behavior.

## YAGNI / deferred

- Retention/pruning cron — deferred (separate PLAN bullet).
- Date-range filter on activity — not in v1; the three type buckets + result + cursor
  cover the "was this me?" use case.
- CSV export of the audit log — not requested.
- Admin/cross-user view — out of scope (strictly per-user, `requireUser`-scoped).
