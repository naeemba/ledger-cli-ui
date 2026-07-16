# Recurring transactions: confirm-to-post

2026-07-16

## Problem

Recurring entries are ledger `~` periodic directives rendered via `--forecast`.
They are forecast-only: nothing links them to real transactions, nothing tells
the user "this is due, confirm it", and a paid occurrence keeps showing in the
forecast. Users expect the calendar model every mainstream tool converged on
(GnuCash Since-Last-Run, Actual Budget manual-approval schedules, YNAB
scheduled transactions): a rule generates due occurrences, the user confirms
each into a real transaction, missed occurrences queue up until handled.

Research summary (verified against official docs 2026-07-16): three models
exist — forecast-only overlay (hledger/ledger), silent cron auto-post
(Firefly III), and confirm-to-post with per-occurrence state (GnuCash, Actual,
YNAB, HomeBank, MMEX). Confirm-to-post is the dominant model and the best fit
for a journal-as-source-of-truth constraint. Common UX expectations: explicit
single-occurrence skip, an overdue review queue that survives the app being
closed, end conditions, visible next-due status.

## Design

### Data model — the journal is the only state

A rule remains a `~` directive. Its `from` date doubles as "next unhandled
occurrence"; there is no occurrence table, no database state.

```
~ Monthly from 2026/08/05
    ; :uid: 01ABC...
    ; Netflix
    Expenses:Subscriptions:Netflix  USD 15.00
    Assets:Checking
```

- **Create**: normalize the stored `from` to the first occurrence on or after
  today, preserving the user's anchor (input "Monthly from 2026/01/05", saved
  "Monthly from 2026/08/05"). A rule with no `from` is stored as-is and treated
  as `from = today` at expansion time. New rules therefore never show a
  backlog.
- **Post**: write a real transaction dated on the due date through the
  existing add path, plus a provenance comment `; :recurring: <rule-uid>`
  (no logic depends on it), then rewrite the rule's `from` to the day after
  the posted occurrence. Both edits in one write, one `ledger stats` verify,
  one push; rollback both on failure.
- **Skip**: the `from` rewrite only, no transaction.
- Concurrency: rule fingerprint (existing sha256 mechanism) is required by
  Post/Skip; the first successful action changes it, so double-clicks and
  replays fail as stale. Oldest-first is enforced server-side: an action whose
  due date is not the rule's oldest unhandled occurrence is rejected.

### Due-list query — ledger expands, JS buckets

`--forecast` on the real journal cannot emit past-due occurrences (it starts
after the last real transaction), so expansion runs against a rules-only view:

1. `listRecurring` parses all `~` blocks (exists today).
2. Per rule, write its block to a temp journal inside the per-user journal
   working directory (plaintext-safe location for encrypted journals; deleted
   after the call) and run
   `ledger reg --forecast 'd<[today+30]' -e <today+30>` with a `%D|quantity|
   commodity|%A` format. Per-rule expansion avoids attributing rows when rules
   share accounts; rules are few and calls run concurrently.
3. Rows with date <= today are due/overdue (actionable); later rows are the
   read-only upcoming preview. This replaces `getUpcomingBills` as the
   widget's single source.

All recurrence math is ledger's. JS parses rows, buckets by date, formats.

### UI

Dashboard upcoming-bills widget: "Due" group (date <= today, overdue styling
for past dates, Post + Skip buttons per row, oldest first, one row per missed
occurrence) above the existing read-only "Upcoming" group. Button pattern
follows `RecurringView` delete: `useTransition`, per-row pending, inline
error, `revalidatePath('/', 'layout')` on success.

/recurring page: create/delete unchanged; the rule list gains a "next due"
column from the same expansion.

### Server surface

- Actions (one file each): `postOccurrenceAction(ruleUid, fingerprint,
  dueDate)`, `skipOccurrenceAction(ruleUid, fingerprint, dueDate)` —
  `requireUser` → WRITE rate-limit → service → audit (`recurring.post` /
  `recurring.skip`, bytes before/after), same shape as `deleteRecurringAction`.
- `JournalService.postRecurringOccurrence` / `skipRecurringOccurrence` under
  the user lock: pull → locate rule by uid → fingerprint check → oldest-first
  check → mutate → verify → push/rollback. Errors surface as
  `{ ok: false, message }` with ledger's own message; no silent fallbacks.

### Empirical preconditions (step 1 of implementation, before feature code)

Verify on synthetic journals against ledger 3.4.1 and pin as tests:

1. A rules-only journal plus `--forecast` emits occurrences starting at
   `from`, including dates in the past.
2. Rewriting `from` preserves anchor alignment for "every 2 weeks from a
   Friday" and "monthly from the 5th". If it re-anchors, compute the bumped
   `from` by asking ledger for the next occurrence rather than JS date math.

If either fails, revisit the design at that point.

### Testing

End-to-end against real ledger, existing test style:
- The two gotcha-pinning tests above.
- Service: post writes transaction + tag + bump atomically; skip bumps only;
  stale fingerprint rejected; non-oldest occurrence rejected; ledger-rejected
  rewrite rolls back both edits; quota respected.
- Expansion: multi-currency, multiple rules, overdue vs upcoming bucketing,
  creation-time `from` normalization.
- Parser: the `:recurring:` comment line survives
  `parseJournalFile`/`formatTransaction` round-trips.

### Rollout

No migration. Existing `from`-less rules show no backlog and gain an explicit
`from` on first Post. Journals stay valid for plain ledger CLI; a user who
never posts keeps today's forecast-only behavior.

### Out of scope

Auto-post mode, notifications/reminders (later: cron on the same due-list
function), bank-import matching, a postpone state (inaction is postpone),
rule editing UI.
