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

## Phase 2.5 — UI library adoption (shadcn/ui)

**Why:** the project just adopted shadcn/ui (`base-nova` preset over `@base-ui/react`, neutral base color). The init landed `components.json`, `lib/utils.ts`, `components/ui/button.tsx`, and merged its CSS variables into `app/globals.css`. Right now the codebase has two parallel design systems: ~30 custom buttons, custom `Field` form subcomponents, a custom Help tooltip, and a custom error-box pattern alongside an empty `components/ui/` directory. This phase unifies them.

**Decisions (taken 2026-05-17 during brainstorming):**

- **Theme strategy: rename legacy → progressively retire.** `globals.css` has four direct collisions with shadcn vars (`--muted`, `--accent`, `--card`, `--border`); the worst is `--muted` (your code uses it as a *text color*, shadcn uses it as a *background color*). Mechanical rename to `--legacy-*` is a zero-visual-change step that removes the collision; the end state is full shadcn semantics as each component migrates.
- **Font: keep Geist, drop Inter.** shadcn's init wired Geist via `--font-sans`; `<body>` still has `inter.className` which means Inter is actually rendering. Delete the Inter import + class to let Geist take effect.
- **Tables: keep the global CSS.** Your `globals.css` table rules render six report pages consistently. Migrate to shadcn `Table` only if sorting/pagination ever becomes a requirement.
- **Help (`?` tooltips): migrate to shadcn `Tooltip`** — same primitive across the site, plus the accessibility win.

**Ordering note:** 2.5.1 must ship before any other 2.5 item — the rename is a prerequisite for clean migrations. Phase 2.2's delete-confirm UI depends on the `AlertDialog` from 2.5.3. 2.5.4 rebuilds the Header from scratch, so the Header sign-out button in 2.5.2 is satisfied by 2.5.4 — only worth migrating in isolation if you ship 2.5.2 before 2.5.4.

### 2.5.1 Foundations _(no visible change; prerequisite)_

- [ ] Rename legacy CSS vars in `globals.css` to `--legacy-*` (`--muted` → `--legacy-muted`, plus `--accent`, `--card`, `--border`, `--bg`, `--fg`, `--card-fg`, `--accent-fg`, `--subtle`, `--positive`, `--negative`). Update the `@theme inline` mappings (`--color-muted: var(--legacy-muted)`, etc.) so existing Tailwind classnames (`text-muted`, `bg-card`, `bg-accent`) keep resolving to the same values until each component is migrated.
- [ ] Drop Inter from `app/layout.tsx`: remove the import, the `inter` const, and `className={inter.className}` from `<body>`. Verify Geist renders.
- [ ] Add `pnpm shadcn:add` npm script: `shadcn add "$@" && prettier --write "components/ui/**/*.{ts,tsx}"`. Eliminates the double-quote / no-semi formatting churn on every future component add.
- [ ] Install baseline shadcn primitives via that script: `input`, `label`, `textarea`, `alert`, `dialog`, `alert-dialog`, `tooltip`, `popover`, `command`, `select`, `toggle-group`, `separator`, `skeleton`.

### 2.5.2 Primitive migration _(group by mechanical similarity)_

Each migration both swaps the component **and** moves it off `--legacy-*` to shadcn semantics (`text-muted-foreground`, `bg-primary`, etc.) — that's how the legacy vars eventually get retired.

- [ ] Buttons (~30 instances). Sub-checklist by file:
  - [ ] `components/Header/Header.tsx` — sign-out → `Button variant="outline" size="sm"` _(skip if 2.5.4 is shipped first; the rewritten header uses `DropdownMenu` for user actions)_
  - [ ] `components/DateFilter/DateFilter.tsx` — ~12 chip buttons → `Button variant="ghost" size="sm"`
  - [ ] `components/Card/Card.tsx` — action link → `Link` + `buttonVariants({ variant: 'link' })`
  - [ ] `features/accounts/AccountButtons.tsx` — link group → `Link` + `buttonVariants`
  - [ ] `app/transactions/new/TransactionForm.tsx` — submit, "+ Add posting", remove posting, **status toggle group → shadcn `ToggleGroup`**
  - [ ] `app/login/page.tsx` + `app/signup/page.tsx` + `app/import/page.tsx` — primary actions
  - [ ] `features/dashboard/Dashboard.tsx` — quick-add button
- [ ] Form inputs:
  - [ ] `app/signup/page.tsx` — replace the inline `Field` subcomponent with `Label` + `Input` + inline error
  - [ ] `app/transactions/new/TransactionForm.tsx` — same `Field` pattern; also wrap the note `<textarea>` in `Textarea`
  - [ ] `app/import/page.tsx` — wrap the file `<input>` in shadcn `Input` + `Label`
- [ ] Error / success boxes — collapse the duplicated red/green box pattern in `login`, `signup`, `import`, `TransactionForm` into shadcn `Alert` (`variant="destructive"` for errors, default for success).

### 2.5.3 Interactive upgrades _(real UX wins)_

- [ ] Replace `<datalist>` autocomplete in `TransactionForm` with shadcn `Command` + `Popover` (Combobox) for both account and payee suggestions — keyboard nav, fuzzy filter, larger lists.
- [ ] Migrate `components/Help/Help.tsx` to shadcn `Tooltip` — keep the same `Help` API so every page header stays unchanged.
- [ ] Build a reusable `<ConfirmDialog>` wrapper around shadcn `AlertDialog` — **prerequisite for Phase 2.2 delete-transaction.**

### 2.5.4 Navigation rewrite — sidebar + mega-menu header

Today's `components/Header/Header.tsx` is a single horizontal nav with **11 top-level links** crammed into one row. It already wraps on narrow viewports and is the highest-touch surface in the app. Rewrite it around shadcn's navigation primitives.

**Target shape:**

- **Persistent left sidebar** (shadcn `Sidebar` + `SidebarProvider`):
  - Groups: `Reports` (Dashboard, Accounts, Balance, Net Worth, Periodic Balance, Cash Flow, Debts), `Activity` (Payees, Reconcile), `Journal` (Add transaction, Import; later: list / templates from Phase 2.2 / 2.3)
  - Collapsible (icon-only rail mode)
  - Mobile: collapses into a `Sheet`-backed drawer triggered from the header
- **Top header** — thin: app brand on the left, **mega menu** in the middle (shadcn `NavigationMenu`), user menu on the right (shadcn `DropdownMenu`).
  - Mega menu trigger → flyout panels with grouped report links, short descriptions per item, and a featured "Add transaction" CTA. Use `NavigationMenu` + `NavigationMenuContent` with a grid layout.
  - User menu → email, sign-out, link to a future `/account` page. Replaces the inline `<button>` and `<span>` in today's header.
- **Active state** logic moves into a small `useActiveMenu(pathname)` hook so both the sidebar and the mega menu share the same `match: 'exact' | 'prefix'` semantics that exist in `Header.tsx:47–51` today.

**Subtasks:**

- [ ] Run `pnpm shadcn:add sidebar navigation-menu dropdown-menu sheet`.
- [ ] Build `components/Sidebar/AppSidebar.tsx` driven by a typed `navConfig` (single source of truth for the new header *and* sidebar).
- [ ] Extract the existing `menus` array out of `Header.tsx` into `components/nav/config.ts`; group entries by section; add `description` and optional `icon` (lucide) fields for the mega menu.
- [ ] Build `components/Header/AppHeader.tsx` from scratch using `NavigationMenu` for the mega menu and `DropdownMenu` for the user actions. Delete the old `Header.tsx`.
- [ ] Wire `SidebarProvider` into `app/layout.tsx`; restructure `<main>` so the page container sits to the right of the sidebar. Hide both sidebar and header on `/login` and `/signup` (today's `isAuthPage` guard).
- [ ] Move the `monthStart` / `monthEnd` calculation for "Periodic Balance" out of the header into `navConfig` so it doesn't force `'use client'` on the whole nav tree (today it does — `Header.tsx:1`). Server-render where possible.
- [ ] Mobile drawer: header shows a `SidebarTrigger` on screens < `lg`; sidebar renders inside a `Sheet`.
- [ ] Persist sidebar collapsed/expanded state per user (cookie or `localStorage`; shadcn's `SidebarProvider` already supports `defaultOpen` and a state callback).
- [ ] Verify the active-state hook handles every existing case in `Header.tsx:16–45` (especially `Periodic Balance` and `Add transaction` prefix matches).

### 2.5.5 Optional / cosmetic

- [ ] Wrap Dashboard / Balance / Payees card containers in shadcn `Card` (purely visual unification).
- [ ] Replace `<div className="h-px bg-border" />` dividers with `Separator` (mainly inside `DateFilter`).
- [ ] Add `Sonner` for transient feedback after `addTransaction` / `replaceJournalFromZip` — currently both rely on full-page redirects.
- [ ] `Skeleton` loaders on report pages that block on `ledger` (Dashboard, Balance, Accounts, Monthly). Replaces 3.3's "loading skeletons" bullet — keep this version and drop the duplicate when this lands.
- [ ] If sorting/pagination is ever needed: migrate the six tables to shadcn `Table`.

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
