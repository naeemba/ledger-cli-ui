# Mobile Improvements — Roadmap

Living document. The app works on desktop but is **near-unusable on phones**. This
roadmap is the result of a full audit of the app shell, every data view, and every
form/overlay primitive (2026-06-27). It complements `PLAN.md`; treat it as a
mobile-focused slice that can run alongside Phase 6+ work.

Legend: `[x]` done · `[ ]` not started · `[~]` in progress
Severity: 🔴 critical · 🟠 high · 🟡 medium · ⚪ polish

---

## TL;DR — what actually makes it unusable

The app is **table-heavy** (registers, balances, transactions, prices, portfolio,
payees, cash-flow), and **none of the 10 data tables have a horizontal-scroll
container or a mobile reflow**. They simply overflow the viewport and clip. The
table cards also use `p-0 gap-0`, so text touches the screen edge. That single
pattern, repeated everywhere, is ~80% of the "unusable" feeling. The transaction
form's fixed-pixel posting grid breaks the one authoring flow on top of it.

Everything else (touch targets, drawer auto-close, `100vh`, overlay widths) is
real but secondary. Fix M0 + M1 first and the app becomes usable; M2–M5 make it
good.

### Audit corrections (claims that turned out to be non-issues)

- **"Missing viewport meta tag" is NOT critical.** Next.js App Router auto-injects
  `<meta name="viewport" content="width=device-width, initial-scale=1">` by
  default. The app *does* render at device width. We still want an explicit
  `viewport` export for `viewport-fit=cover` + `themeColor` (notch/PWA polish) —
  that's tracked in M5, not as a blocker.
- **"Navigation is inaccessible on mobile" is FALSE.** The header's
  `<SidebarTrigger>` hamburger opens the sidebar drawer, which renders the *same*
  `getNavSections()` config as the desktop mega-menu. Full nav is reachable on
  phones. The hidden header `NavigationMenu` (`hidden md:flex`) is intentional and
  redundant with the drawer — leave it.

---

## M0 — Foundational fixes (cheap, global, highest payoff)

Small, mostly one-file changes to shared primitives + globals. Do these first;
several fix dozens of screens at once.

- [x] 🔴 **Reusable responsive table wrapper.** Add a `<TableScroll>` (or extend the
  shadcn `Table` wrapper) that provides `overflow-x-auto` + `-mx` bleed +
  momentum scroll (`[-webkit-overflow-scrolling:touch]`). This is the single
  highest-leverage change. — `components/ui/table.tsx`
- [x] 🔴 **Fix `min-height: 100vh` → `100dvh`** on `body` so the keyboard / mobile
  browser chrome doesn't push the footer + submit buttons off-screen.
  — `app/globals.css:152`
- [x] 🔴 **Default table card padding on mobile.** The `p-0 gap-0` table cards leave
  text flush against the border. Add a responsive default (e.g. `p-0` body but a
  small inner gutter, or `px-3 sm:px-0` on the scroll wrapper) so content breathes.
  — affects every table card (see M1 list)
- [x] 🟠 **Touch targets ≥ 44px in primitives.** Bump the default control heights so
  the whole app benefits:
  - `components/ui/input.tsx:11` — `h-8` (32px) → `h-10`/`h-11` on mobile (keep
    `text-base` to avoid iOS zoom; the current `md:text-sm` is correct).
  - `components/ui/button.tsx:27-32` — `icon-xs` (24px) / `icon-sm` (28px) icon
    buttons miss the 44px minimum; raise mobile sizes or add a min hit-area.
  - `components/ui/sidebar.tsx:476` — sidebar items `size-8`/`size-7`.
- [x] 🟡 **Horizontal-overflow guard.** Add `overflow-x: hidden` / `max-width: 100%`
  safety to `html, body` so any single offender can't make the whole page
  pannable. — `app/globals.css`

**Acceptance:** on a 375px viewport, no page scrolls horizontally *except*
intentionally inside a table scroll container; all primary inputs/buttons are
tappable; footer/submit stays reachable with the keyboard open.

---

## M1 — Data views responsive (the core of the app)

Wrap every table in the M0 scroll container, then add a mobile reflow (stacked
"card" rows) for the views people read most. Strategy: **scroll for dense/wide
tables, card-reflow for the read-first views (transactions, dashboard, balance).**

Wrap in scroll container + de-overflow (all 🟠 unless noted):

- [x] 🔴 **Transactions** — 7 cols, no scroll. `features/transactions/TransactionTable.tsx:37`
  *(highest-traffic; do card-reflow here, not just scroll)*
- [x] 🔴 **Account register** — 5 cols, multi-currency overflow, `whitespace-nowrap`
  dates. `app/accounts/[account]/page.tsx:41,62`
- [x] 🟠 **Dashboard "recent"** — 4 cols + `whitespace-nowrap` date.
  `features/dashboard/Dashboard.tsx:191,210`
- [x] 🟠 **Prices** — 6 cols, timestamps overflow. `features/prices/PricesView.tsx:174`
- [x] 🟠 **Portfolio** — 4 cols, long account/commodity names.
  `features/portfolio/Portfolio.tsx:116`
- [x] 🟠 **Cash flow / monthly comparison** — 4 cols, comma numbers overflow.
  `features/monthlyComparison/MonthlyComparison.tsx:35`
- [x] 🟠 **Balance** — 2 cols, long account names. `app/balance/page.tsx:54`
- [x] 🟠 **Debts** — 2 cols, long payee names. `app/debts/page.tsx:47`
- [x] 🟠 **Monthly register** — 2 cols. `app/registers/monthly/[account]/page.tsx:51`
- [x] 🟡 **Payees** — 2 cols, marginal. `features/payees/Payees.tsx:96`

Grid/layout:

- [x] 🟡 **Dashboard journal-health grid** collapses to 2-up on mobile for 6 stats;
  go 1-col (or keep 2 but verify it isn't cramped).
  `features/dashboard/Dashboard.tsx:244`
- [x] 🟡 **Allow account-name wrapping** in narrow cells (drop `whitespace-nowrap`
  on the long text columns; keep it only on dates/amounts).
- [x] 🟡 **recharts responsiveness** — confirm charts use `<ResponsiveContainer>` and
  don't set fixed pixel widths (portfolio / net-worth / monthly). Verified: all
  charts route through `Chart` → `ChartContainer` → `ResponsiveContainer` with a
  `w-full` box and `height` set via CSS only; no fixed pixel widths anywhere.

**Acceptance:** every table is either fully readable stacked, or scrolls smoothly
inside a contained area with the rest of the page static. Numbers/dates never clip.

---

## M2 — Forms & authoring

- [x] 🔴 **Transaction posting grid** `grid-cols-[1fr_140px_90px_auto]` is fixed-pixel
  and overflows < ~360px; the core authoring flow breaks. Reflow to stacked rows
  on mobile (`grid-cols-1` / wrap), full-width on phones.
  `features/transactions/TransactionForm.tsx:370`
- [x] 🟡 **Transaction form two-column** `lg:grid-cols-[minmax(280px,360px)_1fr]` —
  verify it collapses cleanly before `lg`; details col is cramped on tablets.
  `features/transactions/TransactionForm.tsx:179`
- [x] 🟡 **Prices add-rate form** `sm:grid-cols-3` date/time/quote inputs are narrow
  pre-`sm`; verify stacked layout on phones. `features/prices/PricesView.tsx:68`
- [x] 🟡 **Textarea / labels** — `min-h-16` textarea and `text-[0.7rem]` labels are
  cramped on phones; bump on mobile. `TransactionForm.tsx:334`, `ui/textarea.tsx:9`

**Acceptance:** add/edit transaction is fully usable thumb-only on a 375px phone,
including adding/removing posting rows, with the submit button reachable.

---

## M3 — Navigation & chrome

- [ ] 🟠 **Sidebar drawer doesn't auto-close on navigation.** `SidebarMenuButton`
  fires `onClick` but never calls `setOpenMobile(false)`, so the drawer stays
  open over the content after tapping a nav link. Close it on mobile navigation
  (either in `SidebarMenuButton` or via a pathname effect in `AppSidebar`).
  `components/ui/sidebar.tsx:255-288`, `components/Sidebar/AppSidebar.tsx`
- [ ] 🟡 **Mobile sidebar width** `SIDEBAR_WIDTH_MOBILE = '18rem'` (288px ≈ 77% of a
  375px screen). Acceptable since it's an overlay that auto-closes after M3.1;
  optionally trim to ~16rem. `components/ui/sidebar.tsx:30`
- [ ] ⚪ **Header height / safe area** — `h-14` sticky header has no notch awareness;
  fold into M5 safe-area work. `components/Header/AppHeader.tsx:51`
- [ ] ⚪ **Content bottom padding** `pb-20` is heavy on short mobile viewports; make
  responsive (`pb-12 sm:pb-20`). `components/AppShell/AppShell.tsx:54`

**Acceptance:** tapping a nav item navigates *and* dismisses the drawer; nav usable
one-handed.

---

## M4 — Overlays (popover / sheet / dialog / command / select)

These mostly matter on the smallest phones (≤ 320px) and in landscape.

- [ ] 🟠 **Popover fixed `w-72`** (288px) overflows < 320px. Make responsive
  (`w-[min(18rem,calc(100vw-2rem))]`). `components/ui/popover.tsx:39`
- [ ] 🟡 **Select `min-w-36`** dropdown can clip near screen edge; verify Base UI
  flip + cap to viewport. `components/ui/select.tsx:86`
- [ ] 🟡 **Command palette `max-h-72`** eats ~40% of portrait height; make it
  viewport-relative (`max-h-[60dvh]`). `components/ui/command.tsx:96`
- [ ] 🟡 **Dialog tablet breakpoint** — `sm:max-w-sm` (448px) can exceed landscape
  tablet width; add a sane upper cap. `components/ui/dialog.tsx:55`
- [ ] 🟡 **Generic Sheet `w-3/4`** — only used outside the sidebar; verify any such
  usages aren't dominating small screens. `components/ui/sheet.tsx:55`

**Acceptance:** open every overlay on a 320px device — nothing renders off-screen
or clips its content.

---

## M5 — Polish & PWA

- [ ] ⚪ **Explicit `viewport` export** with `viewportFit: 'cover'` + `themeColor`
  (light/dark) and safe-area-inset padding on the sticky header / bottom of
  scroll areas (`env(safe-area-inset-*)`) for notched devices. `app/layout.tsx`
- [ ] ⚪ **PWA metadata** — `mobile-web-app-capable`, theme color, apple touch icon.
- [ ] ⚪ **Tablet (768–1023px) pass** — several layouts only optimize at `lg:`;
  add `md:` adjustments for iPad / landscape phone.
- [ ] ⚪ **Hover-only affordances** — ensure `:active`/`focus-visible` parity for
  touch where the UI relies on `hover:` (sidebar items, links).

---

## Suggested order of execution

1. **M0** (one PR) — global primitives + globals.css. Instantly improves everything.
2. **M1 transactions + account register + dashboard + balance** (the read-first
   views) — biggest perceived win.
3. **M2 transaction form** — restores authoring on phones.
4. **M1 remainder** (prices, portfolio, cashflow, debts, payees, registers).
5. **M3** drawer auto-close.
6. **M4 / M5** as polish.

After M0–M2 the app should go from "almost unusable" to "usable"; M3–M5 take it to
"good".
