# Budgets: allowance-style, ledger-computed

2026-07-17

## Problem

The app has no budgets. Research across YNAB, Actual, Monarch, Lunch Money,
Copilot (verified against vendor docs 2026-07-17) shows two models: envelope
(categories are stateful funds of received income; covering/Ready-to-Assign
mechanics) and per-period category allowances (planned vs actual, optional
rollover netting). Envelope math requires stateful allocation that the
journal + `ledger` cannot compute and JS must not (no-JS-money-math HARD
RULE). The allowance model is ledger-native: `ledger budget`,
`bal --unbudgeted`, and `reg --budget --monthly` compute actual, allowance,
diff, %, and a cumulative running total directly from periodic (`~`)
directives — all verified empirically against ledger 3.4.1.

Decisions (user-confirmed):
- Rollover: no stored state, no per-category toggle. Show this-month
  progress AND a cumulative year-to-date over/under column (ledger's running
  total) side by side.
- Bills overlap: recurring bill rules count automatically as allowances
  (Actual's schedule-template pattern). Explicit budget lines stack on top
  for the same account; the UI labels bill-derived allowances distinctly.
- Periods: full structured schedule (same every-N-units-from-anchor grammar
  as recurring). Caveat accepted: ledger buckets by calendar periods, so
  non-monthly anchored lines (e.g. every 2 weeks from a Friday) have exact
  allowance amounts but calendar-snapped bucket edges. Monthly/yearly are
  exact. Documented in UI helper text and LEDGER-AUDIT.md.
- Placement: new /budgets page + a compact dashboard widget.
- Currency: report converts with `-X <display base>` per the existing
  base-currency selector convention.

## Design

### Data model — budget lines are `:budget:`-tagged periodic directives

```
~ every 1 months from 2026/07/01
    ; :uid: 01XYZ...
    ; :budget:
    ; Groceries budget
    Expenses:Food  USD 400.00
    Assets:Checking
```

- Reuses the recurring machinery wholesale: `parseSchedule`/
  `serializeSchedule`, structured create schema, uid + fingerprint,
  snapshot → mutate → `ledger stats` verify → rollback → push write path,
  delete-by-uid+fingerprint.
- `lib/journal/recurring.ts` gains a `budget: boolean` flag: parsed from a
  `; :budget:` comment line (recognized before the generic note branch,
  like `:handled:`), emitted by `formatRecurring` when set.
- **Due-queue exclusion (load-bearing)**: `buildDueList` must skip
  budget-tagged rules; otherwise every budget line surfaces as a phantom
  due bill on its period boundary. A regression test asserts a
  budget-tagged rule never appears in due/upcoming/unsupported.
- Budget lines take no `:handled:` line and are never posted/skipped; the
  post/skip service methods reject a budget-tagged uid with reason
  'invalid'.
- Ledger ignores the comment tags and counts BOTH budget lines and
  recurring bills as `--budget` allowances — which implements the
  bills-count-automatically decision with zero filtering machinery.
- The balancing posting is required by ledger's periodic-entry grammar; the
  form auto-fills it (same as recurring).

### Report — three ledger queries, JS only parses and renders

Against the real journal, all with `-X <display base>`:

1. This-month table: `ledger budget ^Expenses -p 'this month' -X <base>` →
   per budgeted account: actual | budgeted | diff | %. Full-month allowance
   during a partial month (ledger's behavior; also the surveyed apps'
   convention — none prorate).
2. Cumulative over/under: `ledger reg ^Expenses --budget --monthly
   -b <Jan 1 of current year> -X <base> --format '%D|%A|%t|%T\n'` → per
   month delta + running total per account; the latest running total is the
   year-to-date rollover position shown in the cumulative column. Verified
   working on 3.4.1.
3. Unbudgeted: `ledger bal ^Expenses --unbudgeted -p 'this month'
   -X <base>` → catch-all "unbudgeted spending" row.

JS never adds, subtracts, or converts an amount; every displayed number is
a string ledger printed. Expenses only at launch (`^Expenses` filter).

Empirical preconditions (step 1 of the plan, pinned as tests before feature
code, per LEDGER-AUDIT discipline):
- The `budget` report's column structure and whether `--format` applies to
  it (it is a distinct report type from bal/reg); pin the parse against
  captured output.
- `-X` interplay inside `budget` and `reg --budget` (the `-P -X` segfault
  class lives nearby; my probes verified plain `-X` works on both).
- Mixed-commodity actuals under a single-commodity allowance.

### UI

/budgets page (feature dir features/budgets/, thin app/budgets/page.tsx):
- Create form: account input, amount + currency, structured schedule
  (defaults: every 1 month from the 1st of the current month), optional
  note. Serializes to the tagged directive via a budget variant of the
  recurring create path.
- Budget table: one row per budgeted account — progress bar, actual /
  budgeted / diff (red when over), cumulative YTD column, delete button on
  rows backed by an explicit budget line. Bill-derived allowance rows
  render read-only, labeled "from your bills". Unbudgeted row at the
  bottom.
- Helper text notes the calendar-bucket caveat for non-monthly schedules.

Dashboard: new `budgets` id in WIDGET_IDS/WIDGET_LABELS (auto-appears for
existing users via normalizeWidgets): top categories by % used, compact
progress bars, links to /budgets.

### Server surface

- Actions (one file each): `createBudgetAction`, `deleteBudgetAction` —
  requireUser → WRITE rate-limit → journalService → audit (`budget.add`,
  `budget.delete` added to AUDIT_ACTIONS + describe map) → revalidatePath.
- JournalService: `addBudget` (thin variant of addRecurring setting the
  budget flag, no `:handled:` initialization) and `deleteBudget` (reuses
  the deleteRecurring path; both may share one private helper). listBudgets
  = listRecurring filtered by the flag.
- Report assembly in features/budgets/report.ts: runLedger three times,
  parse, join by account; pure parse functions unit-tested against
  captured ledger output.

### Testing

- Gotcha-pinning tests: budget report parse shape, -X conversion,
  mixed-commodity case, weekly calendar-snapping documented.
- Service: `:budget:` tag round-trip; due-queue exclusion regression;
  post/skip reject budget uids; add/delete rollback on ledger rejection.
- Report: parser tests on captured output (budgeted, over-budget,
  unbudgeted, multi-currency).
- End-to-end: create budget line → `ledger budget` shows the allowance;
  `ledger stats` parses the journal (portability).

### Rollout

No migration. Journals without budget lines render an empty-state CTA.
Pre-existing hand-written `~` rules keep their current recurring-page
semantics (no `:budget:` tag = bill/unsupported as today).

### Out of scope

Envelope semantics (covering, Ready-to-Assign), per-category rollover
toggles, alerts/notifications, income budgeting, budget line editing
(create/delete only, like recurring), proration or pace projection of the
partial month.
