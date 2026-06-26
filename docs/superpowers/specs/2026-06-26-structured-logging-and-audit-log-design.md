# Phase 7 — Structured Logging + Audit Log

Status: **approved (2026-06-26)** — ready for an implementation plan.

Closes the final two Phase 7 items in `PLAN.md`:

- [ ] Audit log of journal mutations (who, when, how many bytes)
- [ ] Structured logging + an error-tracking destination

Both ship in **one combined spec / one PR**. Logging is built first within the
PR because it is the cross-cutting foundation the audit log emits through.

---

## Context

- **DB**: drizzle + Postgres (the SQLite→Postgres migration already landed on
  `main`; `DATABASE_URL` is a `postgres://` URL). One schema file per table under
  `db/schema/`, re-exported from `db/schema/index.ts`. Convention is
  Repository (CRUD) + Service (business logic) + Zod schema, one server-action
  file per mutation. Existing challenge tables (`accountDeletionChallenge`,
  `encryptionResetChallenge`) and `userSetting` are the models to follow.
- **FK pattern**: `text('userId').references(() => user.id, { onDelete: 'cascade' })`,
  importing `user` from `@naeemba/next-starter/schema`.
- **Logging today**: 24 raw `console.*` calls across ~20 node-runtime files; no
  logger library. `proxy.ts` is the only edge-runtime file and has no `console.*`.
- **Journal mutation points**: `JournalService.{addTransaction, editTransaction,
  deleteTransaction, replaceFromSingleFile, replaceFromZip, enableEncryption}` —
  all run under a per-user lock. The `replaceFrom*` (import) path is driven by the
  `/api/upload` route; the rest by `features/*/actions/*`.
- **Journal size**: `lib/journal/quota.ts` exports
  `getJournalDirSize(userId): Promise<number>` — reused for byte deltas.
- **Account deletion**: `purgeUserData` runs `clearRemote → removeLocal →
  db.delete(user)`, and the user-row delete cascades every referencing row
  (session, account, passkey, userSetting, …). Anything FK'd to `user` with
  `onDelete: cascade` is purged with the account.
- **Zero-knowledge constraint**: journal plaintext exists only in the ephemeral
  local working dir during an active session. Logs and audit records must never
  contain journal content, amounts, payee/account names, passphrases, recovery
  codes, DEKs, or wraps.

---

## Part A — Structured logging

### `lib/log/` module

A single pino instance, the one logging entry point for all node-runtime code.

- **Level** from `LOG_LEVEL` env (default `info`; `debug` in development).
- **Transport**: pretty-printed via `pino-pretty` in development; plain JSON to
  stdout in production (Coolify/Docker captures stdout). No file transport.
- **Redaction (mandatory)**: pino `redact` paths strip known sensitive keys
  wherever they appear in a logged object:
  `passphrase`, `recoveryCode`, `dek`, `wrap`, `password`, `token`,
  `authorization`, `cookie`, `secret`, and nested `*.secret` / `*.token`.
  Redaction censors to `"[redacted]"`.
- **Hard rule (documented in the module header)**: never pass journal content,
  amounts, or payee/account names to the logger — only metadata (counts, sizes,
  ids, action names, result). Redaction is a backstop, not a license to log
  freely.
- **Child loggers**: `log.child({ mod: 'journal' })` so each subsystem tags its
  lines with a `mod` field. Exported helper or convention documented in the
  module.

### Error-tracking destination — GlitchTip via `@sentry/nextjs`

GlitchTip is Sentry-API-compatible, so the official `@sentry/nextjs` SDK is the
client. It runs on the existing self-hosted Coolify host (new-raxel) alongside
Postal/Garage; no error data leaves your infra.

- **Init**:
  - Node/server runtime: in the existing `instrumentation.ts` `register()` (the
    `NEXT_RUNTIME === 'nodejs'` guard is already there), plus the Next 16
    `onRequestError` hook exported from `instrumentation.ts`.
  - Client runtime: `instrumentation-client.ts`.
  - (Edge runtime init only if `@sentry/nextjs` requires it for the build to be
    coherent; `proxy.ts` itself does no error reporting.)
- **DSN** from `SENTRY_DSN` env, pointed at the GlitchTip project. **When
  `SENTRY_DSN` is unset, Sentry is fully disabled** — local dev and the test
  suite ship no events and require no network.
- `app/error.tsx` and `app/global-error.tsx` capture the exception to GlitchTip
  (via `Sentry.captureException`) in addition to / instead of the bare
  `console.error`. They keep rendering the existing generic message + retry
  button; no `ledger` stderr or other internals reach the client (unchanged
  behaviour).
- **CSP**: confirm the strict nonce-based CSP (`lib/security/headers.ts`) permits
  the GlitchTip ingest origin for the browser SDK (`connect-src`). Add the
  GlitchTip origin if required. This is a checklist item, not a guess — verify
  against the actual SDK network calls.

### New env vars

All optional with safe defaults, validated in the zod schema
(`lib/env/`), split correctly across client/server schemas:

- `LOG_LEVEL` — enum of pino levels, default `info`.
- `SENTRY_DSN` — optional string; absent ⇒ Sentry disabled.
- `SENTRY_ENVIRONMENT` — optional string (e.g. `production` / `development`),
  default derived from `NODE_ENV`.

`NEXT_PUBLIC_SENTRY_DSN` (client) if the browser SDK needs the DSN exposed —
decided during implementation based on the SDK's requirements; if used, it is
the same value and equally optional.

### Migrate the 24 `console.*` calls

Replace each `console.{log,error,warn,info}` in node-runtime files with a logger
call carrying structured context (object fields, not interpolated strings).
`proxy.ts` (edge) is untouched. Files touched (from the survey, non-exhaustive):
`lib/settings/getBaseCurrency.ts`, `lib/prices/{scheduler,service}.ts`,
`lib/storage/download.ts`, `app/error.tsx`, `app/global-error.tsx`, the 11
`app/api/**/export/route.ts` + `app/api/upload/route.ts` routes,
`features/crypto/actions/finalizeEncryption.ts`, `features/accounts/Accounts.tsx`.

---

## Part B — Audit log

### `auditLog` table — `db/schema/auditLog.ts`

Follows the one-file-per-table + cascade-FK pattern; re-exported from
`db/schema/index.ts`.

| column | type | notes |
|---|---|---|
| `id` | `text` PK (uuid) | generated app-side |
| `userId` | `text` → `user.id`, `onDelete: cascade` | |
| `action` | `text` (Zod-validated enum) | see action set below |
| `result` | `text` | `success` / `failure` |
| `targetUid` | `text` nullable | transaction ULID where relevant |
| `bytesBefore` | `integer` nullable | journal-dir size before mutation |
| `bytesAfter` | `integer` nullable | journal-dir size after mutation |
| `detail` | `jsonb` nullable | small metadata only (e.g. `{ fileCount }` for import, `{ reason }` for failure) — **never journal content** |
| `ip` | `text` nullable | best-effort from request headers |
| `userAgent` | `text` nullable | best-effort from request headers |
| `createdAt` | `timestamp` default `now()` | |

A new drizzle migration is generated (next sequential number after the current
latest, i.e. `0006`).

**Action set** (validated by a Zod enum, shared with `record()`):

- `tx.add`, `tx.edit`, `tx.delete`
- `journal.import`
- `crypto.enable`, `crypto.unlock`, `crypto.lock`,
  `crypto.passphrase-change`, `crypto.recovery-rotate`, `crypto.reset`

`account.delete` is deliberately **NOT** an audit-table action — the row would
cascade-delete with the user. It is emitted to the structured logger only, which
persists in GlitchTip/stdout independently of the DB.

### `lib/audit/`

- `AuditRepository` — `insert(record)`, `listByUser(userId, opts?)` (the list
  method exists for future use / DB queries even though no UI ships now).
- `AuditService.record(event)` — business logic: validate the event shape (Zod),
  fill `createdAt`/`id`, insert.
  - **Best-effort, never throws**: `record()` wraps its insert in try/catch,
    forwards any failure to the logger (`log.child({ mod: 'audit' }).error`), and
    returns normally. An audit-write failure must never fail or roll back the
    user's actual action.
- Zod schema for the event input (action enum, optional fields).

### Instrumentation — at the action / route boundary

Instrumentation lives in the server-action / route layer, **not** inside
`JournalService`, keeping the journal core free of an audit dependency.

- **Journal mutations** (`tx.add` / `tx.edit` / `tx.delete`): the relevant
  `features/transactions/actions/*` files measure `getJournalDirSize` before and
  after the `JournalService` call and `record()` the event with byte deltas and
  `targetUid`. Both success and failure are recorded (failure carries a `reason`
  in `detail`, no content).
- **Import** (`journal.import`): the `/api/upload` route measures before/after and
  records, with `{ fileCount }` (or zip vs single) in `detail`.
- **Security events** (`crypto.*`): the existing crypto actions/routes
  (`enable`, `unlock`, `lock`, change-passphrase, rotate-recovery, reset) call
  `record()`. These carry no byte deltas (or only where naturally available).
- **IP / user-agent**: read best-effort from `headers()` (server actions) or the
  request (routes); both nullable when unavailable (e.g. behind certain proxy
  configs).

---

## Testing

- **Logger**: redaction test (each sensitive key censored to `[redacted]`,
  including nested); `SENTRY_DSN` unset ⇒ Sentry disabled / no init side effects.
- **Audit repository**: insert + `listByUser` round-trip against the test DB.
- **`record()` best-effort**: when the repository insert rejects, `record()`
  resolves without throwing and logs the failure.
- **Integration**: a transaction add → edit → delete sequence writes the expected
  `auditLog` rows with correct `action`, `result`, `targetUid`, and monotonic
  byte deltas.
- Full suite stays green; type-check + lint clean.

---

## Out of scope (this PR)

- **Audit-viewer UI** — store-only by decision; `listByUser` exists for a future
  per-user "Activity" card on `/settings`.
- **Retention / pruning** — the log is append-only for now. A pruning cron (e.g.
  drop entries older than N months) is a future item; note it in `PLAN.md`.
- **`account.delete` in the audit table** — intentionally logger-only (see above).

---

## PLAN.md updates on completion

- Check `[x]` **Audit log of journal mutations** and **Structured logging +
  error-tracking destination** under Phase 7.
- (Housekeeping, optional in same PR) the already-merged Garage and
  encrypted-journals items at Phase 7 lines are still shown `[ ]`/`[~]`; correct
  to `[x]` while editing the file.
- Add a future bullet: audit-log retention/pruning cron + per-user Activity UI.
