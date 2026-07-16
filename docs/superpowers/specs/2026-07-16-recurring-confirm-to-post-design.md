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

A rule remains a `~` directive. The period expression is immutable (it
carries the schedule anchor); occurrence state is a single `:handled:`
comment line recording the last handled occurrence date. There is no
occurrence table, no database state.

```
~ every 1 months from 2026/01/05
    ; :uid: 01ABC...
    ; :handled: 2026-07-05
    ; Netflix
    Expenses:Subscriptions:Netflix  USD 15.00
    Assets:Checking
```

- **Expansion floor**: occurrences strictly after `:handled:` are unhandled.
- **Create**: the anchor is stored as given; `:handled:` is initialized to
  the last occurrence before today (or omitted when the anchor is in the
  future), so new rules never show a backlog. The anchor never changes, so
  "the 31st" survives February instead of being clamped away by a bump.
- **Post**: write a real transaction dated on the due date through the
  existing add path, plus a provenance comment `; :recurring: <rule-uid>`
  (no logic depends on it), then set the rule's `:handled:` line to the
  posted occurrence date. Both edits in one write, one `ledger stats`
  verify, one push; rollback both on failure.
- **Skip**: the `:handled:` update only, no transaction.
- Plain ledger CLI ignores the comment lines, so the journal stays fully
  portable; its own `--forecast` remains approximate (boundary snapping),
  which it already is today.
- Concurrency: rule fingerprint (existing sha256 mechanism) is required by
  Post/Skip; the first successful action changes it, so double-clicks and
  replays fail as stale. Oldest-first is enforced server-side: an action whose
  due date is not the rule's oldest unhandled occurrence is rejected.

### Due-list query — JS computes occurrence dates, ledger keeps all money

Empirical findings against ledger 3.4.1 (2026-07-16, synthetic journals):

- `--forecast` never emits occurrences before "now", even on a rules-only
  journal; `--now <date>` backdates generation but the anchor period itself
  is skipped.
- Date anchors are ignored: `Monthly from 2026/05/05` fires on the 1st;
  `every 2 weeks from <a Friday>` fires on Sundays (calendar-boundary
  snapping); `every 30 days` keeps day arithmetic but drifts across months.

Ledger therefore cannot produce "the 5th of every month" — the calendar
behavior this feature exists to deliver. Occurrence **dates** are computed in
JS instead. This is within the project's HARD RULE: CLAUDE.md's allowed list
explicitly includes dates; recurrence scheduling contains no money. Amounts
are the rule's postings verbatim (never summed or converted in JS), rule
validity remains `ledger stats`, and every report stays ledger-computed.

Consequences:

1. The /recurring form replaces the freeform period input with a structured
   schedule: interval unit (day/week/month/year), interval count N, anchor
   date — serialized to `~ every N <unit>s from <anchor>` so the journal
   stays valid and portable for plain ledger CLI (which will forecast it
   with its own boundary quirks). Existing freeform rules that don't parse
   into that grammar are listed and deletable but show "unsupported
   schedule" instead of occurrences.
2. A pure function `expandSchedule(schedule, fromDate, throughDate)` returns
   occurrence dates: month arithmetic anchored to the anchor's day-of-month
   (clamping to short months, e.g. the 31st in February → Feb 28/29),
   week/day arithmetic as plain day steps, year arithmetic anchored to
   month+day.
3. Due list = per rule, occurrences from `expandSchedule(schedule, anchor,
   today + 30 days)` that are strictly after `:handled:` (all of them when
   no `:handled:` exists); dates <= today are due/overdue (actionable),
   later dates are the read-only upcoming preview. This replaces
   `getUpcomingBills` as the widget's single source.

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

### Resolved empirical preconditions

The original design deferred two ledger 3.4.1 checks; both ran on 2026-07-16
and both failed (see findings above). Two consequences: occurrence dates
moved to JS, and the state mechanism changed from bumping the period's
`from` (which would have destroyed the anchor day the JS expansion needs)
to the immutable-anchor + `:handled:` comment model described in the data
model section.

### Testing

End-to-end against real ledger, existing test style:
- The two gotcha-pinning tests above.
- Service: post writes transaction + tag + `:handled:` update atomically;
  skip updates `:handled:` only;
  stale fingerprint rejected; non-oldest occurrence rejected; ledger-rejected
  rewrite rolls back both edits; quota respected.
- Expansion: multi-currency, multiple rules, overdue vs upcoming bucketing,
  creation-time `:handled:` initialization (no backlog on new rules).
- Parser: the `:recurring:` comment line survives
  `parseJournalFile`/`formatTransaction` round-trips.

### Rollout

No migration. Existing structured-parseable rules without `:handled:` show
no backlog (floor defaults to today at expansion time) and gain a
`:handled:` line on first Post/Skip; freeform rules that don't parse into
the structured grammar are listed as "unsupported schedule" (still
deletable, still forecast by plain ledger CLI). A user who never posts
keeps today's behavior.

### Out of scope

Auto-post mode, notifications/reminders (later: cron on the same due-list
function), bank-import matching, a postpone state (inaction is postpone),
rule editing UI.
