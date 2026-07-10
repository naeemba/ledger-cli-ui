# Ledger Reimplementation Audit — 2026-07-10

Full-codebase audit for application logic that reimplements in JS/TS what the
`ledger` CLI can compute directly. Principle: **ledger does the accounting
math; app code only orchestrates ledger, parses its output, and handles what
ledger genuinely cannot (DB provenance, auth, formatting, HTTP).**

Reference bug that motivated the audit (already fixed in PR #83):
`lib/prices/knownPrices.ts` `latestGenuinePrice` + `lib/prices/service.ts`
`listKnownPricesInBase` picked "latest price" by array position instead of
asking ledger to value it.

Scope: 856 TS/TSX files discovered; 205 excluded as stale `.claude/worktrees/`
copies; the remaining **651 files all scanned** (18 domain buckets, zero
overlap, zero unassigned). Every finding below was verified by actually
running ledger 3.4.1 (`3.4.1-20251025`, Homebrew) against synthetic
multi-commodity journals — commands and outputs, not memory. **Findings pass
only — no fixes applied yet.**

Result: **15 confirmed reimplementations** (3 high), **4 unavoidable
selections** (documented, leave as-is), 2 scan claims refuted during
verification.

---

## Remediation status — 2026-07-10

Legend: ✅ fixed (one commit each, `pnpm type-check`/`lint`/`test` green;
ledger replacements verified against ledger 3.4.1 on synthetic journals)·
⏸️ deferred (needs a design decision or carries risk out of proportion to
payoff — left for a deliberate follow-up).

**Fixed (8):** #4 portfolio total · #5 payees · #6 dashboard month/year ·
#7 cash-flow net · #8 portfolio CSV split · #11 reconcile sort ·
#12 cash-flow window/sign · #13 net-worth window.

**Deferred (5), with reasons:**

- **#1–#3 (the balancing trio, high).** The correct fix is a debounced
  *server-side* ledger check that becomes the authority for submit/save while
  the JS stays for instant per-keystroke feedback — a feature with its own
  UX/latency design, not a mechanical swap. Left intact pending that design.
- **#9 fiat-USD pivot.** The audit itself calls the raw-two-`P`-directive
  approach "a design decision, not a drop-in": it changes the prices UI and
  the manual-price-precedence data model, for "low divergence risk in
  practice". Not worth a unilateral product change; needs the owner's call.
- **#10 transaction magnitudes.** The whole transactions list is JS-parsed
  (`parseJournalFile`) — ledger is not in that path at all. A register
  replacement means a new ledger run joined back on `(file, beg_line)`, with
  real line-number-alignment risk (include files, `<Revalued>` rows) for a
  purely cosmetic, display-only value. Not a safe unattended change.

The 4 "unavoidable selection" items below are intentionally left as-is per the
audit's own verification.

---

## Confirmed reimplementation — act

### High — transaction write/validation path can accept/reject data differently than ledger

| # | Location | What JS computes | Verified ledger replacement | Risk |
|---|----------|------------------|-----------------------------|------|
| 1 ⏸️ | `lib/transactions/balance.ts:15` `computeBalance` | Full balancing algorithm: per-currency float sums, `@@` cost bridging, assertion-posting exclusion, `1e-9` epsilon | `ledger -f - balance` on the formatted draft; stderr `Unbalanced remainder is:` is the authoritative verdict (verified on stdin) | Verified two-way divergence: JS excludes assertion-only postings (`= USD 500`) that ledger treats as balance assignments; JS fixed epsilon vs ledger's per-commodity display precision — each side accepts drafts the other rejects |
| 2 ⏸️ | `lib/transactions/schema.ts:111` `transactionDraftSchema` superRefine | Copy-pasted duplicate of #1, gating **server-side saves** | Ledger-backed validation before write (`lib/journal/service.ts` already shells out at :144/:383) | Same divergences as #1, at the exact point where data gets persisted |
| 3 ⏸️ | `features/transactions/entry/types/extraItems.ts:47` `balancingPostings` | Sums the residual per currency in floats and writes explicit balancing amounts into the journal | Emit a single amount-less posting and let ledger elide it (verified: absorbs multi-commodity residuals and cost annotations; `fixBalanceAdapter` already does this) | A float-computed amount written to the journal can differ from the exact residual; ledger then rejects the transaction or reports an imbalance |

Downstream consumers of #1 (same root cause, fix together):
`features/transactions/entry/TransactionEntry.tsx:144` canSubmit gate,
`features/transactions/entry/FormLens.tsx:214-243` BalanceIndicator residual
display, and the adapters' `detect()` in `expense.ts:85` / `income.ts:91` /
`transfer.ts:86` / `exchange.ts:102`.

Caveat: these run client-side per keystroke where shelling out is impossible —
keep the JS for instant feedback, but make a debounced server-side ledger
check the authority for submit/save.

### Medium — report/display values can diverge from ledger output

| # | Location | What JS computes | Verified ledger replacement | Risk |
|---|----------|------------------|-----------------------------|------|
| 4 ✅ | `features/portfolio/parsePortfolio.ts:65` `extractTotal` | Grand total = last non-empty output line | `balance <prefix> -X CCY --depth 1 --format '%A\|%T\n'`, take the prefix-anchored row | Reproduced live: one unpriced commodity makes the Portfolio header show `100 XYZ` as the Total (USD) figure |
| 5 ✅ | `lib/payees/parse.ts:16` `parsePayeeRows` (+ `app/api/payees/export/route.ts:23`, `features/payees/Payees.tsx:50` grandTotal) | Per-payee sums via float Map, filter > 0, sort descending | `reg ^Expenses --by-payee --collapse -X <base> --sort '-display_amount'` — verified: one converted row per payee, correct descending order, no adjustment contamination. **Do not use `-P` without `--collapse`: it segfaults (see gotchas)** | Float drift; `parseAmount`'s token-guessing coerces unexpected shapes to 0. Bonus bug: the `Commodities revalued` pseudo-payee is rendered as a real payee on the page and in the CSV export |
| 6 ✅ | `features/dashboard/Dashboard.tsx:95` | Month/year expense totals = `lastNonEmptyLine` of a periodic register's `%T` column | `bal ^Expenses -p 'this month' -X <ccy> --collapse --format '%T\n'` (single-line output, verified; same for 'this year') | `%T` accumulates in processing order; `<Revalued>` rows plus the default `--sort -date` make last-row-position fragile |
| 7 ✅ | `lib/monthly/csv.ts:22` `cashFlowRowsToCsv` + `features/monthlyComparison/MonthlyComparison.tsx:66` | `net = income − expenses` float subtraction over two separate ledger runs | A single register can emit per-month net, but it needs `--collapse` plus format-level negation — bare `--invert` emits per-account rows, and `--invert --collapse` double-counts on 3.4.1 | Cent-level float drift; a month whose amount fails to parse defaults to 0 silently; CSV and table code paths can diverge |
| 8 ✅ | `lib/portfolio/csv.ts:16` `splitNative` | Regex re-decomposes a rendered amount string into (quantity, commodity) | `--format '%A\|%(quantity(scrub(display_total)))\|%(commodity(scrub(display_total)))\n'` (verified: emits `2335\|$`, `0.09\|BTC`, `5\|AAPL`) | The misparse reproduces on real production data — the price-db forces commodity-prefix rendering for BTC and KIRT |
| 9 ⏸️ | `lib/prices/provider.ts:87` `fetchPricesUsd` | Fiat USD rate composed in JS via the tether pivot: `tetherUsd / perFiat` | Emit the raw quotes as two `P` directives (`P <date> USDT <tetherUsd> USD` and `P <date> USDT <perFiat> <FIAT>`) and let `-X USD` bridge (verified: identical valuation) | Low divergence risk in practice; but raw-quote storage changes the prices UI and manual-price-precedence data model — a design decision, not a drop-in |
| 10 ⏸️ | `lib/transactions/model.ts:299` `magnitudesByCurrency` (rendered in `features/transactions/TransactionRowItem.tsx:38`) | Positive posting sums per currency, float addition + `toFixed(2)` | A register keyed on `xact.beg_line` reproduces the values (verified; the `tag("uid")` variant fails because `:uid:` is flag-tag syntax) | Display-only; skips elided-amount postings and `@@` costs, hardcodes 2 decimals |

### Low — order/perf only, values already come from ledger

| # | Location | Issue | Fix |
|---|----------|-------|-----|
| 11 ✅ | `features/reconcile/Reconcile.utils.ts:28` `parseReconcileRows` | `Reconcile.tsx` disables runLedger's sort (`sortByDate: false`) then re-sorts ascending in JS | Pass `--sort date` to the register call; delete the `.sort()` (keep the `days` computation — it needs wall-clock now) |
| 12 ✅ | `features/monthlyComparison/MonthlyComparison.utils.ts:34` `getCashFlow` | JS income sign flip, fetch-all-history, `.slice(-36)` windowing | `--invert` on the income run + `-p 'last 36 months'`. Semantic note: `slice(-36)` keeps the last 36 months-with-data while `-p` is a calendar window — the calendar window is arguably the intended behavior |
| 13 ✅ | `features/netWorth/NetWorth.tsx:29` | Fetch-all-history + `.slice(-36)` | `--display 'date>=[cutoff]'` — NOT `-b`: the `%T` running total must accumulate from journal start (verified identical values) |

---

## Unavoidable selection — leave, documented

JS selecting among ledger's emitted rows where ledger has no single-answer
query. Verified by attempting (and failing) the candidate replacements.

- `features/dashboard/Dashboard.utils.ts:4` `getHighestExpense` — the obvious
  replacement `--sort '-amount' --head 1` fails when actually run: `--head` is
  a no-op under `--monthly` grouping, and `-amount` sorts pre-conversion
  commodities. The JS max-scan stays.
- `features/prices/PriceHistoryView.tsx:26` — `points.at(-1)?.quote` picks the
  chart's quote commodity by array position — the exact shape of the reference
  bug. No ledger query replaces it (`-V` returns the stale cross-quote,
  verified), but it is actionable internally: reuse `latestGenuinePrice` so
  `/prices` and `/prices/[symbol]` agree on the current quote.
- `lib/prices/knownPrices.ts:100` `latestGenuinePrice` — the reference case
  itself: the set-date and original-quote views genuinely need JS (ledger's
  `value_date` is the report date, not the price's set-date — re-confirmed).
  Consider shrinking its authority to date/staleness and original-quote
  display only. Side note: the comment at lines 92–95 claims `ledger prices`
  forward-carries the prevailing price onto later posting dates; this did not
  reproduce in a direct test.
- `lib/settings/parseUnconverted.ts:27` — both candidate single-query
  replacements fail on 3.4.1: `--format '%(commodity(display_total))'` errors
  with `Cannot convert a balance with multiple commodities to an amount`, and
  the alternative errors outright on journals with @-cost postings. Keep the
  regex row-selection.

---

## Refuted during verification

- Payees via `reg ^Expenses -P -X <base>`: **segfaults ledger
  3.4.1-20251025** (exit 139, reproduced repeatedly on multi-commodity
  journals; `runLedger` uses `execFile`, so this would be a production error).
  The `--by-payee --collapse` variant works cleanly, which is why finding #5
  survives with that command. The `%T`-based grandTotal variant was only
  tested on the crashing command; with `--collapse` a trivial sum of the
  displayed rows (presentation) or a `%T` third column both remain options.

---

## Ledger 3.4.1 gotchas discovered (all verified)

- `reg -P -X <ccy>` segfaults on multi-commodity journals; adding
  `--collapse` avoids the crash.
- `--sort '-amount'` under `-X` compares pre-conversion commodities; use
  `--sort '-display_amount'` to rank by the converted value.
- `--head` is a no-op under `--monthly` grouping.
- `ledger print` does **not** materialize elided amounts (with or without
  `--explicit`); only register formats expose the generated postings.
- `--invert --collapse` double-counts on grouped registers.

---

## Coverage

856 TS/TSX files discovered → 205 excluded (stale `.claude/worktrees/`
copies) → 651 partitioned into 18 buckets → **651 scanned = 651 in scope**.
447 files were logged skipped-with-reason inside their buckets (pure
presentational, type-only, test, static config) but each was individually
accounted for. Test files were read for intent only; all findings target
production code.

| Bucket | Files | Findings | Bucket | Files | Findings |
|---|---|---|---|---|---|
| prices | 47 | 3 | accounts-payees | 40 | 3 |
| settings | 54 | 1 | components-misc | 40 | 0 |
| transactions-feature-1 | 42 | 3 | savedviews-currencies | 39 | 0 |
| transactions-feature-2 | 41 | 3 | transactions-lib | 39 | 3 |
| storage-db-audit | 41 | 0 | auth-security | 38 | 0 |
| reports-balances | 37 | 7 | journal-core | 36 | 0 |
| crypto-lib | 34 | 0 | crypto-portfolio | 33 | 2 |
| utils-lib-misc | 31 | 0 | api-routes-app | 26 | 1 |
| components-ui | 24 | 0 | misc-root | 9 | 0 |

26 raw findings → 25 after cross-bucket dedup → all 25 adversarially verified
with real ledger runs (none dropped by the verification cap).

**Biggest single win: the transaction-balancing trio (#1–#3) — one root
cause, three sites, and the only cluster where divergence corrupts what gets
written rather than what gets displayed.**
