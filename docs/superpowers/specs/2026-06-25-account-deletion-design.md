# Account Deletion — Design

**Date:** 2026-06-25
**Status:** Approved (brainstorming) — pending implementation plan
**Phase:** 7 (Multi-user hardening). Also delivers the Phase 7 "Backup / restore — download `.zip` of journal directory" item as a byproduct.

## Goal

Let a signed-in user permanently delete their own account from `/settings`: wipe
their journal data (local cache **and** Garage source-of-truth), all their
database rows, and the auth identity itself. The action is irreversible and is
gated behind an emailed verification code the user types back into the app.

## Why a verification code (not a magic link)

A code keeps the entire destructive flow on **one in-app surface** (backup →
red notice → enter code → confirm), which is the deliberate friction an
irreversible action wants. It also keeps everything **repo-local** — no change
to `@naeemba/next-starter` and no version bump. better-auth's native
`deleteUser` flow is link-based (emails a callback URL) and is **disabled** in
the current `createAuth` config anyway, with no pass-through to enable it.

The only security cost of a 6-digit code (low entropy, ~1M combinations) is
closed by: single active code per user, short expiry (10 min), and an attempt
cap (5). Both a link and a code ultimately prove the same property — the person
controls the account's email.

## User flow

On `/settings`, a red **Danger Zone** card at the bottom:

1. **"Delete account"** button → expands/opens the deletion panel.
2. **Step 1 — Backup (optional):** "Download a backup (.zip)" button hitting
   `GET /api/account/export`. Encouraged but not required.
3. **Step 2 — Acknowledge:** a hard red irreversible notice ("This permanently
   deletes your journals and your account. This cannot be undone.").
4. **Step 3 — Verify:** "Email me a verification code" button → server issues a
   6-digit code, emails it via Postal. UI reveals a code input.
5. **Step 4 — Confirm:** user types the code and clicks **"Permanently delete my
   account"**. On success: `authClient.signOut()` (clears the now-orphaned
   session cookie) and redirect to `/account/deleted` (a public goodbye page).

Wrong/expired code → inline error with remaining attempts; after 5 failed
attempts the code is invalidated and the user must request a new one.

## Architecture

Self-contained in `ledger-cli-ui`. Follows the existing
**Repository + Service + one-action-per-file** convention.

### New DB table — `accountDeletionChallenge`

`db/schema/accountDeletionChallenge.ts`

| Column      | Type        | Notes                                              |
|-------------|-------------|----------------------------------------------------|
| `userId`    | text PK     | FK → `user.id`, `onDelete: 'cascade'`. One active challenge per user (PK = userId, upsert on re-request). |
| `codeHash`  | text        | SHA-256 of the 6-digit code (never store plaintext).|
| `expiresAt` | timestamp   | now + 10 min.                                      |
| `attempts`  | integer     | default 0; increment on each failed verify.        |
| `createdAt` | timestamp   | defaultNow.                                        |

Registered in `db/schema/index.ts`. Requires a drizzle migration.

### Challenge layer — `lib/account-deletion/`

- `repository.ts` — `AccountDeletionChallengeRepository`: `upsert`, `get`,
  `incrementAttempts`, `delete`.
- `service.ts` — `AccountDeletionService`:
  - `issueCode(userId, email)`: generate 6-digit code (`crypto.randomInt`),
    hash, upsert challenge, send email via the Postal transport. Returns nothing
    sensitive. Rate-limit re-issue (≥30s between sends) to avoid mail spam.
  - `verifyAndDelete(userId, code)`: load challenge → check not expired →
    constant-time compare hash → on mismatch increment attempts (invalidate at
    5) and return a discriminated result (`expired` / `invalid` /
    `too-many-attempts`); on match, run **deletion orchestration**, then delete
    the challenge (moot — cascades with the user) and return `ok`.
- `schema.ts` — Zod for the 6-digit code input.

### Deletion orchestration (order is load-bearing)

Inside `verifyAndDelete`, after the code matches:

1. `clearRemote(userId)` — wipe Garage objects under `journals/<userId>/`
   (source of truth first, so a mid-failure can't leave canonical data while
   local is gone).
2. `rm -rf {DATA_DIR}/journals/<userId>` — wipe local cache
   (`getJournalDir(userId)`).
3. `db.delete(user).where(eq(user.id, userId))` — cascades `session`,
   `account`, `passkey`, `userSetting`, `savedView`, `template`, and
   `accountDeletionChallenge`.

Steps run sequentially; if a step throws, surface a generic error and abort
(partial-delete is acceptable for a destructive op — re-running completes it,
and orphaned Garage/local data without a user row is inert). Log the real error
server-side only.

### Backup export — `GET /api/account/export`

`app/api/account/export/route.ts`. Reuses existing helpers:
`pullLocked(userId)` (sync canonical → local) → `listLocalRelPaths(getJournalDir(userId))`
→ read each file → `adm-zip` `.addFile(relPath, buffer)` → return
`zip.toBuffer()` with `Content-Disposition: attachment;
filename=journals-<userId>-backup.zip`. Guarded by `requireUser`.

### Server actions — `features/settings/actions/`

One file each, matching the existing convention:
- `requestAccountDeletion.ts` → `AccountDeletionService.issueCode`.
- `deleteAccount.ts` → `AccountDeletionService.verifyAndDelete`; returns the
  discriminated result so the client can show inline errors or proceed to
  sign-out + redirect.

Both call `requireUser` and operate only on the caller's own `userId` (no
user-supplied id ever reaches the service).

### UI — `features/settings/DangerZone.tsx`

Client component wired into `Settings.tsx` as a final `Card` with destructive
styling. Manages the local step state (idle → code-sent → verifying), renders
the backup button, the red `Alert variant="destructive"` notice, the code
`Input`, and the confirm `Button variant="destructive"`. Uses `sonner` toasts
for transient feedback, consistent with the rest of the app. On `ok`, calls
`authClient.signOut()` and `router.push('/account/deleted')`.

### Goodbye page — `app/account/deleted/page.tsx`

Public (no `requireUser`) confirmation page: "Your account and all data have
been permanently deleted." Link back to the landing page. Must render in the
`AppShell` auth/no-sidebar layout branch (like `/login`), since the user is
signed out.

## Email

Reuses the existing Postal transport (`lib/email-transport.ts`). A small
templated message: subject "Confirm account deletion", body containing the
6-digit code, its 10-minute expiry, and a "if you didn't request this, ignore
this email" line. No link.

## Security & edge cases

- Code stored hashed (SHA-256); compared in constant time.
- Single active challenge per user (PK = userId); re-request overwrites and
  resets `attempts`. Re-send throttled (≥30s).
- 10-min expiry; 5-attempt cap then invalidate.
- All actions are `requireUser`-gated and self-scoped — no IDOR surface.
- `ledger` is never invoked; no shell-out in this feature.
- `verification` rows (better-auth, identifier-keyed) are left to self-expire;
  they hold no journal data.

## Testing

- `repository.test.ts` — upsert/get/increment/delete round-trip.
- `service.test.ts` — issue (hashing, throttle), verify paths: happy, wrong
  code increments, expiry, attempt-cap invalidation; deletion orchestration
  with a `MemoryObjectStore` and a temp journal dir asserting Garage + local +
  DB rows all gone.
- `export.test.ts` (or route test) — zip contains every journal file with
  correct relative paths.
- `schema.test.ts` — Zod rejects non-6-digit / non-numeric input.

## Out of scope

- Admin-initiated deletion of other users.
- Soft-delete / grace-period / recovery window (this is a hard delete).
- Restore-from-backup upload (import already exists; full restore UX is a
  separate Phase 7 item).

## Files touched

New:
- `db/schema/accountDeletionChallenge.ts` (+ `db/schema/index.ts` export, migration)
- `lib/account-deletion/{repository,service,schema}.ts` (+ tests)
- `app/api/account/export/route.ts`
- `features/settings/actions/{requestAccountDeletion,deleteAccount}.ts` (+ `index.ts` export)
- `features/settings/DangerZone.tsx`
- `app/account/deleted/page.tsx`

Modified:
- `features/settings/Settings.tsx` (mount Danger Zone card)
- `PLAN.md` (check off backup item; note account-deletion under Phase 7)
