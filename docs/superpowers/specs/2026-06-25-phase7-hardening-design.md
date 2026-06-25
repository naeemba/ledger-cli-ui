# Phase 7 Hardening — Rate Limiting, Security Headers, Per-User Quota — Design

**Date:** 2026-06-25
**Status:** Approved (brainstorming) — pending implementation plan
**Phase:** 7 (Multi-user hardening / backups)

## Goal

Now that the app is genuinely multi-user (open passwordless registration,
self-service account deletion), close three concrete exposure gaps before
adding more surface area:

1. **Rate limiting** — nothing throttles authenticated request volume today.
   An authed user can hammer `/api/upload` (a 25 MB import + `ledger` parse each
   time) or spam any write action.
2. **Security headers / CSP** — `next.config.js` is `module.exports = {}`. No
   CSP, HSTS, framing protection, MIME-sniffing protection, or referrer policy.
3. **Per-user quota** — only a single-upload 25 MB cap exists. A user can grow
   their journal directory unbounded via repeated imports or incremental adds.

What is **already covered** and out of scope:

- **Auth endpoints** (`/api/auth/*`) — better-auth (the `@naeemba/next-starter`
  dependency) ships built-in rate limiting on login/signup.
- **Account-deletion email code** — `lib/account-deletion/service.ts` already has
  a Postgres-backed 30s resend throttle + 5-attempt cap + 10-min expiry. This
  durable throttle on the *code itself* stays as-is; we add an action-level
  request-rate guard on top (see below).

## Decisions (taken 2026-06-25 during brainstorming)

- **Rate-limit state lives in-memory, behind a pluggable store interface.** The
  app deploys as a single container (node-cron runs in-process via
  `instrumentation.ts`, so single-instance is already assumed). In-memory token
  counters need zero new dependencies and no per-request DB write. The one flow
  where durability genuinely matters — account deletion — already has a DB-backed
  throttle. The store sits behind a one-method interface so a Postgres/Redis
  backend is a contained swap if the app ever scales horizontally.
- **Rate limiter covers `/api/upload` + all mutating server actions.** Broadest
  coverage with a single helper, rather than only the destructive/expensive
  surfaces.
- **CSP is strict and nonce-based, implemented in `proxy.ts`** (Next.js 16
  renamed the `middleware` convention to `proxy`). A pragmatic
  `script-src 'unsafe-inline'` policy would ship a header that *looks* like a CSP
  without delivering XSS protection. This app is the ideal case for a strict CSP:
  **zero runtime third-party scripts** (everything bundled; `next/font/google`
  self-hosts fonts at build time → served from `/_next/static`). The usual cost
  of nonce CSP — pages become per-request dynamic — is already paid, since every
  page shells out to `ledger` per-user and reads cookies. The one honest
  concession is `style-src 'self' 'unsafe-inline'`, because Recharts/Base-UI write
  inline `style=` attributes that nonces cannot cover; injected CSS is far
  lower-risk than injected script.
- **Quota is a total-directory-size cap**, configurable via env, enforced in
  `JournalService` so every write path is covered (not just `/api/upload`).
- **Ships as one PR** (`feat/phase7-hardening`) with three logically separate
  commits — shared spec and a little shared plumbing make one review pass the
  lower-overhead choice for a solo project.

---

## 1. Rate limiting — `lib/rate-limit/`

Self-contained module, no external dependencies.

### `store.ts`

```ts
export interface RateLimitPolicy { name: string; max: number; windowMs: number }
export interface RateLimitResult { allowed: boolean; remaining: number; resetAt: number }
export interface RateLimitStore {
  hit(key: string, policy: RateLimitPolicy): RateLimitResult
}
```

`MemoryStore implements RateLimitStore` — a **fixed-window counter** backed by a
`Map<string, { count: number; resetAt: number }>`:

- On `hit`, if the entry is missing or `now >= resetAt`, start a fresh window
  (`count = 1`, `resetAt = now + windowMs`) and allow.
- Otherwise increment; `allowed = count <= max`.
- **Lazy expiry** on access plus an occasional sweep (every Nth call, or when the
  map exceeds a size threshold) to drop stale entries so the map cannot grow
  unbounded.
- Clock is injectable (`now: () => number`, default `Date.now`) for deterministic
  tests.

Fixed-window is chosen over a sliding log for simplicity; the small burst-at-
window-boundary imprecision is irrelevant for abuse-prevention thresholds.

### `limits.ts`

Named policies so call sites read intent, not magic numbers:

| Policy        | max | windowMs | Applies to                                            |
|---------------|-----|----------|-------------------------------------------------------|
| `UPLOAD`      | 10  | 60_000   | `POST /api/upload`                                    |
| `WRITE`       | 60  | 60_000   | transaction add/edit/delete, template & saved-view writes, settings writes |
| `DESTRUCTIVE` | 5   | 60_000   | account-deletion request & verify actions             |

(Exact numbers are easy to tune in the plan; these are sane starting points for a
single human user where any higher rate implies a script.)

### `index.ts`

- Module-level singleton `MemoryStore`.
- `rateLimit(policy: RateLimitPolicy, userId: string): RateLimitResult` — derives
  the key as `${policy.name}:${userId}`. Every surface is authenticated, so
  per-user identity is the natural key (no IP-spoofing concerns, no anonymous
  traffic).

### Application

- **`/api/upload`** — after `requireUser()`, call `rateLimit(UPLOAD, user.id)`.
  On `!allowed`, return **HTTP 429** with `Retry-After: <seconds-until-resetAt>`
  and a JSON error body.
- **Mutating server actions** — each gains a one-line guard near the top, after
  the user is resolved:

  ```ts
  const rl = rateLimit(WRITE, user.id)
  if (!rl.allowed) return { ok: false, reason: 'rate-limited' as const }
  ```

  The `rate-limited` reason is added to each action's existing result union and
  surfaced inline by the form (consistent with how `stale` / `invalid` /
  `parse-failed` already surface). Actions that currently redirect on success
  instead return the error variant so the form can show a "slow down" message.

---

## 2. Security headers + CSP — `proxy.ts` + `lib/security/headers.ts`

### `lib/security/headers.ts`

`buildSecurityHeaders(nonce: string): Record<string, string>` — single source of
truth for every security header. Pure function, unit-testable.

**Content-Security-Policy** (nonce interpolated):

```
default-src 'self';
script-src 'self' 'nonce-<nonce>' 'strict-dynamic';
style-src 'self' 'unsafe-inline';
img-src 'self' data:;
font-src 'self';
connect-src 'self';
frame-ancestors 'none';
base-uri 'self';
form-action 'self';
object-src 'none';
```

Plus the static headers:

| Header                      | Value                                                    |
|-----------------------------|----------------------------------------------------------|
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains` (HTTPS via Coolify/Caddy) |
| `X-Content-Type-Options`    | `nosniff`                                                 |
| `X-Frame-Options`           | `DENY` (belt-and-suspenders with `frame-ancestors 'none'`) |
| `Referrer-Policy`           | `strict-origin-when-cross-origin`                        |
| `Permissions-Policy`        | `camera=(), microphone=(), geolocation=(), interest-cohort=()` |

### `proxy.ts`

- Generates a per-request nonce via Web Crypto
  (`crypto.getRandomValues` → base64), available in the Edge runtime.
- Sets the nonce on a forwarded **`x-nonce` request header** so Next.js threads it
  into its own bootstrap `<script>` tags automatically, and emits
  `buildSecurityHeaders(nonce)` on the response.
- **Matcher** excludes static assets that don't need a per-request nonce:
  `['/((?!_next/static|_next/image|favicon.ico).*)']`.
- No security headers are duplicated in `next.config.js` — `proxy.ts` is the only
  place they are defined.

### Verification

Manual click-through of the running app before merge: Dashboard charts
(Recharts), command palette / dialogs (Base-UI), and toast (sonner) must render
with no CSP violations in the browser console. (Single-user app → no report-only
rollout; direct manual verification is sufficient.)

---

## 3. Per-user quota — `lib/journal/quota.ts`

### Config

`JOURNAL_QUOTA_MB` declared in `lib/env/index.ts`:

```ts
JOURNAL_QUOTA_MB: z.coerce.number().positive().default(100),
```

### `getJournalDirSize(userId): Promise<number>`

Recursively sums the byte size of all files under the user's journal directory
(`getJournalDir(userId)`), reusing the existing local-path listing helper from the
Garage sync layer (`listLocalRelPaths` or equivalent) where practical, falling
back to a direct recursive `fs.stat` walk.

### Enforcement in `JournalService`

A new `quota-exceeded` reason is added to the relevant result unions; every write
path is guarded centrally so no caller can bypass it:

- **`replaceFromSingleFile` / `replaceFromZip`** — these wipe-and-replace the dir,
  so the new total equals the incoming bytes. Reject **before** `resetLocalJournal`
  if incoming bytes exceed the quota.
- **`addTransaction`** — check `getJournalDirSize(userId)` + the serialized block
  size against the quota. In practice always passes (transactions are tiny), but
  it closes the unbounded-incremental-growth path.
- Edits/deletes don't grow the journal meaningfully and are not gated (delete can
  only shrink it).

### Surfacing

- **`/api/upload`** maps `quota-exceeded` → **HTTP 413** with a clear message:
  "Importing this would exceed your NN MB journal limit."
- **`addTransaction`** surfaces `quota-exceeded` inline on the transaction form,
  like the existing `parse-failed` path.

---

## 4. Testing

| Area          | Tests                                                                        |
|---------------|------------------------------------------------------------------------------|
| Rate limiting | `MemoryStore`: allow under limit; block at limit+1; reset after window elapses (injected clock); independent keys don't interfere; sweep drops stale entries. |
| Headers       | `buildSecurityHeaders`: nonce appears in `script-src`; all expected directives & static headers present; nonce varies per call. |
| Quota         | `getJournalDirSize` against a temp dir with nested files; `JournalService` returns `quota-exceeded` when incoming/total exceeds limit and writes nothing. |

Manual: CSP click-through verification (Section 2) before merge.

## Out of scope (future Phase 7 items)

- Audit log of journal mutations.
- Structured logging + error-tracking destination.
- IP-based or anonymous rate limiting (all current surfaces are authenticated).
- Distributed/durable rate-limit store (the interface leaves the door open).

## Files touched

**New:** `lib/rate-limit/{store,limits,index}.ts` (+ tests),
`lib/security/headers.ts` (+ test), `proxy.ts`,
`lib/journal/quota.ts` (+ test).

**Modified:** `app/api/upload/route.ts` (rate limit + quota mapping),
mutating server actions under `features/*/actions/` (rate-limit guard),
`lib/journal/service.ts` (quota enforcement + result unions),
`lib/env/index.ts` (`JOURNAL_QUOTA_MB`),
`PLAN.md` (check off the three Phase 7 items).
