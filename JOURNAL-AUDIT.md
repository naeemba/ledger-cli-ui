# Journal-vs-Code Audit

Audit of mismatches between the journal's actual conventions and what the app's
code assumes. Scope is correctness of displayed numbers, not enforcing textbook
account roots. Every numeric claim was reproduced by running `ledger` against a
full local copy of the production journal (11,727 lines, 2023–2025 Q4, plus
`price-db.ledger` definitions) using the app's exact flags (`--price-db`,
`--sort -date` where `runLedger` adds it).

Date: 2026-07-10.

## Journal conventions (baseline)

- **Debt netting:** `Assets:Credited:<Person>` — positive means they owe the
  user, negative means the user owes them. Net across all people: −$1,358.46.
  Valid "due to/from" accounts; net worth arithmetic is unaffected.
- **Single liability account:** `Liabilities:Loan` with a **positive** balance
  (KIRT 891.367). Loan installments including interest are posted against the
  principal account, so the balance drifted past zero. Unconventional but
  deliberate; no interest-expense split exists.
- **Equity adjustments:** `Equity:Opening:Balances` (opening entries) and
  `Equity:Fix:Balances` (balance corrections). Fixes bypass Income/Expenses.
- **Commodities:** 22 total. Default is `KIRT` (Iranian thousand toman, alias
  `Kirt`); `$` has alias `USD`; salary is paid in **BTC**; also €, ₺, ₾, gold
  coins (`Sekke`, `Nim`), and a dozen crypto tokens. Commodity definitions live
  in `price-db.ledger`, which `runLedger` always passes via `--price-db`.
- **No clearing workflow:** zero cleared (`*`) markers anywhere in the journal.
- **Layout:** year/quarter files chained by `include`; checked for overlap
  (2024.ledger vs 2024-08…12 monthly files) — none.

**Key ledger behavior driving several findings:** with `-X`, ledger injects
`<Adjustment>` postings (revaluation/rounding) into register output, and they
inherit the enclosing transaction's payee. Verified:
`reg ^Income --monthly -X USD` emits `<Adjustment>|$ 67,259.40` for 2025/05
(accumulated BTC salary marked to market). Manual reference: commodity/market
value conversion — <https://www.ledger-cli.org/3.0/doc/ledger3.html>.

## Findings

Direction legend: **clash** = code clashes with the journal's conventions
(wrong numbers today); **quirk** = code only works because of a journal quirk
(breaks for a conventional journal).

| # | Cat | View / code | What goes wrong (verified number) | Direction | Confidence | Fix that keeps the convention |
|---|-----|-------------|-----------------------------------|-----------|------------|-------------------------------|
| A1 ✅ | (a) | Cash Flow — `features/monthlyComparison/MonthlyComparison.utils.ts:23` — **FIXED** | `reg --monthly` emits one line **per account** per month (plus `<Adjustment>` lines); `map.set(date, …)` keeps only the last line, so each month's total is the alphabetically-last account. Nov 2025 expenses: true **$50.89 → shown $0.89**. May 2025 expenses: true **$5,026.27 → shown $0.70** (`Expenses:Wage`). Income side has the same shape. | clash (any multi-account journal; multi-commodity makes it worse) | High — ran the exact command | Sum per date (`+=`), add `%A` to the format and drop `<Adjustment>` rows |
| A2 | (a) | Net Worth chart — `features/netWorth/NetWorth.tsx:16`, `lib/netWorth/parse.ts` | Register emits 2–21 rows per month (counted: 13 for 2025/01, 21 for 2025/04). Every row becomes a chart point → duplicate month labels, intra-month running-total jitter, and `slice(-36)` keeps 36 **rows** ≈ only ~6–12 months instead of 36. The "Current" headline (last row) is correct. | clash | High | Keep only the last row per `%D` (or use `--collapse`) |
| A3 | (a) | Payees — `features/payees/Payees.tsx:37` + `lib/payees/parse.ts` | `<Adjustment>` postings carry real payees and are summed into payee totals (verified `supermarket\|$ 0.01` rows in May 2025). Small for KIRT rounding; BTC-priced months can be large. | clash (multi-commodity) | High | Emit `%A` in the format, filter `<Adjustment>` / `<Revalued>` |
| A4 | (a) | Reconcile — `features/reconcile/Reconcile.tsx:15` | `<Adjustment>` rows are counted as uncleared postings and rendered with account `<Adjustment>` (broken account drill-link), inflating the count. Also `-X` leaves pre-price-history amounts unconverted (2023 opening rows show raw `BTC 0.17`, `USDT 1,627.13`). | clash | High | Filter `<Adjustment>` rows |
| A5 ✅ | (a) | Dashboard "Highest Expense" — `features/dashboard/Dashboard.tsx:80` + `getHighestExpense` | The month register includes `<Adjustment>` account rows; one can win "Highest Expense This Month" (locally ±$0.01; BTC-heavy months larger). Month/year `%T` totals also absorb adjustments — that part is arguably correct valuation. | clash | Medium | ✅ FIXED — `getHighestExpense` skips `<...>` account rows |
| A6 | (a) | Fix-balance entry — `features/transactions/entry/types/fixBalance.ts:11` (`ADJUSTMENTS_ACCOUNT = 'Equity:Adjustments'`) | Journal convention is `Equity:Fix:Balances`; app-created fixes fork a second equity tree, so any register/report on the user's fix account misses them (net worth unaffected). | clash | High | Make the account a setting; default to an existing `Equity:*` adjustment account detected in the journal |
| A7 | (a?) | Portfolio — `features/portfolio/Portfolio.tsx:25`, env default `Assets:Investments` | Actual holdings live under `Assets:Crypto:*` ($1,617.03 in the local copy at stale local prices; more at prod prices) while `Assets:Investments` holds **$17.32**. If prod `PORTFOLIO_ACCOUNT_PREFIX` is unset, ~99% of holdings are invisible in Portfolio. Prod env could not be read (permission denied on container env dump) — **needs manual confirmation in Coolify**. | clash if env unset | Medium (env unverified) | Set the env var, or default the prefix to accounts holding non-base commodities |
| B1 | (b) | `parseAmount` in `lib/netWorth/parse.ts:3` and `MonthlyComparison.utils.ts:5` | `parts.length > 1 ? parts[1] : parts[0]` only parses prefix-rendered amounts (`$ 1,234`). Suffix or glued rendering (`1,234 EUR`, `€100`) yields NaN/0 → flat-zero charts. Works today only because the display base renders as `$ N`. A robust parser already exists (`utils/amountParts.ts` `parseAmountParts`) but is unused here. | quirk | High | Reuse `parseAmountParts` |
| B2 | (b) | Debts — `app/debts/page.tsx:20` | Positional slicing assumes output shape `[parent subtotal, …children, total]`; a journal with exactly one debtor collapses to a single row and the view drops it. The whole feature is keyed to the literal `Assets:Credited` root — a conventional journal (debts under `Liabilities:*`) shows nothing. | quirk | Medium | Filter rows by account prefix instead of position; make the root configurable |
| B3 | (b) | Balance page/export — `app/balance/page.tsx:16`, `app/api/balance/export/route.ts` | Unanchored patterns `Assets` / `Liabilities` (no `^`) match the substring anywhere in an account name. Harmless for this journal. | quirk | High | Anchor to `^Assets` / `^Liabilities` |
| B4 | (b) | Reconcile feature premise | The journal has **zero** cleared markers, so all ~11k postings are permanently "uncleared" and stale warnings are permanent noise. The feature assumes a clearing workflow the journal doesn't use. | clash (workflow) | High | Hide or de-emphasize the view when 0% of postings are cleared; show an onboarding hint |
| C1 | (c) | Balance page "Assets" row | `Assets\|$ 499.41` is net of −$1,358.46 of debts filed under `Assets:Credited` — any "gross assets" reading is off by that amount; net worth stays exact (this is the known netting-convention shape). The app never shows a separate "Total Liabilities" summary card, so no other subtotal is affected. | noted | High | Optional: badge netting accounts in the UI |
| C2 | (c) | Net Worth help text — `features/netWorth/NetWorth.tsx` | Copy says "Liabilities are recorded as negative" — false for this journal (`Liabilities:Loan` = +KIRT 891.367 because interest is folded into the principal account). Arithmetic unaffected; the copy is wrong. | noted | High | Reword the help text |
| C3 | (c) | Cash flow vs net worth | `Equity:Fix:Balances` write-offs bypass Income/Expenses, so cash-flow savings will never reconcile with net-worth deltas. Inherent to the convention, not an app bug. | noted | High | — |
| C4 | (c) | Commodity definitions in `price-db.ledger` | `$`↔`USD` and `KIRT`↔`Kirt` only unify because `runLedger` always passes `--price-db` (post-PR-#77 layout). Fragile if the definitions ever move out of that file. | noted | High | — |

## Coverage report

**Scanned:** all 33 `runLedger` call sites — dashboard (3 + stats + recent),
net worth, balance page, periodic balance, debts, payees, reconcile, accounts
(tree + single-account register), monthly registers, portfolio (2), entry
actions (`getAccountBalance`), settings (`commodities`, missing-rate detection,
suggestions), and the 8 CSV export routes (net-worth, balance, periodic
balance, debts, payees, reconcile, portfolio, accounts). Parsers:
`lib/netWorth/parse.ts`, `lib/balance/parse.ts`, `lib/payees/parse.ts`,
`features/reconcile/Reconcile.utils.ts`, `utils/amountParts.ts`,
`lib/settings/parseUnconverted.ts`. Entry type system: `accountRole.ts`,
`fixBalance.ts`, `transfer.ts`, type-form placeholder accounts. Env defaults in
`lib/env/index.ts`.

**Journal:** full local copy of the production user's journal under
`data/journals/` (11,727 lines, 2023–2025 Q4, `price-db.ledger` with commodity
definitions). Verified include layout, account roots, sign usage, commodity
formats, cleared-marker usage, and the 2024 file-split for double counting.

**Not verified:**

- Production env vars — container env dump was denied; finding A7 needs a
  manual check of `PORTFOLIO_ACCOUNT_PREFIX` in Coolify.
- Production journal bytes in Garage object storage (not present on the
  container filesystem); assumed equivalent to the local copy of the same
  user's data.
- `features/activity` (audit log UI — no ledger math).
- Price-fetch pipeline (covered by the separate LEDGER-AUDIT.md work).

**Highest impact:** A1 (cash-flow chart numbers are effectively garbage every
month), A2 (net-worth chart window and jitter), A7 (portfolio possibly missing
all crypto — one env var to confirm).
