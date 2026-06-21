# Migration: SQLite → Postgres + `@naeemba/next-starter`

**Date:** 2026-06-22
**Status:** Approved design — pending implementation plan
**Branch:** (to be created off current work)

## Goal

Replace the app's SQLite/better-sqlite3 data layer with Postgres, and adopt the
in-house `@naeemba/next-starter` package for authentication. Follow the
starter's documented conventions verbatim (README + `examples/basic`) rather
than hand-rolling equivalents.

This is the change that unblocks the Coolify build: the build currently fails
because `lib/db/index.ts` opens a SQLite file at import time and the data
directory does not exist in the build container. After this migration there is
no SQLite file at all, and the DB connection is lazy.

### In scope
- Database engine: SQLite → Postgres (Drizzle ORM, `postgres` driver).
- Authentication: replace the bespoke email+password + passkey Better Auth setup
  with the starter's magic-link (+ passkey + Google) auth.
- Repository/Service data-access rewrite from synchronous to async.
- Migration tooling and Coolify deploy ordering.

### Out of scope
- Ledger features and the `ledger` CLI integration. Financial data lives in
  ledger journal files on disk, **not** in the database, and is untouched.
- Any data transfer: this is a **fresh start** (see Decisions).

## Decisions (locked)

| Decision | Choice |
|---|---|
| Database engine | PostgreSQL via Drizzle + `postgres` driver |
| Auth model | Starter magic-link (passwordless). Email+password removed. |
| Extra sign-in methods | Passkey **and** Google OAuth, both enabled |
| Sign-in lock | `singleAdmin: "sharp.fk@gmail.com"` — only the owner can sign in |
| Existing data | Fresh start. No SQLite→Postgres data-transfer script. |
| Integration topology | Approach **B** (starter-recommended): two independent migration tracks |
| Conventions | Follow the starter repo's README + `examples/basic` exactly; scaffold via `npx @naeemba/next-starter init`, then adapt |

## Background: what exists today

- **9 SQLite tables** (`drizzle-orm/sqlite-core`):
  - Better Auth tables (5): `user`, `session`, `account`, `verification`, `passkey`.
  - App tables (4): `userSetting`, `template`, `commodityPrice`, `priceFetchRun`.
- The `user` table carries a custom `journalMain` column (relative path to the
  main ledger file).
- Auth today: `betterAuth({ emailAndPassword, passkey })` with a drizzle adapter
  (`provider: 'sqlite'`), `/login` + `/signup` flows.
- Repositories use better-sqlite3's **synchronous** API: ~18 `.get()` / `.run()`
  / `.all()` / `.returning().get()` call sites across `lib/journal/repository.ts`,
  `lib/settings/repository.ts`, `lib/prices/repository.ts`, `lib/prices/service.ts`,
  `lib/templates/repository.ts`.
- `requireUser` / `getOptionalUser` (in `lib/auth/require-user.ts`) are used in 13
  files (app pages + export API routes + `lib/settings/getBaseCurrency.ts`).
- `tsconfig` already uses `moduleResolution: "bundler"` (required by the
  ESM-only package — no change needed).

## Architecture

### Topology (Approach B — starter-recommended)

Two independent migration tracks against one Postgres database:

1. **Auth tables** — owned by the package. Applied with `npx next-starter migrate`,
   recorded in a `__next_starter_migrations` journal. The app does **not** define
   these in its own schema or drizzle config.
2. **App tables** — owned by the app. Defined in `db/schema` (pg-core), applied
   with `drizzle-kit migrate`, recorded in a `__drizzle_migrations` journal.

App tables FK to the auth `user` table by importing it from the package:
`import { user } from "@naeemba/next-starter/schema"`. The deploy ordering runs
the auth migration first so `user(id)` exists before app FKs resolve.

### A. Auth shims (from the starter, via `init` then adapted)

Scaffold with `npx @naeemba/next-starter init` (passkey is the default), then
reconcile with project specifics:

- **`lib/auth.ts`**
  ```ts
  import { createAuth } from "@naeemba/next-starter/auth"
  import { APP_NAME } from "@/lib/app"

  const googleConfigured =
    !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET

  export const auth = await createAuth({
    singleAdmin: "sharp.fk@gmail.com",
    passkey: { rpName: APP_NAME },
    ...(googleConfigured && { google: {} }),
  })
  ```
- **`lib/auth-client.ts`** — `createAuthClient({ passkey: passkeyClient })`,
  re-export `signIn` / `signOut` / `useSession`.
- **`lib/auth-server.ts`** — `export const { getSession, requireSession } = createServer(auth)`.
- **`lib/auth/require-user.ts`** — keep as a thin adapter so the 13 callers stay
  unchanged:
  ```ts
  import 'server-only'
  import { getSession, requireSession } from '@/lib/auth-server'
  export const requireUser = async () => (await requireSession()).user
  export const getOptionalUser = async () => (await getSession())?.user ?? null
  ```
  `requireSession` redirects unauthenticated users to `/sign-in`.
- **`app/api/auth/[...all]/route.ts`** — `createAuthRoute(auth)`.
- **Pages:**
  - `app/sign-in/page.tsx` — `SignInForm` / `SignInPage` with `google` (gated on
    `NEXT_PUBLIC_ENABLE_GOOGLE`) and `passkey`, styled via `classNames` to match
    the app's Tailwind/shadcn.
  - `app/sign-in/error/page.tsx` — `SignInErrorPage`.
  - `app/settings/passkeys/page.tsx` — `PasskeyManager` / `PasskeyManagerPage`.
- **`proxy.ts`** (project root) — `createProxy({ protect: [...], signInPath: '/sign-in' })`
  for pre-render redirect of unauthenticated traffic. The real auth gate remains
  `requireSession` in server components.
- **Delete:** `app/login/`, `app/signup/` (page + actions), `lib/auth/use-auth.ts`,
  `lib/auth/schemas.ts`, `lib/auth/client.ts`, and the old `lib/auth/index.ts`
  Better Auth config.

### B. App schema (Postgres, app-owned)

Rewrite the 4 app tables in `drizzle-orm/pg-core` under `db/schema`; **delete**
the 5 auth-table schema files (`user`, `session`, `account`, `verification`,
`passkey`) — the package owns them.

- `userSetting` — primary key `userId` FKs to package `user`. **Now also holds
  `journalMain`** (`text`, default `'main.ledger'`), folded in from the old
  `user` table. Keeps `baseCurrency`, `updatedAt` (`timestamp`).
- `template` — `userId` FK to package `user`; `draft` becomes `jsonb`; keep the
  `uniqueIndex(userId, name)`.
- `commodityPrice` — `id` becomes `serial`/identity; `price` stays floating point
  (`real`/`doublePrecision`); keep the per-day unique constraint
  `(symbol, quote, fetchedDate)`.
- `priceFetchRun` — `id` becomes `serial`; `status` enum (`success`/`partial`/`failed`).
- Type mapping: SQLite `integer({ mode: 'timestamp' })` → `timestamp`;
  `integer({ mode: 'boolean' })` → `boolean`; `text({ mode: 'json' })` → `jsonb`.

`journalMain` migration of behavior: code that currently reads/writes
`user.journalMain` (the journal repository) moves to `userSetting`. First sign-in
creates no `userSetting` row, so reads default to `'main.ledger'` and the row is
created lazily on first write (same upsert pattern as `baseCurrency`).

### C. DB connection

- `lib/db/connection.ts` + `lib/db/index.ts` → a Postgres Drizzle instance over
  `postgres(DATABASE_URL)`, exported as a **lazy singleton** (preserves the
  build-safe deferral — no connection opened at import time). Continues to export
  `db` and `DbInstance` so the Repository/Service DI pattern is unchanged.
- `lib/env`:
  - `DATABASE_URL` becomes **required** and must be a `postgres://…` URL.
  - Drop `DATA_DIR` and the SQLite path fallback.
  - Add `RESEND_API_KEY` (optional), `EMAIL_FROM`, `GOOGLE_CLIENT_ID`,
    `GOOGLE_CLIENT_SECRET` (optional), `NEXT_PUBLIC_ENABLE_GOOGLE` (optional).

### D. Repositories → async

Convert every synchronous better-sqlite3 call to an awaited Postgres call:

- `.get()` → `await …limit(1)` then `result[0] ?? null`
- `.all()` → `await …`
- `.run()` → `await …`
- `.returning().get()` → `await …returning()` then `result[0]`
- `.onConflictDoUpdate(...)` stays (Postgres supports it).

Methods are already declared `async` and callers already `await`, so the change
is internal to the 5 files. Update the test DB harness (`lib/test-utils/db.ts`)
and all `*.test.ts` that build a SQLite drizzle instance to a Postgres harness
(engine choice — pglite vs. a test container — deferred to the plan).

### E. Migrations & deploy ordering (README "Deploy ordering", verbatim)

`package.json` scripts:

```jsonc
{
  "prebuild": "next-starter migrate",
  "build": "next build",
  "prestart": "next-starter migrate && drizzle-kit migrate",
  "start": "next start",
  "db:migrate:auth": "next-starter migrate",
  "db:generate": "drizzle-kit generate",
  "db:migrate": "drizzle-kit migrate"
}
```

New `drizzle.config.ts`: `dialect: 'postgresql'`, `schema: './db/schema'`,
`out: './db/migrations'`, `dbCredentials.url: process.env.DATABASE_URL`.

Coolify:
- Add a Postgres service; set `DATABASE_URL` to its internal connection string.
- Set `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `EMAIL_FROM`, optionally
  `RESEND_API_KEY` (required for magic-link delivery in prod), and Google creds +
  `NEXT_PUBLIC_ENABLE_GOOGLE=1` if Google is used.
- No persistent volume needed (Postgres replaces the SQLite file).

### F. Dependencies

- **Add:** `@naeemba/next-starter` (`^0.8.0`), `postgres`, `@react-email/components`,
  `@react-email/render`, `resend`.
- **Keep:** `@better-auth/passkey`, `drizzle-orm`, `drizzle-kit`.
- **Remove:** `better-sqlite3`, `@types/better-sqlite3`, and the direct
  `better-auth` config usage now provided by the package (verify no remaining
  direct `better-auth` imports after the auth shims land).

### G. Testing & verification

- Update the Vitest DB harness and affected `*.test.ts` to Postgres.
- Green: `pnpm test`, `pnpm type-check`, `pnpm lint`.
- Clean `pnpm build` against a throwaway `DATABASE_URL` (reproduces the Coolify
  build container; confirms no DB access at build time beyond the migrate step).
- Manual smoke on Postgres: magic-link sign-in (dev logs the link to stdout when
  `RESEND_API_KEY` is unset), passkey register/login, Google sign-in (if
  configured), settings + template CRUD, price fetch run.

## Risks / to verify during planning

1. **FK-to-`user` with drizzle-kit.** Importing the package `user` into the app
   schema for `.references()` may make `drizzle-kit generate` try to emit a
   `CREATE TABLE user`. The package owns that table (created by
   `next-starter migrate`), so the generated app migration must only emit the FK
   constraint, not re-create `user`. **First implementation task:** generate an
   app migration against a DB that already has the auth tables and confirm the
   output. Reconcile (e.g. hand-edit the generated SQL or use a reference-only
   pattern) if drizzle-kit over-reaches.
2. **Magic-link in production requires Resend.** Without `RESEND_API_KEY` in prod,
   links only log to stdout (the package warns at boot) — sign-in is effectively
   broken for real users. Ensure Resend is configured on Coolify before relying
   on email sign-in; passkey/Google still work without it.
3. **Passkey `rpID`/origin** now derive from `BETTER_AUTH_URL` inside the package
   — confirm the production hostname is correct so existing/new passkeys validate.
4. **Peer/runtime requirements:** Node ≥ 20, Next ≥ 16 (project is on Next 16.2 ✓),
   ESM-only package with `moduleResolution: "bundler"` (✓).
5. **`init` CLI vs existing files.** `npx @naeemba/next-starter init` scaffolds
   shims at conventional paths; reconcile against the project's existing `lib/auth`
   structure rather than letting it overwrite blindly.
