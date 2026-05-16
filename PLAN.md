# Ledger CLI UI — Project Plan

Living document. Check items off as they ship; reorder, split, or add as the project evolves. The granular bug/cleanup list in `TODO.md` is still valid — this file is the higher-level phase tracker. When a `TODO.md` item is addressed inside a phase here, check it in both places (or migrate it).

Legend: `[x]` done · `[ ]` not started · `[~]` in progress · `[!]` blocked

---

## Phase 0 — Foundation _(complete)_

Single-user CLI wrapper that renders Ledger reports through Next.js pages.

- [x] Next.js 16 app router, Tailwind v4, server components shelling out to `ledger`
- [x] `runLedger` wrapper with `execFile` (no shell), 60s `unstable_cache`, `--sort -date` default
- [x] Read-only report pages: Dashboard, Accounts, Balance, Net Worth, Periodic Balance, Debts, Cash Flow (`/monthly`), Payees, Reconcile, per-account monthly register
- [x] Currency conversion via `-X ${DEFAULT_CURRENCY}` and optional `--price-db`
- [x] `formatAmount` / `formatDate` helpers, `DEFAULT_CURRENCY` / `DATE_LOCALE` env vars
- [x] Help (`?`) tooltips on every page header
- [x] Account-tree search on `/accounts`
- [x] Validation for URL-supplied account names before exec

---

## Phase 1 — Multi-user & Import _(complete)_

Per-user journals, auth, and a way to get a journal into the app.

- [x] Better Auth + passkey-only login / signup (`/login`, `/signup`)
- [x] `user` / `session` / `account` / `passkey` / `verification` schema in SQLite (drizzle)
- [x] `requireUser` / `getOptionalUser` guards
- [x] Per-user journal directory at `${DATA_DIR}/journals/<userId>/`
- [x] `user.journalMain` column so multi-file journals work (main + `include`s)
- [x] `/import` page + `POST /api/upload` (single file or `.zip`, 25 MB cap, path-traversal guarded)
- [x] `replaceJournalFromSingleFile` / `replaceJournalFromZip` with `emptyDir` semantics
- [x] `ensureJournal` stub-file creation so reports render for new users
- [x] `PORT` env var support (defaults to 3000, currently 3002 in `.env`)

---

## Phase 2 — Authoring _(current — unblocks daily use)_

**Why:** today the only mutation path is wholesale import; once a journal is loaded the app is read-only. This phase makes the UI usable as a daily-driver tool.

### 2.1 Add transaction _(MVP — ship first)_

- [x] Server action `addTransaction(userId, draft)` that appends a properly-formatted block to `mainPath`
  - [x] Atomic write: single `fs.appendFile` (atomic at syscall level for sub-PIPE_BUF writes); leading `\n\n` guards against missing trailing newline
  - [x] Invalidate the `ledger-cli-exec` cache via per-user `updateTag('ledger:<userId>')` — see 2.4
- [x] `/transactions/new` page with form fields: date, payee, optional `*`/`!` cleared flag, optional note, dynamic posting rows (account, amount, currency)
  - [x] Client-side balance check (sum of postings must equal zero, or exactly one posting blank for auto-balance)
  - [x] Account autocomplete sourced from `ledger accounts`
  - [x] Payee autocomplete sourced from `ledger payees`
- [x] Server-side validation before write (Zod): balanced postings (per currency), account/payee/note character rules, amount regex
- [x] "Add transaction" entry point in Header nav (and a quick-add button on Dashboard)
- [x] Redirect to Dashboard after success; surface friendly error inline on failure

### 2.2 Edit / delete transaction

- [ ] Decide the addressing scheme: line range in `mainPath`, or generated transaction ID via a custom comment tag (e.g. `; :uid: <ulid>`). The tag approach survives reformatting; line ranges break the moment anyone edits the file outside the app.
- [ ] Backfill UID tags on import (one-time migration over the journal)
- [ ] List view at `/transactions` with pagination (use `ledger reg` JSON-ish output — or parse our own)
- [ ] Edit page reusing the add-transaction form
- [ ] Delete with confirm modal
- [ ] All mutations go through a single `writeJournal` helper that locks, parses, rewrites, and bumps cache

### 2.3 Recurring / templated transactions

- [ ] "Save as template" on any transaction
- [ ] Templates stored in SQLite (`template` table) — not in the journal file
- [ ] "New from template" prefills the add-transaction form
- [ ] Unblocks the paused Budget item (`TODO.md` Tier 2) once periodic transactions are easy

### 2.4 Cache & freshness

- [ ] Replace `unstable_cache` key with one that includes the user's journal mtime so writes invalidate immediately
- [ ] Or: drop caching entirely for mutating users and keep it for read-heavy sessions (measure first)
- [ ] Confirm `revalidatePath('/', 'layout')` after every mutation is sufficient

---

## Phase 3 — Quality, cleanup, tests

Pay down what's already known to be wrong before adding more surface area.

### 3.1 From `TODO.md`

- [ ] Delete orphan `FileUpload` component (no UI references it) — `components/FileUpload/FileUpload.tsx` already shows as deleted in `git status`, just commit
- [ ] Fix amount parsing fragility in `/registers/monthly/[account]` — `each.split('|')[1].split(' ')[1]` assumes `<unit> <amount>` shape, breaks for unit-less amounts
- [ ] ESLint 10 upgrade — revisit when `eslint-plugin-react` lands a compatible release

### 3.2 Tests

Bring in Vitest and cover the pure functions first (no `ledger` shell-out needed):

- [ ] `Dashboard.utils#getHighestExpense`
- [ ] `Accounts.utils#buildTree`
- [ ] `MonthlyComparison.utils#getCashFlow`
- [ ] `Reconcile#parseRows`
- [ ] `validateAccount`
- [ ] `formatAmount` / `formatDate`
- [ ] Journal helpers: `detectMain`, `replaceJournalFromZip` path-traversal guard
- [ ] After 2.1 lands: `addTransaction` round-trip (write → re-read via `ledger reg`)

### 3.3 Errors & UX rough edges

- [ ] Server-side error boundary that doesn't leak `ledger` stderr to the client
- [ ] "Journal is empty" empty-state on Dashboard pointing to `/import` or `/transactions/new`
- [ ] Loading skeletons (currently most pages just block on `ledger`)

---

## Phase 4 — Power features

The Tier-2/3 items from `TODO.md` that need more than a weekend.

- [ ] **Budget actual-vs-target** — `ledger budget`; depends on 2.3 (templates / periodic transactions)
- [ ] **CSV export** for any report (`ledger csv`)
- [ ] **Commodity / portfolio view** (`bal Assets:Investments -X CCY`)
- [ ] **Forecasting** (`ledger --forecast`)
- [ ] **Saved views** — pin a filtered Payees/Register query and reach it from the Dashboard

---

## Phase 5 — Multi-user hardening

Only relevant if this gets deployed to anyone other than you.

- [ ] **Encrypted user journals at rest** — the `Phase 3+` note in `.env.example`. Likely envelope encryption: per-user key wrapped by a server master key sourced from env
- [ ] Rate limit `/api/upload` and any future write endpoint
- [ ] Audit log of journal mutations (who, when, how many bytes)
- [ ] Quota on per-user journal size
- [ ] Backup / restore endpoint (download `.zip` of the journal directory)
- [ ] Account deletion (wipe journals + DB rows)
- [ ] CSP / security headers pass
- [ ] Structured logging + an error-tracking destination

---

## Phase 6 — Stretch / maybe-never

- [ ] Mobile-first re-layout (current nav already wraps, but the tables don't)
- [ ] Offline-first / PWA shell for read-only reports
- [ ] Direct bank-import adapters (CSV → ledger transaction) — Plaid is overkill, but a per-bank CSV mapper isn't
- [ ] Tag analytics (spend by `:vacation:` etc.)
- [ ] Dark/light mode toggle (currently theme-aware via CSS vars, no toggle)

---

## How to use this file

- When you finish something, change `[ ]` to `[x]` in the same commit
- New work goes under the right phase, not the bottom of the file
- If a phase grows past ~10 items, split it into sub-sections like Phase 2 above
- Don't delete completed phases — they're the project's changelog
