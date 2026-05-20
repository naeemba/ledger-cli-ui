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

## Phase 2 — Authoring MVP _(complete)_

First mutation path: a working "add transaction" flow so the app stops being read-only.

- [x] Server action `addTransaction(userId, draft)` that appends a properly-formatted block to `mainPath`
  - [x] Atomic write: single `fs.appendFile` (atomic at syscall level for sub-PIPE_BUF writes); leading `\n\n` guards against missing trailing newline
  - [x] Invalidate the `ledger-cli-exec` cache via per-user `updateTag('ledger:<userId>')`
- [x] `/transactions/new` page with form fields: date, payee, optional `*`/`!` cleared flag, optional note, dynamic posting rows (account, amount, currency)
  - [x] Client-side balance check (sum of postings must equal zero, or exactly one posting blank for auto-balance)
  - [x] Account autocomplete sourced from `ledger accounts`
  - [x] Payee autocomplete sourced from `ledger payees`
- [x] Server-side validation before write (Zod): balanced postings (per currency), account/payee/note character rules, amount regex
- [x] "Add transaction" entry point in Header nav (and a quick-add button on Dashboard)
- [x] Redirect to Dashboard after success; surface friendly error inline on failure

---

## Phase 3 — UI library adoption (shadcn/ui) _(current)_

**Why:** the project just adopted shadcn/ui (`base-nova` preset over `@base-ui/react`, neutral base color). The init landed `components.json`, `lib/utils.ts`, `components/ui/button.tsx`, and merged its CSS variables into `app/globals.css`. Right now the codebase has two parallel design systems: ~30 custom buttons, custom `Field` form subcomponents, a custom Help tooltip, and a custom error-box pattern alongside an empty `components/ui/` directory. This phase unifies them — and lands the primitives (`AlertDialog`, `Command`, `Combobox`) that Phase 4's edit/delete/templates flows depend on.

**Decisions (taken 2026-05-17 during brainstorming):**

- **Theme strategy: one merged palette, project values win.** `globals.css` had four direct collisions with shadcn vars (`--muted`, `--accent`, `--card`, `--border`) — the worst was `--muted` (project uses it as a *text color*, shadcn uses it as a *background color*). Resolved by collapsing to a single set of vars: project palette is the source of truth, shadcn long-form names (`--background`, `--foreground`, `--card-foreground`, `--accent-foreground`) are aliases of the project vars, and the orphan `.dark` class block was removed (system pref via `@media` is the only dark trigger today).
- **Font: keep Geist, drop Inter.** shadcn's init wired Geist via `--font-sans`; `<body>` still has `inter.className` which means Inter is actually rendering. Delete the Inter import + class to let Geist take effect.
- **Tables: keep the global CSS.** Your `globals.css` table rules render six report pages consistently. Migrate to shadcn `Table` only if sorting/pagination ever becomes a requirement.
- **Help (`?` tooltips): migrate to shadcn `Tooltip`** — same primitive across the site, plus the accessibility win.

**Ordering note:** 3.1 must ship before any other 3.x item — the rename is a prerequisite for clean migrations. Phase 4.1's delete-confirm UI depends on the `AlertDialog` from 3.3. 3.4 rebuilds the Header from scratch, so the Header sign-out button in 3.2 is satisfied by 3.4 — only worth migrating in isolation if you ship 3.2 before 3.4.

### 3.1 Foundations _(no visible change; prerequisite)_

- [x] Merge `globals.css` to a single palette: project vars (`--bg`, `--fg`, `--muted`, `--card`, `--card-fg`, `--border`, `--subtle`, `--accent`, `--accent-fg`, `--positive`, `--negative`) are the source of truth; shadcn long-form names (`--background`, `--foreground`, `--card-foreground`, `--accent-foreground`) are aliases. Orphan `.dark` class block removed — dark mode is `@media (prefers-color-scheme: dark)` only until a manual toggle ships in Phase 8.
- [x] Drop Inter from `app/layout.tsx`: remove the import, the `inter` const, and `className={inter.className}` from `<body>`. Verify Geist renders.
- [x] Add `pnpm shadcn:add` npm script: wrapped in a shell function so pnpm's trailing-arg passthrough reaches `$@` — `f() { shadcn add -y "$@" && prettier --write 'components/ui/**/*.{ts,tsx}'; }; f`. Eliminates the double-quote / no-semi formatting churn on every future component add.
- [x] Install baseline shadcn primitives via that script: `input`, `label`, `textarea`, `alert`, `dialog`, `alert-dialog`, `tooltip`, `popover`, `command`, `select`, `toggle-group`, `separator`, `skeleton`. (Transitive deps `toggle` and `input-group` also landed.)

### 3.2 Primitive migration _(group by mechanical similarity)_

Each migration swaps the custom component for its shadcn equivalent. The shadcn long-form tokens (`bg-primary`, `text-muted-foreground`, etc.) and the project tokens (`bg-card`, `text-muted`, etc.) already share one merged palette, so there's no var bookkeeping to do here — just the component swap.

- [x] Buttons (~30 instances). Sub-checklist by file:
  - [ ] `components/Header/Header.tsx` — sign-out → `Button variant="outline" size="sm"` _(skip if 3.4 is shipped first; the rewritten header uses `DropdownMenu` for user actions)_
  - [x] `components/DateFilter/DateFilter.tsx` — 21 chip + Apply buttons → `Button variant="ghost" size="sm"` (chips) and default Button (Apply)
  - [x] `components/Card/Card.tsx` — action link → `Link` + `buttonVariants({ variant: 'link' })`
  - [x] `features/accounts/AccountButtons.tsx` — link group → `Link` + `buttonVariants({ variant: 'outline', size: 'xs' })` with grouped-rounding classes
  - [x] `app/transactions/new/TransactionForm.tsx` — submit, "+ Add posting" (link variant), remove posting (icon-sm ghost), **status toggle group → shadcn `ToggleGroup`** with `spacing={0}` outline variant
  - [x] `app/login/page.tsx` + `app/signup/page.tsx` + `app/import/page.tsx` — primary actions
  - [x] `features/dashboard/Dashboard.tsx` — quick-add `Link` + `buttonVariants({ size: 'sm' })`
- [x] Form inputs:
  - [x] `app/signup/page.tsx` — inline `Field` now uses `Label` + shadcn `Input` (with `aria-invalid` for error styling) + inline error
  - [x] `app/transactions/new/TransactionForm.tsx` — `Field` rewritten around `Label`; date/payee/posting-row inputs → `Input`; note → `Textarea`; legacy `inputClass` helper deleted
  - [x] `app/import/page.tsx` — file input wrapped in `Input` + `Label`
- [x] Error / success boxes — collapsed the 4 red/green box patterns (`login`, `signup` `ErrorBox`, `import`, `TransactionForm` `formError`) into shadcn `Alert` with `AlertDescription`; `variant="destructive"` for errors, default for success.

### 3.3 Interactive upgrades _(real UX wins)_

- [x] Reusable `components/Combobox/` (button trigger + `Popover` + `Command` + `CommandInput`) wired into `TransactionForm` for payee and per-row account; supports `allowFreeText` via a "Use \"$search\"" fallback item; both `<datalist>` blocks removed.
- [x] `components/Help/Help.tsx` now wraps shadcn `Tooltip` (with self-contained `TooltipProvider`); same `Help` props (`children`, `label`, `className`) so every page header stays unchanged.
- [x] Reusable `components/ConfirmDialog/` wraps shadcn `AlertDialog` (`children` as `render`-trigger, configurable `title`/`description`/`confirmLabel`/`cancelLabel`/`variant` — default `destructive`, `onConfirm` handler). **Prerequisite for Phase 4.1 delete-transaction.**

### 3.4 Navigation rewrite — sidebar + mega-menu header + command palette

The old `components/Header/Header.tsx` was a single horizontal nav with 11 links crammed into one row. Rewritten around shadcn navigation primitives plus a global Cmd+K / Ctrl+K command palette.

**Shipped shape:**

- **`components/nav/config.ts`** — typed `NavSection[]` (Reports / Activity / Journal), one entry per route with `title`, `href`, `description`, `icon` (lucide), `match: 'exact' | 'prefix'`, optional `activePrefix`, and `keywords` for search. Single source of truth for sidebar, mega menu, and command palette. `getNavSections()` computes the dynamic Periodic-Balance month range each call.
- **`components/nav/useActiveMenu.ts`** — shared helper consolidating the `Header.tsx:47–51` active-state semantics.
- **`components/Sidebar/AppSidebar.tsx`** — collapsible icon-rail sidebar (shadcn `Sidebar` + `SidebarProvider` from layout), groups driven by the nav config; `SidebarRail` for desktop toggle; mobile drawer via `Sheet` is automatic from `SidebarProvider`.
- **`components/Header/AppHeader.tsx`** — thin top bar: `SidebarTrigger` on the left, `NavigationMenu` mega menu in the middle (per-section flyout in a 2-col grid with icon + title + description), `CommandPaletteTrigger` + user `DropdownMenu` (avatar / signed-in-as label / sign-out) on the right. Mega menu hidden below `md`; mobile users navigate via sidebar drawer + Cmd+K.
- **`components/CommandPalette/`** — `CommandPaletteProvider` mounts a global Cmd+K / Ctrl+K listener; the dialog (shadcn `CommandDialog`) lists every nav entry grouped by section, searchable by title/description/keywords/section. `CommandPaletteTrigger` is a header button with a platform-aware `⌘ K` / `Ctrl K` kbd hint (`useSyncExternalStore` to avoid hydration mismatch).
- **`components/AppShell/AppShell.tsx`** — client wrapper used by `app/layout.tsx`. On `/login` and `/signup` it renders a centered card layout with no sidebar/header; everywhere else it mounts `TooltipProvider` → `CommandPaletteProvider` → `SidebarProvider` → `AppSidebar` + `SidebarInset(AppHeader + page)` + `CommandPalette`.
- **Sidebar persistence** — shadcn's `SidebarProvider` already writes a `sidebar_state` cookie on every toggle (7-day TTL); collapsed/expanded state survives reloads.
- **Old `Header.tsx` deleted**; `components/Header/index.ts` now re-exports `AppHeader`.

**Notes / known limitations:**

- Sidebar default-open state is not yet seeded from the cookie at SSR time — first paint is always expanded, then user toggles persist. Worth wiring up via a server-side cookie read into `<SidebarProvider defaultOpen={…}>` in a future pass.
- Auth pages do not show the Cmd+K palette (no signed-in nav surface yet).

### 3.5 Polish (post-3.4)

- [x] **Page-width consistency** — `AppShell` now wraps every non-auth page in `mx-auto w-full max-w-7xl`. Removed per-page width overrides in `/import` and `/transactions/new`.
- [x] **shadcn `Card`** wraps Dashboard (Recent transactions, Journal health) / Balance / Payees / Periodic Balance / Monthly register / Cash Flow card containers. Local `components/Card/Card.tsx` (the stat-tile wrapper) now uses shadcn `Card` internally.
- [x] **shadcn `Separator`** replaces the lone `<div className="h-px bg-border" />` in `DateFilter`.
- [x] **Chart redesign** — replaced chart.js + react-chartjs-2 with shadcn `Chart` (Recharts under the hood). New `components/Chart/Chart.tsx` API: `type` (`bar` / `line` / `area`), `data` (flat rows), `xKey`, `series` (key/label/color), `valueFormatter`, `stacked`, `showLegend`. Updated 5 consumers (NetWorth → area, Cash Flow → grouped bars with `--positive`/`--negative`, Payees / Periodic Balance / Monthly register → single-series bars). New chart palette in `globals.css` (`--chart-1..5` are now distinct blue/emerald/coral/violet/amber instead of shadcn's default grays). Removed `utils/getColor.ts`.
- [x] **`Sonner` toasts** — wired `<Toaster />` into `AppShell` (sonner.tsx patched to drop `next-themes`, default to `theme="system"`); transaction-save and journal-import flows now fire success toasts.
- [x] **`Skeleton` loaders** — reusable `components/PageSkeleton/` (title block + table block + optional chart block) wired via `app/loading.tsx`. Next renders the skeleton inside the layout while async page bodies hit `ledger`.
- [ ] If sorting/pagination is ever needed: migrate the six tables to shadcn `Table`.

---

## Phase 4 — Authoring continued

The remaining authoring work that didn't land in Phase 2's MVP. Edit/delete depends on `<ConfirmDialog>` from 3.3, so this comes after Phase 3.

### 4.1 Edit / delete transaction

- [ ] Decide the addressing scheme: line range in `mainPath`, or generated transaction ID via a custom comment tag (e.g. `; :uid: <ulid>`). The tag approach survives reformatting; line ranges break the moment anyone edits the file outside the app.
- [ ] Backfill UID tags on import (one-time migration over the journal)
- [ ] List view at `/transactions` with pagination (use `ledger reg` JSON-ish output — or parse our own)
- [ ] Edit page reusing the add-transaction form
- [ ] Delete with confirm modal (uses the `<ConfirmDialog>` from 3.3)
- [ ] All mutations go through a single `writeJournal` helper that locks, parses, rewrites, and bumps cache

### 4.2 Recurring / templated transactions

- [ ] "Save as template" on any transaction
- [ ] Templates stored in SQLite (`template` table) — not in the journal file
- [ ] "New from template" prefills the add-transaction form
- [ ] Unblocks the paused Budget item (`TODO.md` Tier 2) once periodic transactions are easy

### 4.3 Cache & freshness

- [ ] Replace `unstable_cache` key with one that includes the user's journal mtime so writes invalidate immediately
- [ ] Or: drop caching entirely for mutating users and keep it for read-heavy sessions (measure first)
- [ ] Confirm `revalidatePath('/', 'layout')` after every mutation is sufficient

---

## Phase 5 — Quality, cleanup, tests

Pay down what's already known to be wrong before adding more surface area.

### 5.1 From `TODO.md`

- [ ] Delete orphan `FileUpload` component (no UI references it) — `components/FileUpload/FileUpload.tsx` already shows as deleted in `git status`, just commit
- [ ] Fix amount parsing fragility in `/registers/monthly/[account]` — `each.split('|')[1].split(' ')[1]` assumes `<unit> <amount>` shape, breaks for unit-less amounts
- [ ] ESLint 10 upgrade — revisit when `eslint-plugin-react` lands a compatible release

### 5.2 Tests

Bring in Vitest and cover the pure functions first (no `ledger` shell-out needed):

- [ ] `Dashboard.utils#getHighestExpense`
- [ ] `Accounts.utils#buildTree`
- [ ] `MonthlyComparison.utils#getCashFlow`
- [ ] `Reconcile#parseRows`
- [ ] `validateAccount`
- [ ] `formatAmount` / `formatDate`
- [ ] Journal helpers: `detectMain`, `replaceJournalFromZip` path-traversal guard
- [ ] `addTransaction` round-trip (write → re-read via `ledger reg`)

### 5.3 Errors & UX rough edges

- [ ] Server-side error boundary that doesn't leak `ledger` stderr to the client
- [ ] "Journal is empty" empty-state on Dashboard pointing to `/import` or `/transactions/new`
- [ ] Loading skeletons (currently most pages just block on `ledger`)
- [ ] **Verify writes with `ledger`** — after `JournalService.addTransaction` / `editTransaction` / `deleteTransaction` and after the `/import` flow, shell out to `ledger -f <main> stats` (or equivalent) and surface a parse error if the journal is no longer valid. Today our parser/writer is trusted to produce ledger-compatible output; if they ever diverge or the user's existing journal has syntax we silently mishandle, broken state lands in the file and only surfaces when a report page renders wrong.

---

## Phase 6 — Power features

The Tier-2/3 items from `TODO.md` that need more than a weekend.

- [ ] **Budget actual-vs-target** — `ledger budget`; depends on 4.2 (templates / periodic transactions)
- [ ] **CSV export** for any report (`ledger csv`)
- [ ] **Commodity / portfolio view** (`bal Assets:Investments -X CCY`)
- [ ] **Forecasting** (`ledger --forecast`)
- [ ] **Saved views** — pin a filtered Payees/Register query and reach it from the Dashboard

---

## Phase 7 — Multi-user hardening

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

## Phase 8 — Stretch / maybe-never

- [ ] Mobile-first re-layout (current nav already wraps, but the tables don't)
- [ ] Offline-first / PWA shell for read-only reports
- [ ] Direct bank-import adapters (CSV → ledger transaction) — Plaid is overkill, but a per-bank CSV mapper isn't
- [ ] Tag analytics (spend by `:vacation:` etc.)
- [ ] Dark/light mode toggle (currently theme-aware via CSS vars, no toggle)

---

## How to use this file

- When you finish something, change `[ ]` to `[x]` in the same commit
- New work goes under the right phase, not the bottom of the file
- If a phase grows past ~10 items, split it into sub-sections like Phase 3 above
- Don't delete completed phases — they're the project's changelog
