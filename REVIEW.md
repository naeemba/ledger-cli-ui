# Full application review — 2026-07-03

> ## ⚙️ Working protocol for agents — read this first
>
> This document is worked through incrementally by multiple agents. To avoid
> collisions and keep progress visible, **follow this loop exactly**:
>
> 1. **Pick the next item.** Take the highest-priority item that is not marked
>    `✅ DONE` or `🚧 IN PROGRESS`, following the *Suggested implementation
>    order* below (A → B → … → I, in number order within each workstream).
>    Respect the dependency notes — some items share one fix or must land in a
>    specific order.
> 2. **Claim it.** Set the item's status line to `🚧 IN PROGRESS` before you
>    start, so a parallel agent doesn't take the same item.
> 3. **Fix one item at a time.** Use TDD: write a failing test, make it pass,
>    keep the whole suite green (`npx vitest run`), typecheck (`npx tsc
>    --noEmit`), and lint (`npx eslint`).
> 4. **Mark it done here.** Update the item's status line to
>    `✅ DONE — PR #<n> (<branch>) — <date>` **in the same PR** as the fix, so
>    the doc and the code move together.
> 5. **One PR per item.** Commit, push, open a PR whose title references the
>    item id (e.g. `fix(review): A1 …`). Keep the diff scoped to that item.
> 6. **Log it** in the Progress log table directly below.
>
> Status legend: `⬜ TODO` (default, unmarked) · `🚧 IN PROGRESS` · `✅ DONE`.
> An item with no status line is `⬜ TODO`.
>
> ### Progress log
>
> | Item | Status | PR | Branch | Date |
> |---|---|---|---|---|
> | A1 | ✅ DONE | [#62](https://github.com/naeemba/ledger-cli-ui/pull/62) | `fix/review-a1-edit-cost-assertion` | 2026-07-03 |
> | A2 | ✅ DONE | [#63](https://github.com/naeemba/ledger-cli-ui/pull/63) | `fix/review-a2-template-cost-assertion` | 2026-07-03 |
> | A3 | ✅ DONE | [#65](https://github.com/naeemba/ledger-cli-ui/pull/65) | `refactor/txn-model-consolidation` | 2026-07-04 |
> | A4 | ✅ DONE | [#65](https://github.com/naeemba/ledger-cli-ui/pull/65) | `refactor/txn-model-consolidation` | 2026-07-04 |
> | G3 | ✅ DONE | [#65](https://github.com/naeemba/ledger-cli-ui/pull/65) | `refactor/txn-model-consolidation` | 2026-07-04 |
> | A5 | ✅ DONE | [#66](https://github.com/naeemba/ledger-cli-ui/pull/66) | `fix/review-a5-template-blank-rows` | 2026-07-05 |

A complete, implementation-ready review of ledger-cli-ui covering performance, correctness, error handling, architecture, UX consistency, and dead code. **Security was deliberately excluded** (covered by a separate review). Test files were not reviewed.

## How this review was produced

The codebase (~412 source files) was reviewed by ten independent reviewers, one per dimension: server performance, client rendering performance, bundle size & server/client boundaries, Next.js correctness, data layer, logic bugs, error handling, architecture/duplication, dead code, and UX consistency. Every reported finding was then checked by an **independent adversarial verifier** instructed to refute it by reading the actual code — findings that could not be confirmed were dropped. A completeness critic then identified two uncovered areas (the templates lifecycle and the base-currency/price-DB coupling), which received their own verified gap reviews.

- Raw findings reported: 89 · **Confirmed by verification: 83** (after removing cross-dimension duplicates) · Refuted: 1 (listed at the end)
- Confirmed severity mix: **10 high · 38 medium · 35 low** (no critical — nothing found that corrupts the journal itself)
- After merging cross-dimension duplicates: **76 work items** in 9 workstreams

Each item below is self-contained: location, problem, code evidence, a concrete fix, and the verifier's notes. **Read the verifier notes before implementing** — several contain corrections to the suggested fix (e.g. B3's `let` binding, H9's UTC parsing caveat, F1's ref-pattern requirement).

## Suggested implementation order

| Order | Workstream | Items | Why this position |
|---|---|---|---|
| 1 | A. Data integrity & correctness | 14 | Wrong/lost financial data; contains all four cost/assertion-stripping bugs which share one fix |
| 2 | B. Concurrency & globalThis | 5 | Mostly S-effort, unblocks the price pipeline; B5 causes silent loss of price data today |
| 3 | C. Prices & base currency | 8 | Depends on B1/B5; ends the "wrong-currency valuations for 24h" class |
| 4 | D. Error handling | 6 | Makes later work observable — failures currently masquerade as zeros and empty lists |
| 5 | E. Server performance | 9 | Halves latency on the most-clicked drill-down pages |
| 6 | F. Client performance & bundle | 7 | Transaction-entry responsiveness and first-load JS |
| 7 | G. Architecture refactors | 9 | Do after A/E fixes touching the same files (A9, A13, E1) so extraction moves corrected code |
| 8 | H. UX consistency | 9 | Independent; can run in parallel with anything |
| 9 | I. Dead code | 9 | Mechanical deletions; anytime |

Dependency notes for implementers:
- **A1–A4 share one root cause.** Build a single tested `posting ↔ draft` converter that round-trips `cost`/`assertion`, then use it in EditTransaction, both save-as-template paths, and template hydration.
- **G1 (thin-shell extraction) touches the same files as A9, A13, E1.** Land those fixes first, or fold them into the per-route extraction commits.
- **G3 (parser consolidation) is the natural home for A7–A8.** If you consolidate parsers first, fix the token-order and syntax gaps in the shared implementation.
- **B5 and C1–C3 interact.** The price DB lifecycle (regenerate → push → pull) must be settled before the base-currency-change flow can be correct.


---

## A. Data integrity & correctness bugs

These produce wrong or lost financial data and come first. The largest cluster is the silent stripping of `@@` cost and `=` balance-assertion annotations: the same converter defect exists independently on the edit page, both save-as-template paths, and template hydration — fix them together, ideally by introducing one shared posting↔draft converter that round-trips cost/assertion and is unit-tested (A1–A4 plus the two template UX items A5–A6). The parser items (A7–A8), the period/date items (A9–A10), and the amount-precision items (A11–A12) are independent of each other.

### A1. Edit page strips cost/assertion annotations, making such transactions permanently uneditable (false 'stale')

**Status:** ✅ DONE — [PR #62](https://github.com/naeemba/ledger-cli-ui/pull/62) (`fix/review-a1-edit-cost-assertion`) — 2026-07-03. Fixed at the root: the fingerprint is now computed from a **single source** (the parser). `EditTransaction` passes `tx.fingerprint` straight through as `expectedFingerprint` instead of re-hashing a reconstructed draft, and both concurrency guards in `service.ts` (edit + delete) compare against the parser-stamped `current.fingerprint` instead of recomputing it — so `fingerprintDraft` now has exactly one production caller (`parser.ts`) and no lossy reconstruction can ever diverge from it. Also extracted a pure `transactionToDraft(tx, defaultCurrency)` helper (`features/transactions/entry/transactionToDraft.ts`) that carries `cost`/`assertion` into the edit-form seed so annotations display and round-trip through an unchanged save; `transactionToDraft.test.ts` pins that seed faithfulness (`fingerprintDraft(draft) === tx.fingerprint`). The helper is intended for reuse by A2–A4.

**Severity:** HIGH · **Effort:** S (<1h) · **Location:** `features/transactions/EditTransaction.tsx:30`

initialDraft maps postings to only {account, amount, currency}, discarding the parsed `cost` (`@@`) and `assertion` (`=`) annotations. expectedFingerprint is then computed from this stripped draft, while JournalService.performEdit (lib/journal/service.ts:420-434) computes the current fingerprint from the fully parsed postings — fingerprintDraft hashes formatTransaction output, and formatPosting emits ` @@ CUR AMT` / `= CUR AMT` when those fields are present. The two hashes can never match, so every edit of a transaction containing a cost or balance assertion fails with 'This transaction was modified somewhere else.' Even if the guard were bypassed, saving would silently drop the @@ /= annotations from the journal.

```
postings: tx.postings.map((p) => ({
      account: p.account,
      amount: p.amount,
      currency: p.currency || defaultCurrency,
    })),
```

**Fix:** Carry cost and assertion through: `postings: tx.postings.map((p) => ({ account: p.account, amount: p.amount, currency: p.currency || defaultCurrency, ...(p.cost ? { cost: p.cost } : {}), ...(p.assertion ? { assertion: p.assertion } : {}) }))` (mirroring parsedBlockToDraft.ts). Add a regression test asserting fingerprintDraft(initialDraft) equals the parser's tx.fingerprint for a transaction with @@ and = postings.

> **Verifier notes** (independent adversarial check, confidence: high): Confirmed. EditTransaction.tsx:30-34 strips cost/assertion from initialDraft; parser's ParsedPosting carries them (parser.ts:30-31) and performEdit (service.ts:420-434) fingerprints current.postings with them. formatPosting (schema.ts:166-172) emits '@@' and '=' when present, so fingerprintDraft outputs differ whenever a cost or assertion exists, making the stale guard always fire. The app's own exchange type form creates cost annotations (entry/types/exchange.ts:51), so this breaks editing of app-created transactions, not just hand-written ones. parsedBlockToDraft.ts:25-26 already shows the correct mapping. Severity high and fix are accurate.

### A2. Save-as-template from a transaction row silently drops @@ cost and = assertion annotations

**Status:** ✅ DONE — [PR #63](https://github.com/naeemba/ledger-cli-ui/pull/63) (`fix/review-a2-template-cost-assertion`) — 2026-07-03. `TransactionRow`'s posting shape now carries optional `cost`/`assertion` (`features/transactions/transactionRow.ts`), and both `toTransactionRow` and `toTemplateDraft` pass the annotations through, so a `@@`-balanced multi-currency transaction saved as a template hydrates back into a balanced, submittable draft. `toTemplateDraft` was moved out of the `RowActions` client component into the pure `transactionRow` module so it is unit-testable; `transactionRow.test.ts` pins cost and assertion round-tripping through both mappers. (A1's `transactionToDraft` covers the edit path; A3/A4 remain for the live-draft save and template-hydration hops.)

**Severity:** HIGH · **Effort:** M (half day) · **Location:** `features/transactions/RowActions.tsx:27`

postingSchema (lib/transactions/schema.ts:91-92) declares optional `cost` and `assertion` fields and templateDraftSchema reuses postingSchema, so templates can legally carry these annotations. But toTemplateDraft maps postings to only {account, amount, currency}, so saving a transaction containing `@@` cost or `=` assertion postings as a template silently loses them. For a multi-currency transaction balanced via `@@` cost, the resulting template hydrates into a draft that fails computeBalance (postings no longer sum to zero per currency), leaving the Save buttons disabled — the template is unusable for its primary purpose without manual repair in the raw tab. Root cause is upstream: TransactionRow itself strips the fields (features/transactions/transactionRow.ts:7 `postings: Array<{ account: string; amount: string; currency: string }>`), so the row type must be widened too.

```
postings: t.postings.map((p) => ({
    account: p.account,
    amount: p.amount,
    currency: p.currency,
  })),
```

**Fix:** Widen TransactionRow's posting shape to include optional cost/assertion (features/transactions/transactionRow.ts) and pass them through in both toTransactionRow and toTemplateDraft, e.g. `cost: p.cost, assertion: p.assertion`.

> **Verifier notes** (independent adversarial check, confidence: high): Confirmed. Parser postings carry optional cost/assertion (lib/journal/parser.ts:30-31), but TransactionRow (features/transactions/transactionRow.ts:7) and toTemplateDraft (features/transactions/RowActions.tsx:27-31) both strip them, while templateDraftSchema (lib/templates/schema.ts, reuses postingSchema) legally stores them. Downstream impact verified: computeBalance/canSubmit (TransactionEntry.tsx:144-150, entry/balance.ts:20-29) rely on p.cost for @@-balanced multi-currency transactions, so the hydrated template is unbalanced and the Save buttons stay disabled. Additionally, assertion-only postings degrade into blank-amount auto-balance postings, silently changing semantics. Suggested fix (widen TransactionRow posting shape and pass fields through both mappers) is correct.

### A3. Save-as-template from the entry form also strips cost/assertion from the live draft

**Status:** ✅ DONE — PR #65 (`refactor/txn-model-consolidation`) — 2026-07-04. Closed as part of the Txn model consolidation (P2): the entry-form "save as template" now routes through `draft.toTemplate()` (`lib/transactions/model.ts`), which carries `@@` cost / `=` assertion annotations, so a cost-balanced multi-currency draft saves as a balanced, submittable template. Supersedes the standalone fix in PR #64 (`draftToTemplateDraft`), which can be closed.

**Severity:** HIGH · **Effort:** S (<1h) · **Location:** `features/transactions/entry/TransactionEntry.tsx:156`

DraftPosting (features/transactions/entry/draftReducer.ts:3-9) carries optional `cost` and `assertion`, and the raw/form lenses can populate them. When building the TemplateDraft passed to SaveAsTemplateButton, TransactionEntry maps each posting to only account/amount/currency, so a draft entered with `@@` cost or `=` assertion annotations is saved as a template without them — a second independent stripping site beyond RowActions. Same downstream effect: a cost-balanced multi-currency template rehydrates into an unbalanced, unsubmittable draft.

```
postings: draft.postings.map((p) => ({
      account: p.account.trim(),
      amount: p.amount.trim(),
      currency: p.currency.trim(),
    })),
```

**Fix:** Include the annotation fields in the mapping: `cost: p.cost, assertion: p.assertion` (templateDraftSchema already accepts them via postingSchema).

> **Verifier notes** (independent adversarial check, confidence: high): Confirmed. features/transactions/entry/TransactionEntry.tsx:156-160 maps draft postings to only account/amount/currency when building templateDraft, while DraftPosting (entry/draftReducer.ts:3-9) carries cost/assertion and the RawLens populates them via the journal parser. templateDraftSchema already accepts the fields, so the suggested one-line fix (include cost/assertion in the mapping) is correct and independent of the RowActions fix.

### A4. Template hydration in NewTransaction re-strips cost/assertion from stored drafts

**Status:** ✅ DONE — PR #65 (`refactor/txn-model-consolidation`) — 2026-07-04. `NewTransaction` template hydration now uses `Txn.fromTemplate(t.draft, cur).toWire('create')` instead of an inline posting map, so stored `cost`/`assertion` annotations survive the hydration hop.

**Severity:** LOW · **Effort:** S (<1h) · **Location:** `features/transactions/NewTransaction.tsx:44`

When a templateId resolves, NewTransaction rebuilds the initial draft by mapping stored postings to only {account, amount, currency}. templateDraftSchema permits `cost`/`assertion` on stored postings (it reuses postingSchema), and TransactionEntry's DraftPosting supports both fields, so even once the save-side stripping bugs are fixed, this second layer would discard the annotations again at hydration time. Currently latent (no writer persists the fields), but it makes the pipeline lose data at every hop and must be fixed together with the writers or the fix is invisible.

```
postings: t.draft.postings.map((p) => ({
          account: p.account,
          amount: p.amount,
          currency: p.currency || defaultCurrency,
        })),
```

**Fix:** Spread the stored posting and only override currency: `postings: t.draft.postings.map((p) => ({ ...p, currency: p.currency || defaultCurrency }))`.

> **Verifier notes** (independent adversarial check, confidence: high): Confirmed as code fact: features/transactions/NewTransaction.tsx:44-48 rebuilds initialDraft postings with only account/amount/currency, discarding cost/assertion that templateDraftSchema permits and DraftPosting supports. However, the finding itself admits it is latent — no current UI writer persists the fields (findings 0/1 strip them first), and templates can only gain annotations via direct action calls. No user-visible impact until the writers are fixed, so severity is low, not medium; it should simply be fixed in the same change set. Suggested spread fix is correct (formatPosting ignores currency on assertion-only postings, so the currency-default override is safe).

### A5. Blank filler posting rows make 'Save as template' fail with an opaque 'Validation failed.' message

**Status:** ✅ DONE — [PR #66](https://github.com/naeemba/ledger-cli-ui/pull/66) (`fix/review-a5-template-blank-rows`) — 2026-07-05. Fixed at the single template builder: `Transaction.toTemplate()` (`lib/transactions/model.ts`) now drops postings whose account is blank, so the saved shape matches the postings `canSaveTemplate` counted — a two-filled-rows draft with a leftover blank scaffold row saves cleanly instead of returning an opaque `Validation failed.`. As a defensive fallback, `SaveAsTemplateDialog` now surfaces `fieldErrors` via a new pure `saveTemplateErrorMessage(result)` helper (`features/templates/saveTemplateError.ts`) that appends the distinct field messages to the base message, so any remaining validation failure names its cause. Regression tests: `model.test.ts` pins blank-row dropping; `saveTemplateError.test.ts` pins the message composition.

**Severity:** MEDIUM · **Effort:** S (<1h) · **Location:** `features/transactions/entry/TransactionEntry.tsx:162`

canSaveTemplate only requires >=2 postings with non-empty accounts, but the templateDraft built at line 156 includes ALL draft postings — including blank rows left over from 'Add posting' or the default two-row scaffold. accountSchema requires min length 1, so saveTemplateAction returns { reason: 'invalid', message: 'Validation failed.', fieldErrors: { 'draft.postings.N.account': 'Account is required' } }. SaveAsTemplateDialog only renders result.message (SaveAsTemplateButton.tsx:57 `setError(result.message ?? 'Could not save')`) and never surfaces fieldErrors, so the user sees a bare 'Validation failed.' with no hint that an empty third row is the cause — while the two filled rows look perfectly valid.

```
const canSaveTemplate =
    draft.payee.trim() !== '' &&
    draft.postings.filter((p) => p.account.trim() !== '').length >= 2;
```

**Fix:** Filter blank rows out of templateDraft (e.g. `draft.postings.filter((p) => p.account.trim() !== '')`) so the saved shape matches what canSaveTemplate counted; additionally render fieldErrors in SaveAsTemplateDialog as a fallback.

> **Verifier notes** (independent adversarial check, confidence: high): Confirmed. canSaveTemplate (TransactionEntry.tsx:162-164) counts only postings with non-empty accounts, but templateDraft (line 156) includes every row, including blank rows from 'Add posting' ({account:'', amount:'', currency:default}). accountSchema is .min(1, 'Account is required') (lib/transactions/schema.ts:18), so saveTemplateAction (features/templates/actions/saveTemplate.ts) returns reason 'invalid' with message 'Validation failed.' and fieldErrors, and SaveAsTemplateDialog renders only result.message (SaveAsTemplateButton.tsx:57). The blank-amount posting passes postingSchema's currency refine, so the account error is the only failure and the user gets no field context. Filtering blank rows before building templateDraft is the right fix. Medium is fair — real UX dead-end, bounded impact.

### A6. SaveAsTemplateDialog name defaults to stale mount-time payee ('—' on a fresh form)

**Severity:** LOW · **Effort:** S (<1h) · **Location:** `features/templates/SaveAsTemplateButton.tsx:33`

The dialog is mounted closed from page load inside TransactionEntry (TransactionEntry.tsx:258), and `useState(draft.payee)` captures the payee at mount time. On a fresh new-transaction form the payee is empty, so templateDraft.payee is the placeholder '—' (TransactionEntry.tsx:153 `draft.payee.trim() || '—'`), and the first time the user opens 'Save as template' the Name field is pre-filled with '—' instead of the payee they typed. Since '—' passes the `!name.trim()` guard, one accidental Enter saves a template literally named '—'. (reset() re-syncs the name only after a cancel/close, so first-open is always stale.)

```
const [name, setName] = useState(draft.payee);
```

**Fix:** Sync the name when the dialog opens, e.g. in the Dialog onOpenChange open branch call `setName(draft.payee)` (or key/remount the dialog on open), and treat the '—' placeholder as empty for the default name.

> **Verifier notes** (independent adversarial check, confidence: high): Confirmed with one mechanism correction. useState(draft.payee) at SaveAsTemplateButton.tsx:33 captures the mount-time payee; the dialog is mounted from page load via SaveAsTemplateButton in TransactionEntry.tsx:258, and templateDraft.payee is '—' on a fresh form (TransactionEntry.tsx:153). reset() only re-syncs name on close, so the first open always shows the stale '—'. The '—' passes the !name.trim() guard, so a template named '—' can be saved. Correction: the dialog contains no <form> and DialogContent is portaled outside TransactionEntry's form, so 'one accidental Enter' would not submit — saving requires clicking Save. Core finding and fix (sync name on open) stand; low severity is right.

### A7. Journal parser silently drops standard ledger syntax (per-unit `@` prices, no-space commodities, quoted commodities, 1-digit dates); edits can then rewrite blocks without the dropped lines

**Severity:** HIGH · **Effort:** L (multi-day) · **Location:** `lib/journal/parser.ts:51`

parseAmtCur requires exactly two whitespace-separated tokens, so `$100` / `$-1,234.56` (the most common ledger amount style) and quoted commodities (`10 "VTSAX 500"`) fail; the `@@` branch handles total cost but per-unit `@` prices (`10 AAPL @ 150.00 USD`) fall through and fail; HEADER_REGEX requires 2-digit month/day so `2024/1/5` headers (and effective-date `2024-01-05=2024-01-10` headers) make the entire transaction invisible in the UI. Failed posting lines land in unparsedLines, which Transaction does not carry, so the transactions list shows those postings/amounts as missing. Worse, performEdit (lib/journal/service.ts:436-441) replaces the whole original block with formatTransaction(draft) built only from parsed postings, and the fingerprint guard also hashes only parsed content — so an edit that passes validation (e.g. when the unparsed line was a virtual/`$`-amount posting while the parsed ones balance) silently deletes the unparsed lines from the journal file.

```
const parts = s.split(/\s+/);
  if (parts.length !== 2) return null;
```

**Fix:** Extend the posting grammar: support attached-symbol amounts (`$100`, `-$1,234.56`), quoted commodities (`"ABC 123"`), and per-unit `@` cost (convert to total cost or store as its own annotation). Accept 1-2 digit month/day in HEADER_REGEX. Until then, propagate unparsedLines onto Transaction and hard-block edit (not just delete) when unparsedLines.length > 0, and include unparsedLines in the fingerprint so concurrent guards see them.

> **Verifier notes** (independent adversarial check, confidence: high): Confirmed on every specific claim. parseAmtCur (parser.ts:50-51) rejects anything not exactly two tokens, so attached-symbol amounts ($100) and quoted commodities fail; per-unit '@' postings split('@@') to length 1 and then fail parseAmtCur (5 tokens). HEADER_REGEX (parser.ts:10) requires 2-digit month/day, so 2024/1/5 and effective-date headers make the whole block unparseable. Transaction type (parser.ts:157-169) omits unparsedLines, and performEdit (service.ts:436-441) replaces startLine..endLine with formatTransaction output built only from parsed postings — unparsed lines are deleted. Only rawLensLogic.ts:27-28 checks unparsedLines; the edit path does not. verifyJournalParseable may catch some resulting imbalances but not balanced/virtual cases, as the finding acknowledges. The app has an import route, so pre-existing standard-syntax journals are realistic. High/L is right.

### A8. Report parsers assume 'CUR AMT' token order — no-space commodity amounts ($-200.00) parse as 0

**Severity:** MEDIUM · **Effort:** S (<1h) · **Location:** `lib/netWorth/parse.ts:5`

parseAmount splits on whitespace and takes parts[1] when there are 2+ tokens, else Number(parts[0]). ledger prints symbol-prefixed commodities without a space (`$-200.00`, `$1,234.56`), so Number('$-200.00') is NaN — here it propagates NaN into NetWorthRow.value (no `|| 0` guard), and the same token-order assumption in lib/payees/parse.ts:7, features/monthlyComparison/MonthlyComparison.utils.ts:9, and features/accounts/amountParts.ts:20-26 silently coerces those amounts to 0 (amountParts also misses the negative flag since the string starts with '$', not '-'). Any journal using `$`-style commodities gets zeroed/NaN net-worth, payee, monthly, and account-bucket figures while the raw ledger CLI output is correct. utils/parseAmountColumn.ts already handles this shape correctly but is not used by these parsers.

```
const numericPart = parts.length > 1 ? parts[1] : parts[0];
  return Number(numericPart.replaceAll(',', ''));
```

**Fix:** Replace the ad-hoc split logic in lib/netWorth/parse.ts, lib/payees/parse.ts, MonthlyComparison.utils.ts, and features/accounts/amountParts.ts with the existing utils/parseAmountColumn (regex-extracts the numeric token including sign regardless of symbol placement), and keep a `|| 0`/isFinite guard at each call site.

> **Verifier notes** (independent adversarial check, confidence: high): Confirmed at all four cited sites. lib/netWorth/parse.ts:4-6 takes parts[1] only when the amount splits into 2+ whitespace tokens, so a no-space commodity like '$-200.00' becomes Number('$-200.00') = NaN with no ||0 guard, propagating NaN into NetWorthRow.value (chart data in features/netWorth/NetWorth.tsx:29-31). lib/payees/parse.ts:6-7 and features/monthlyComparison/MonthlyComparison.utils.ts:8-9 have the same token logic with '|| 0', silently zeroing those amounts. features/accounts/amountParts.ts:20-26 additionally reports negative:false and signed:0 for '$-200.00' since numStr starts with '$'. Corroboration: utils/parseAmountColumn.ts's own docstring lists '$100' as a shape 'ledger emits in practice' and handles it, but is only used by app/registers/monthly/[account]/page.tsx. baseCurrencySchema (lib/settings/schema.ts) permits '$' as base currency, so '-X $' reports realistically produce this shape. Medium severity fair (total breakage but only for no-space-commodity journals).

### A9. ledger's exclusive `-e/--end` drops all transactions on the period's last day in every date-filtered report

**Severity:** HIGH · **Effort:** S (<1h) · **Location:** `app/balance/[from]/[to]/page.tsx:33`

DateFilter generates an inclusive `to` (endOfMonth/endOfQuarter/endOfYear return the last calendar day, e.g. 2024-01-31), but ledger's `-e DATE` is exclusive — transactions dated on DATE are not reported. So the January view silently omits everything dated Jan 31, the yearly view omits Dec 31, etc. The same inclusive date is forwarded verbatim to `-e` in features/payees/Payees.tsx:41, app/api/balance/periodic/export/route.ts:34, app/api/balance/export/route.ts:30 and app/api/payees/export/route.ts:25, so on-screen totals, charts, and CSV exports are all understated whenever the last day of the period has activity. It is also inconsistent with /transactions, whose applyTransactionFilters treats `end` inclusively.

```
'-b',
    toISODate(from),
    '-e',
    toISODate(to),
```

**Fix:** Add one day to the user-supplied inclusive end date before passing it to ledger: e.g. a shared `toExclusiveLedgerEnd(to: string)` helper (parseISODate, +1 day, toISODate) used everywhere a `to`/`end` param is turned into `-e`. Cover with a test journal containing a transaction on the last day of a month.

> **Verifier notes** (independent adversarial check, confidence: high): Confirmed. utils/date.ts endOfMonth/endOfQuarter/endOfYear return the last calendar day; DateFilter.tsx:118-165 passes toISODate of those as `to`, and app/balance/[from]/[to]/page.tsx:31-34 forwards it verbatim to ledger '-e', which is exclusive per ledger's documented --end semantics ('transactions on or after DATE are not considered'). All four other cited '-e' sites verified (Payees.tsx:41, api/payees/export/route.ts:25, api/balance/periodic/export/route.ts:34, api/balance/export/route.ts:30). applyTransactionFilters.ts:29 uses `ts > end` (inclusive), confirming the inconsistency with /transactions. Last-day-of-month activity (rent, salary, month-end) is routine, so high severity is fair.

### A10. formatDateWithLocale parses YYYY-MM-DD as UTC then formats in local time — transaction dates shift a day west of UTC

**Severity:** MEDIUM · **Effort:** S (<1h) · **Location:** `utils/formatDateCore.ts:39`

`new Date('2024-01-15')` is interpreted as UTC midnight per the ECMAScript date-only ISO rule, but toLocaleDateString renders it in the environment's local timezone. TransactionRowItem (a 'use client' virtualized list) calls formatDateWithLocale(t.date, Format.DATE) with the journal's YYYY-MM-DD string, so any user in a UTC-negative timezone sees every transaction dated one day earlier than what is written in the journal. The repo already has a correct local-time parser (utils/date.ts parseISODate) that is not used here; slash-formatted dates elsewhere (`2024/01/15` from ledger %D) parse as local, making the display inconsistent between views.

```
) => new Date(date).toLocaleDateString(locale, formatOptions[format]);
```

**Fix:** Parse date-only strings as local calendar dates before formatting: detect /^\d{4}-\d{2}-\d{2}$/ and build the Date via new Date(y, m-1, d) (reuse parseISODate — it is client-safe), falling back to new Date(date) for full timestamps.

> **Verifier notes** (independent adversarial check, confidence: high): Confirmed. formatDateCore.ts:39 does new Date(date).toLocaleDateString(...); the parser emits date as 'YYYY-MM-DD' (parser.ts:20), which ECMAScript parses as UTC midnight, and TransactionRowItem (rendered inside 'use client' TransactionList.tsx) formats it in the browser's local timezone — users in UTC-negative zones see every transaction one day early. parseISODate in utils/date.ts is pure/client-safe, so the suggested fix is sound. Also affects server-side formatDate.ts wrapper if the server TZ is not UTC. Medium is a fair severity for a display-only but pervasive defect.

### A11. Absolute 1e-9 epsilon in balance validation rejects genuinely balanced transactions with large amounts

**Severity:** MEDIUM · **Effort:** M (half day) · **Location:** `lib/transactions/schema.ts:146`

Postings are summed as IEEE doubles and compared against an absolute epsilon of 1e-9. For amounts in the hundreds of millions with decimals (routine for IRR/VND-denominated journals), one ulp already exceeds 1e-9: verified `123456789.12 + 876543210.88 - 999999999.99 - 0.01 === -9.54e-9`, so a perfectly balanced transaction is rejected with 'Postings in X do not balance'. The identical check exists client-side in features/transactions/entry/balance.ts:38 and in the type-form matchers (features/transactions/entry/types/transfer.ts:59, expense.ts:65, income.ts:64, exchange.ts:70), so both the UI preview and the server-side Zod validation refuse the entry.

```
if (Math.abs(total) > 1e-9) {
```

**Fix:** Do the balance check in scaled integers: determine the max number of decimal places across the postings of a currency, multiply each amount string into a BigInt of minor units, and require the exact sum to be 0n. Apply the same helper in schema.ts, entry/balance.ts, and the entry/types matchers.

> **Verifier notes** (independent adversarial check, confidence: high): Confirmed. schema.ts:146 uses absolute epsilon `Math.abs(total) > 1e-9` over IEEE-double sums of Number(p.amount); the cited numeric example reproduces exactly (-9.536743164270667e-9 in node), so a decimally-exact transaction is rejected server-side. All five duplicate sites verified (entry/balance.ts:38, types/transfer.ts:59, expense.ts:65, income.ts:64, exchange.ts:70). Caveat on realism: two-posting a+(-a) cancels exactly, so failure needs 3+ postings with amounts above roughly 1e7 that carry decimals — IRR/VND rarely use decimals, so the trigger is narrower than the description implies. Medium severity already reflects that bounded impact; the BigInt minor-units fix is correct.

### A12. Transactions list truncates displayed amounts to 2 decimals — high-precision commodities show wrong values

**Severity:** LOW · **Effort:** S (<1h) · **Location:** `features/transactions/TransactionRowItem.tsx:74`

magnitudeByCurrency sums posting amounts as floats and renders `amt.toFixed(2)`. For commodities that legitimately use more decimals (crypto, fund units: `0.005 BTC`) the row shows `BTC 0.01` — a different number than the journal — and small non-zero amounts can render as `0.00`. The code elsewhere deliberately preserves ledger's original digit strings (formatAmount/groupThousands operate on strings for exactly this reason), but this path converts to float and hard-rounds.

```
{formatAmount(`${ccy} ${amt.toFixed(2)}`, true)}
```

**Fix:** Determine the max decimal places among the summed posting amount strings for each currency and use toFixed(thatPrecision), or sum in scaled BigInt minor units derived from the string decimals and re-render the exact result.

> **Verifier notes** (independent adversarial check, confidence: high): Confirmed. features/transactions/TransactionRowItem.tsx lines 74 and 95 render formatAmount(`${ccy} ${amt.toFixed(2)}`, true) where amt is a float sum of Number(p.amount) over postings (magnitudeByCurrency, lines 19-28). High-precision commodities (e.g. 0.005 BTC) display as 0.01/0.00 — a different number than the journal. utils/formatAmount.tsx's groupThousands docstring confirms the codebase elsewhere deliberately preserves ledger's string precision including trailing zeros, so this path is an outlier. Low severity and S effort are appropriate (display-only, list summary column).

### A13. Account names are passed to ledger as unescaped regex queries — metacharacters produce empty or wrong reports

**Severity:** MEDIUM · **Effort:** M (half day) · **Location:** `app/accounts/[account]/page.tsx:25`

ledger treats the report query as a regular expression. The account drill-down passes the raw account name, so an account like `Expenses:Food (Eating Out)` (parens become a regex group) or anything with `+`, `.`, `$` matches the wrong accounts or nothing, rendering an empty register/balance for a real account; isValidAccount only rejects NUL/newline/leading '-'. The same problem is amount-affecting in features/transactions/entry/actions/getAccountBalance.ts:21: the regex query fails to match, extractAccountBalance returns '0', and the fix-balance form then computes an adjustment equal to the full target amount instead of the true difference.

```
['register', account, '--format', 'NNN%D|%A|%P|%N|%X|%B|%C|%t|%T'],
```

**Fix:** Escape regex metacharacters and anchor the query before handing it to ledger, e.g. a shared `ledgerAccountQuery(account)` returning `'^' + account.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(:|$)'`; use it in app/accounts/[account]/page.tsx, getAccountBalance.ts, and any other place a stored account name becomes a ledger query.

> **Verifier notes** (independent adversarial check, confidence: high): Confirmed. app/accounts/[account]/page.tsx:25 passes the decoded account name verbatim as a ledger register query, and ledger treats report queries as regexes; isValidAccount (utils/validateAccount.ts) only blocks empty/>256/leading-'-'/control chars, so parens, '+', '$', '[' etc. in an account name change or break the match, yielding an empty register/balance for a real account. The getAccountBalance.ts:21 chain is also verified: non-matching regex -> empty stdout -> extractAccountBalance returns '0' -> FixBalanceForm.tsx:67 computes implied = targetAmount - 0, i.e. an adjustment equal to the full target instead of the true difference. No escaping exists anywhere in the repo. Suggested fix (escape metachars + anchor '^...(:|$)') is correct for ledger's regex engine. Medium severity is honest: amount-affecting but only for accounts containing regex metacharacters.

### A14. Stale cryptoPasskeyWrap rows survive resetUserEncryption and later serve the old DEK

**Severity:** HIGH · **Effort:** S (<1h) · **Location:** `lib/crypto/resetEncryption.ts:29`

resetUserEncryption deletes the userCrypto row but not the user's cryptoPasskeyWrap rows, and those rows only cascade on user deletion, not on userCrypto deletion. The schema comment claims orphan wraps 'can never assert', but after a reset the passkeys still exist and still PRF-assert — only the wrapped DEK is stale. When the user re-enables encryption with a new DEK, GET /api/crypto/material (app/api/crypto/material/route.ts) returns the old wraps mixed into the new material, and POST /api/crypto/unlock accepts any decoded DEK without validation, so a passkey unlock installs the old DEK as the session key and every subsequent journal pull fails decryption — the user appears unlocked but the journal is unreadable, with no hint why.

```
await new UserCryptoRepository(db).delete(userId); // remove crypto metadata → status 'unset'
```

**Fix:** In resetUserEncryption, delete the user's cryptoPasskeyWrap rows alongside the userCrypto row (add a deleteByUser(userId) to PasskeyWrapRepository and run both deletes in one db.transaction). Defensively, also clear wraps in the setup path before creating a fresh userCrypto row.

> **Verifier notes** (independent adversarial check, confidence: high): Confirmed at every step. resetEncryption.ts:29 deletes only userCrypto; PasskeyWrapRepository has no deleteByUser and nothing else clears wraps (FK cascades only on user deletion, db/schema/cryptoPasskeyWrap.ts:17). The schema comment's 'orphans can never assert' covers only deleted passkeys — after reset the credential still exists and asserts with the fixed PRF salt (per-wrap prfSalt was dropped in migration 0010). setupCrypto.ts:25-31 recreates userCrypto post-reset without clearing wraps; /api/crypto/material returns all stale wraps mixed with new material; client unlockWithPasskey/tryUnlockFromWebAuthn (passkeyFlow.ts:94-172) unwrap the stale wrap to the OLD DEK (same passkey KEK), and /api/crypto/unlock installs any 32-byte DEK unvalidated (transport.ts decodeDek checks length only). Single-tap login path installs the wrong DEK silently. Impact is worse than described: writes in that session would encrypt with the old DEK, mixing keys in the remote store. Suggested fix is correct and safe — wraps are dead weight once userCrypto is gone (material 404s, unlock 409s without the row). In scope as correctness (only the legitimate passkey owner triggers it).


---

## B. Concurrency & cross-context state (globalThis)

The project's own rule (documented in `lib/rate-limit/index.ts` and `lib/crypto/sessionKeys.ts`, learned from the unlock-loop bug) is that cross-request in-memory state must be pinned on `globalThis` because Next.js duplicates module-level state per server context. Three modules violate it, including the single lock that serializes all journal I/O. B1–B4 are one-pattern fixes; B5 is the price-DB push/pull lifecycle bug that compounds them.

### B1. Per-user journal write lock lives in module state, not globalThis — lock does not serialize across server contexts

**Severity:** HIGH · **Effort:** S (<1h) · **Location:** `lib/journal/mutex.ts:1`

withUserLock is the only thing serializing pull/push/write mutations of a user's journal dir (lib/storage/sync.ts explicitly documents 'Call it ONLY while already holding the per-user lock'). But `tails` is a plain module-level Map. The project's own rule — implemented with explanatory comments in lib/crypto/sessionKeys.ts and lib/rate-limit/index.ts — is that Next.js evaluates modules in separate instances per server context (route handlers vs server actions vs RSC render vs instrumentation), so each context gets its own `tails` map and two 'locked' operations from different contexts run concurrently. A route-handler import and a server-action transaction write can then interleave pullToLocal (which deletes local files) with pushFromLocal (which reads them), producing ENOENT mid-push, torn local state, or lost writes; the manifest conflict guard only bounds, not prevents, the damage.

```
const tails: Map<string, Promise<unknown>> = new Map();
```

**Fix:** Pin the map on globalThis exactly like lib/crypto/sessionKeys.ts does: `const g = globalThis as typeof globalThis & { __ledgerUserLocks?: Map<string, Promise<unknown>> }; const tails = (g.__ledgerUserLocks ??= new Map());` and add the same rationale comment.

> **Verifier notes** (independent adversarial check, confidence: high): Confirmed. (1) Evidence quote is verbatim: lib/journal/mutex.ts:1 is `const tails: Map<string, Promise<unknown>> = new Map();` — plain module state, no globalThis pinning. (2) The project's own convention is real and documented in-code: lib/crypto/sessionKeys.ts:4-12 ("MUST live on `globalThis`, not in a plain module-level" map) and lib/rate-limit/index.ts:8-15 use the exact globalThis pattern with rationale comments; the repo previously hit this exact bug class in production (unlock-loop, fixed by pinning on globalThis). (3) Cross-context callers exist: route handlers (app/api/upload/route.ts calls journalService.replaceFromZip/replaceFromSingleFile, both wrapped in withUserLock at lib/journal/service.ts:250/327; app/api/transactions/export and app/api/account/export use journalService reads) AND server actions (features/transactions/actions/createTransaction.ts etc., via withUserLock at service.ts:156/215/222). The protected resource is shared on-disk state (the per-user local journal dir), so two per-context lock instances genuinely fail to serialize: replaceFromSingleFile wipes the dir (service.ts:255 resetLocalJournal) and pullToLocal deletes stale files (lib/storage/download.ts:85 fs.rm), which can interleave with a concurrent addTransaction's pull->append->push from a different context — ENOENT, torn local state, or lost writes, exactly as claimed. lib/storage/sync.ts:11-13 confirms pull "is NOT safe to run concurrently against itself or against push". (4) Severity high is honest for financial journal data, though the window requires same-user concurrency across contexts (e.g., upload while another tab saves a transaction) — realistic but not everyday. (5) The suggested fix mirrors sessionKeys.ts exactly, is behavior-preserving in single-context scenarios, and breaks nothing. Note the fix still doesn't cover multi-process/multi-instance deploys, but that matches the project's accepted single-instance model.

### B2. regenerateUserPriceDb mutates the shared journal dir without holding the per-user lock

**Severity:** HIGH · **Effort:** S (<1h) · **Location:** `lib/prices/service.ts:70`

lib/storage/sync.ts documents that the per-user local journal dir 'is NOT safe to run concurrently against itself or against push' and must only be mutated while holding withUserLock. regenerateUserPriceDb writes price-db.ledger into that dir via writeFileAtomic with no lock, and it is invoked from the daily cron (instrumentation context) and from the refreshPrices server action while user requests may be mid pull/push. A concurrent pullToLocal can delete the file it just wrote (see download.ts local-file cleanup) or a concurrent pushFromLocal can read/upload it in an inconsistent state relative to the manifest.

```
await this.deps.journalRepo.writeFileAtomic(target, body);
```

**Fix:** Wrap the body of regenerateUserPriceDb in `withUserLock(userId, async () => { ... })` from lib/journal/mutex (after that mutex is pinned to globalThis), keeping the lock non-reentrant contract in mind for callers.

> **Verifier notes** (independent adversarial check, confidence: high): Confirmed. lib/storage/sync.ts:10-13 requires withUserLock for any mutation of the per-user journal dir; lib/prices/service.ts:92-93 writes price-db.ledger into layout.dir via writeFileAtomic with no lock (withPriceLock in lib/prices/lock.ts is a separate global fetch-coalescing lock wrapping only refreshAll, and cron runOnce at service.ts:185, refreshPricesAction at features/portfolio/actions/refreshPrices.ts:12, addManualPrices:133, deleteManualPrice:144 all call regenerate unlocked). Impact verified: lib/storage/download.ts:83-87 deletes local files absent from the remote set, and lib/storage/manifest.ts:61-81 excludes only .manifest.json and *.tmp, so price-db.ledger is deletable; every render fires pullLocked via lib/journal/repository.ts:20-22, and lib/storage/save.ts:52-59 uploads every local file mid-state. Finding actually UNDERSTATES the bug: all push paths pull first inside the lock (lib/journal/service.ts:158/254/328), so the not-yet-remote price-db.ledger is deleted before every push and essentially never reaches Garage — even a sequential pull after regeneration wipes the file, leaving runLedgerForUser with priceDbPath=null (prices silently dropped from ledger runs). Suggested fix (wrap in withUserLock) is safe for all current callers but incomplete: the next pull still deletes the file; a full fix must also exclude PRICE_DB_NAME from the sync delete/upload set or push after regeneration. The caveat that lib/journal/mutex.ts:1 keeps its tails Map module-level (not globalThis-pinned) is also accurate. Severity medium is defensible for the concurrency framing, but given the near-deterministic loss of the regenerated price db on the next read pull (wrong priced valuations in realistic use), high is more honest.

### B3. Price refresh in-flight coalescing lock is module-scoped, so cron and server action can run refreshAll concurrently

**Severity:** MEDIUM · **Effort:** S (<1h) · **Location:** `lib/prices/lock.ts:1`

withPriceLock coalesces concurrent refreshAll calls via a module-level `inflight` slot. refreshAll is invoked from two different server contexts: the node-cron job registered in instrumentation.ts and the features/portfolio/actions/refreshPrices.ts server action. Per the project's module-duplication rule these contexts get separate `inflight` slots, so the coalescing guarantee ('one fetch, one set of side effects') fails exactly in the cross-context case it exists for: two simultaneous runOnce() executions double-hit the price provider, insert two priceFetchRun rows, and race each other's unlocked regenerateUserPriceDb writes.

```
let inflight: Promise<unknown> | null = null;
```

**Fix:** Move the inflight slot to globalThis (`__ledgerPriceRefreshInflight`), mirroring lib/rate-limit/index.ts, and keep the test reset helper clearing the globalThis slot.

> **Verifier notes** (independent adversarial check, confidence: high): Confirmed. lib/prices/lock.ts:1 holds the coalescing slot as a plain module-level `let inflight`. refreshAll (lib/prices/service.ts:62-63) wraps runOnce in withPriceLock; runOnce inserts a priceFetchRun row (line 153) and calls regenerateUserPriceDb per user (line 185). Two invokers in two server contexts verified: instrumentation.ts dynamically imports the scheduler (cron calls priceService.refreshAll at lib/prices/scheduler.ts:24) and the server action features/portfolio/actions/refreshPrices.ts:8. Build output proves the duplication is real, not speculative: lib/prices/lock is compiled into both chunks/[root-of-the-server]__0w.7jlz._.js (instrumentation graph) and two chunks/ssr/*.js (app server graph), so each context gets its own inflight slot. The repo has already fixed this exact class of bug via globalThis pinning in lib/rate-limit/index.ts:8-15 and lib/crypto/sessionKeys.ts:4-12, and the project conventions explicitly name off-globalThis cross-request state a violation. Impact caveat: within-context coalescing (action vs action) still works and the cron fires once daily, so the overlap window is narrow and the outcome is duplicate provider fetch + two run rows + racing regenerateUserPriceDb writes, not corruption — medium is at the generous end but defensible. Suggested globalThis fix mirrors the existing rate-limit pattern and is safe.

### B4. ObjectStore singleton cached in module state; memory backend diverges per server context

**Severity:** MEDIUM · **Effort:** S (<1h) · **Location:** `lib/storage/client.ts:7`

The process-wide ObjectStore is memoized in a module-level `let cached`. Under the project's documented Next.js behavior (separate module instances per server context), STORAGE_BACKEND='memory' (the default per lib/env, used in dev) gives each context its own MemoryObjectStore holding the entire canonical journal: a push from a server action is invisible to a route handler's pull, and a pull against an empty per-context store deletes the user's local journal files and resets the manifest. In s3 mode the impact is only redundant S3Client instances, but the memory path breaks the app's own consistency guarantees in dev.

```
let cached: ObjectStore | null = null;
```

**Fix:** Memoize on globalThis: `const g = globalThis as typeof globalThis & { __ledgerObjectStore?: ObjectStore }; export const getObjectStore = () => (g.__ledgerObjectStore ??= build());` and have resetObjectStore clear the globalThis slot.

> **Verifier notes** (independent adversarial check, confidence: high): Confirmed. lib/storage/client.ts:7 memoizes the ObjectStore in module-level `let cached` (used by getObjectStore, lines 23-28). STORAGE_BACKEND defaults to 'memory' (lib/env/index.ts:69) and MemoryObjectStore keeps all objects in an instance Map (lib/storage/memoryObjectStore.ts:9), so per-server-context module duplication yields divergent canonical stores in dev. The repo itself documents this exact failure class and the globalThis fix: lib/crypto/sessionKeys.ts:4-12 ("MUST live on globalThis, not in a plain module-level") and lib/rate-limit/index.ts:8-15, both added after the PR #42 unlock-loop bug — making this an explicit project-convention violation. The data-loss mechanism also verifies: in lib/storage/download.ts pullToLocal, an empty per-context store returns [] from list() (no error, so the stale-cache fallback at lines 40-50 does not fire), then lines 83-89 delete every local file absent from the remote set and rewrite the manifest to {} — wiping journal files a server action just pushed to a different context's store. Callers: lib/storage/sync.ts:16,30. Suggested globalThis fix matches the repo's existing pattern and correctly has resetObjectStore clear the slot, so tests keep working. Severity medium is right: s3/production mode only gets redundant S3Client instances; the consistency break is confined to memory-mode dev but is visible and violates the stated convention.

### B5. Regenerated price-db.ledger is never pushed to Garage, so the next read-path pull deletes it

**Severity:** HIGH · **Effort:** M (half day) · **Location:** `lib/prices/service.ts:93`

regenerateUserPriceDb writes price-db.ledger into the local journal dir and revalidates the cache tag, but never calls push(userId). pullToLocal (lib/storage/download.ts:83-87) deletes any local file absent from the remote set: `for (const rel of await listLocalRelPaths(dir)) { if (!remoteRelSet.has(rel)) await fs.rm(...) }`. So unless the user happens to make a journal write (which pushes every local file) between regeneration and their next page view, the freshly generated price DB — including manual prices the user just entered — is wiped on the very next request, findPriceDb returns null, and all `-X` conversions silently lose their rates. The daily cron then rewrites it and the cycle repeats: recurring cron work whose output is discarded. It also mutates the journal dir without holding withUserLock, racing concurrent pulls.

```
await this.deps.journalRepo.writeFileAtomic(target, body);
```

**Fix:** After writing price-db.ledger, push it to canonical storage: wrap regenerateUserPriceDb in withUserLock(userId, ...) and call pull(userId) before the write and push(userId) after (mirroring JournalService.addTransaction). Alternatively, exempt PRICE_DB_NAME from the delete pass in pullToLocal and from the conflict check in pushFromLocal, treating it as a locally-generated artifact.

**Also reported (duplicates, folded into this item):**
- `lib/storage/download.ts:82` — Regenerated price-db.ledger is deleted by the next pull if it was never pushed to Garage

> **Verifier notes** (independent adversarial check, confidence: high): Verified end-to-end. lib/prices/service.ts:93 writes price-db.ledger locally with no push (no caller pushes either: addManualPrices:133, deleteManualPrice:144, cron runOnce:185, features/portfolio/actions/refreshPrices.ts:12). lib/storage/download.ts:83-87 deletes local files absent from remote, and listLocalRelPaths (lib/storage/manifest.ts:74) exempts only .manifest.json and *.tmp. Every read pulls: utils/runLedger.ts:35 → getFingerprint → cachedPull → pullLocked → pullToLocal, after which findPriceDb (lib/journal/repository.ts:137-145) returns null and --price-db is dropped. The no-lock claim is also correct (sync.ts:10-13 warns dir mutation requires withUserLock; regenerateUserPriceDb holds none). One correction: the finding's escape hatch is weaker than stated — write paths (e.g. lib/journal/service.ts:156-196) pull BEFORE pushing, so the pull deletes the un-pushed price DB and even an intervening journal write normally fails to persist it; the file only reaches remote via an import archive or a race into the pull→push window. Impact and severity (high) are honest; suggested fixes are viable, with the PRICE_DB_NAME exemption in pullToLocal/pushFromLocal being the smaller change.


---

## C. Prices & base-currency pipeline

The price subsystem has a coherent set of defects: the cron operates on a possibly-empty local cache, failures are silent, and changing the base currency (saved or per-session) desynchronizes the price DB from the reports that consume it. Fix C1 (cron pull) and B5 (push after regenerate) first; then C3–C5 (base-currency change flow) become straightforward.

### C1. Price cron runs ledger against the local cache without pulling the canonical journal

**Severity:** MEDIUM · **Effort:** S (<1h) · **Location:** `utils/runLedgerForUser.ts:24`

runLedgerForUser only calls repo.ensureLayout, which creates a stub main.ledger if the file is missing — it never pulls from Garage. The price cron uses it (PriceService.listNormalizedSymbolsForUser) to discover each user's commodities. On a fresh container (every Coolify deploy) the local journal dir is empty, so `ledger commodities` runs against the two-line stub, returns nothing, and the cron fetches zero prices for every user who hasn't loaded a page since the deploy. The request path solved exactly this with getFingerprint → pullLocked; the cron path skipped it.

```
const { mainPath, priceDbPath } = await repo.ensureLayout(userId);
```

**Fix:** Call `await pullLocked(userId)` (from @/lib/storage) at the top of runLedgerForUser before ensureLayout, so background jobs always operate on the canonical journal. The per-user lock already serializes it against request-path pulls.

> **Verifier notes** (independent adversarial check, confidence: high): Confirmed. utils/runLedgerForUser.ts:24 only calls repo.ensureLayout, which (lib/journal/repository.ts:57-67) mkdirs and writes a two-line comment stub when main.ledger is missing — no Garage pull anywhere in the function or in lib/prices/. The cron chain is lib/prices/scheduler.ts:22-24 → PriceService.refreshAll → runOnce → listNormalizedSymbolsForUser (service.ts:240) → runLedgerForUser, so on a fresh container `ledger commodities` runs against the stub and returns nothing. The ephemeral-cache premise is documented: docs/deployment/garage.md lines 3-4 state 'The app treats local disk (DATA_DIR) as an ephemeral cache' with Garage canonical. The request path does pull (utils/runLedger.ts:35 → getFingerprint → cachedPull → pullLocked, repository.ts:128-134), confirming the asymmetry. Impact is actually slightly worse than claimed: runOnce also calls regenerateUserPriceDb per user (service.ts:184-186), which filters fetched price rows to the (empty) userSymbols set (service.ts:74-77) and atomically rewrites price-db.ledger with all fetched prices stripped (only manual prices survive) until the cache is warmed and the next refresh runs. Suggested fix is correct: pullLocked (lib/storage/sync.ts:25) is the documented entry for callers not already holding the per-user lock, and journal saves push to Garage synchronously (lib/journal/service.ts:128,136), so a cron-time pull cannot clobber newer local state; cost is one pull per user per daily run. Severity medium is honest (silent zero-fetch + degraded price DB per deploy, self-healing after the user next loads a page).

### C2. Price cron silently skips a user's commodities on ledger CLI failure — no log, run recorded as 'success', price DB rewritten without fetched prices

**Severity:** MEDIUM · **Effort:** S (<1h) · **Location:** `lib/prices/service.ts:245`

listNormalizedSymbolsForUser swallows any runLedgerForUser failure (ledger binary missing, journal unparseable — which is a reachable state since imports have no parse rollback) and returns [] with no logging whatsoever. Two consequences: (1) in runOnce, no pairs are queued for that user, so the daily refresh fetches nothing for them yet the run row is recorded status 'success'; (2) in regenerateUserPriceDb (line 74-77), `userSymbols` becomes an empty set, so `fetched` filters to [] and the user's price-db.ledger is atomically rewritten containing only manual prices, dropping all previously fetched price history from the file — currency-converted reports silently degrade until ledger works again. The failure is invisible to both the operator (no log line) and the user (run status 'success').

```
stdout = await runLedgerForUser(
        userId,
        ['commodities'],
        this.deps.journalRepo
      );
    } catch {
      return [];
    }
```

**Fix:** Log the error with the userId (log.warn/log.error) in the catch, and propagate a distinguishable outcome (e.g. return null vs []) so runOnce can count the user as failed — marking the run 'partial' with the user/symbol noted — and so regenerateUserPriceDb can skip rewriting the price DB instead of emptying it.

> **Verifier notes** (independent adversarial check, confidence: high): Verified. lib/prices/service.ts:237-247: bare catch returns [] with no log. In runOnce, an empty symbol list contributes no pairs and the run row is marked 'success' when fetchPrices itself has no failures (lines 188-197) — the user's silent skip is invisible. In regenerateUserPriceDb (lines 74-77, 91-93), the empty userSymbols set filters fetched to [] and writeFileAtomic unconditionally rewrites price-db.ledger with manual prices only; reports consume that file via --price-db (utils/runLedgerForUser.ts:26). Fetched history remains in the commodity_price table so the file is restored on the next successful run, matching the finding's 'until ledger works again' framing. Caveat on impact: the most likely per-user failure cause (unparseable journal) already breaks that user's reports, but binary-missing/infra failures affect all users and the observability gap is real. Medium stands.

### C3. Switching the saved base currency never regenerates price-db.ledger or fetches rates for the new quote

**Severity:** MEDIUM · **Effort:** M (half day) · **Location:** `features/settings/actions/setSavedBaseCurrency.ts:23`

setSavedBaseCurrencyAction persists the new base and calls revalidatePath, but never calls priceService.regenerateUserPriceDb(user.id) nor refreshAll(). regenerateUserPriceDb filters rates via listForQuote(base) (lib/prices/repository.ts:55-61, `eq(commodityPrice.quote, quote)`), and commodity_price rows exist only for the previously-fetched quote, so listForQuote(newBase) returns zero fetched rows. Until the next daily cron (lib/prices/service.ts runOnce), price-db.ledger still contains only old-base `P` rows, so every report page running `-X <newBase>` (app/balance, app/debts, portfolio, all export routes) shows amounts unconverted in their original commodities. BaseCurrencyBanner does surface the state via getMissingRateCommodities, but only as an informational alert with no refresh action, and the broken window lasts up to 24h. Worse, the cron only fetches current-day prices, so historical rates against the new quote are never backfilled — time-series valuations (net worth, monthly comparison) remain based on a price history that starts at the switch date.

```
await userSettingService.saveBaseCurrency(user.id, parsed.data);
  revalidatePath('/', 'layout');
  return { ok: true };
```

**Fix:** After saveBaseCurrency, kick off a targeted refresh for the new quote (fetch pairs for the user's symbols against parsed.data, insert into commodity_price) and then call priceService.regenerateUserPriceDb(user.id) before revalidating — or at minimum regenerate the price DB and surface a 'Refresh prices' CTA in BaseCurrencyBanner that calls refreshPricesAction.

> **Verifier notes** (independent adversarial check, confidence: high): Code facts confirmed: features/settings/actions/setSavedBaseCurrency.ts:23-25 only saves + revalidates; UserSettingService.saveBaseCurrency (lib/settings/service.ts:15-17) is a pure upsert; no regenerate/fetch anywhere in the flow. HOWEVER the headline impact is wrong: ledger 3 inverts and chains P directives (empirically verified with ledger 3.4.1 — with only `P EUR 1.10 USD` and `P BTC 60000 USD`, `-X EUR` converts everything). The new base is picked from journal commodities (BaseCurrencyForm allowFreeText={false}), and the cron fetches every journal commodity against the old base (lib/prices/service.ts:164-169), so the existing old-base price-db converts to the new base immediately via inversion/chaining — there is no 24h 'unconverted reports' window in the normal case. The REAL residual defect is the historical one: the next regeneration (daily cron, portfolio Refresh button, or any manual-price edit) rebuilds price-db.ledger via listForQuote(newBase) (lib/prices/repository.ts:53-58), which only has rows from the switch date forward; the old-quote history is dropped from the projected file and never backfilled (fetchPrices in lib/prices/provider.ts fetches current prices only), so time-series valuations (net worth, monthly comparison) in the new base lose all pre-switch rates. Note the suggested fix is partly wrong: calling regenerateUserPriceDb immediately in the action would make things worse (it would drop the old-base history sooner); a correct fix needs cross-quote projection or historical backfill. Also refreshPricesAction + RefreshPricesButton (features/portfolio/) already provide a manual current-rate path, contra 'no refresh action'. Downgraded high→medium: the impact is limited to historical/time-series valuation after a (rare) base switch, not all reports for 24h.

### C4. baseCurrency cookie is not user-scoped: an override set by one account applies to the next account on the same browser

**Severity:** MEDIUM · **Effort:** S (<1h) · **Location:** `lib/settings/getBaseCurrency.ts:16`

getBaseCurrency checks the cookie before it ever looks up the authenticated user (the getOptionalUser call and userSetting lookup at lines 22-26 run only when the cookie is absent/invalid). The cookie is set with path '/' and a one-year maxAge, is keyed by nothing user-specific ('baseCurrency'), and is not cleared on logout. On a shared browser, user A picking EUR in the header picker leaves a cookie that silently overrides user B's saved base currency on every report, export, and the missing-rate banner after B signs in — B sees all figures converted (or failing to convert) to a currency they never chose, with the only hint being the picker's Reset button (which only appears because current !== savedDefault).

```
const jar = await cookies();
  const cookieValue = jar.get(COOKIE_NAME)?.value;
  if (cookieValue) {
```

**Fix:** Scope the override to the user: store it as `{ userId, currency }` (or name the cookie per user id) and have getBaseCurrency honor it only when it matches the current user; clear the cookie in the sign-out flow as well.

> **Verifier notes** (independent adversarial check, confidence: high): Confirmed in full. getBaseCurrency (lib/settings/getBaseCurrency.ts:14-20) returns the cookie before ever resolving the user (getOptionalUser + userSettingRepository.get run only when the cookie is absent/invalid); the cookie is named 'baseCurrency' with path '/' and maxAge one year (setSessionBaseCurrency.ts:20-25), keyed by nothing user-specific; sign-out (components/Header/AppHeader.tsx:40-43, authClient.signOut()) does not clear it — the only deletion is the explicit clearSessionBaseCurrencyAction. So on a shared browser user A's override silently applies to user B across all reports/exports/banner. One aggravating detail beyond the finding: if user B has never saved a default, BaseCurrencyPickerSlot passes savedDefault=null and BaseCurrencyPicker.tsx:20 computes overridden=false, so the Reset button never renders and B has no visible escape hatch at all. Mitigating: ledger's price inversion/chaining means amounts usually still convert correctly to A's currency (wrong display currency rather than broken numbers) when it is among B's journal commodities. Multi-user open registration makes the scenario plausible; medium is honest for a bounded shared-browser defect.

### C5. Cookie base currency is validated only by shape, so a stale or arbitrary value flows into every ledger -X invocation

**Severity:** LOW · **Effort:** S (<1h) · **Location:** `lib/settings/getBaseCurrency.ts:18`

getBaseCurrency trusts the cookie after only baseCurrencySchema.safeParse, and the schema (lib/settings/schema.ts:3-8) accepts any 1-32 char string without control characters — including spaces, quotes, and commodity names that don't exist in the user's journal. The cookie is set with httpOnly: false (setSessionBaseCurrency.ts:23), so client JS or a manually edited cookie can hold any such string, and stale values survive journal edits that remove a commodity (the cookie lives a year). The value is passed verbatim as the `-X` argument to the ledger CLI by ~20 pages and every export route (e.g. lib/settings/getMissingRateCommodities.ts:10-16 `'-X', base`). execFile with an args array prevents shell issues, but ledger treats an unknown or oddly-formed commodity as a valid conversion target with no rates: every report silently renders unconverted, the banner fires on all pages, and nothing falls back to the saved setting. There is no cross-check against `ledger commodities` (getAvailableCurrencies) or against the saved default.

```
const parsed = baseCurrencySchema.safeParse(cookieValue);
    if (parsed.success) return parsed.data;
```

**Fix:** In getBaseCurrency, validate the cookie value against the user's known commodities (parseCommodityList over `ledger commodities`, or a cheap cached set) and fall through to the saved setting when it doesn't match; alternatively have setSessionBaseCurrencyAction validate against getAvailableCurrencies at set time and have getBaseCurrency delete/ignore values that no longer resolve.

> **Verifier notes** (independent adversarial check, confidence: medium): Facts confirmed: getBaseCurrency (lib/settings/getBaseCurrency.ts:17-19) trusts the cookie after shape-only baseCurrencySchema validation (lib/settings/schema.ts:3-8 accepts any 1-32 non-control chars); cookie set with httpOnly:false (setSessionBaseCurrency.ts:23); value passed verbatim as -X to ~20 pages/exports (getMissingRateCommodities.ts:14-15, runLedger --price-db plumbing confirmed). But impact is smaller than claimed: the arbitrary-value path is self-inflicted only (the picker uses allowFreeText={false} over journal commodities; a garbage cookie requires the user editing their own cookie, and injection is already excluded by execFile args — the finding concedes this). The realistic scenario is the stale one: a commodity removed from the journal drops out of userSymbols in regenerateUserPriceDb (lib/prices/service.ts:74-77), so its rows are filtered from price-db.ledger and -X <stale> leaves everything unconverted — real, but rare (requires fully removing a currency from the journal while a cookie points at it), clearly surfaced by BaseCurrencyBanner, and recoverable via the picker's Reset button (shows because current !== savedDefault). Bounded, visible, self-recoverable → low, not medium.

### C6. Session base-currency actions diverge from the app's server-action conventions

**Severity:** LOW · **Effort:** S (<1h) · **Location:** `features/settings/actions/setSessionBaseCurrency.ts:13`

The sibling setSavedBaseCurrencyAction follows the app convention: requireUser, rateLimit(WRITE, user.id), and a { ok } result. setSessionBaseCurrencyAction performs neither the user check nor the rate limit — it parses and writes the cookie directly — so an unauthenticated caller can invoke it and it bypasses the WRITE budget applied to every other mutating action. clearSessionBaseCurrencyAction additionally breaks the result-shape convention by returning Promise<void>, so BaseCurrencyPicker.onReset (components/BaseCurrencyPicker/BaseCurrencyPicker.tsx:31-33) cannot report failure the way onChange does. Also, the cookie is named/used as a 'session' override but is persisted with maxAge one year (line 11, ONE_YEAR_SECONDS = 60*60*24*365), so the 'temporary' view currency silently outlives the intent and keeps overriding the saved default for a year unless the user finds the Reset button.

```
export const setSessionBaseCurrencyAction = async (
  value: unknown
): Promise<SetSessionBaseCurrencyResult> => {
  const parsed = baseCurrencySchema.safeParse(value);
```

**Fix:** Add requireUser + rateLimit(WRITE, user.id) to both session actions to match setSavedBaseCurrency; return { ok: true } | { ok: false; message } from clearSessionBaseCurrencyAction; and either drop maxAge (true session cookie) or rename the concept away from 'session'.

> **Verifier notes** (independent adversarial check, confidence: high): All cited facts verified: features/settings/actions/setSessionBaseCurrency.ts:13-27 has no requireUser and no rateLimit while siblings setSavedBaseCurrency.ts:15-18 and setEntryTabOrder.ts:16-19 both have them; clearSessionBaseCurrency.ts:7 returns Promise<void> breaking the { ok } result convention; ONE_YEAR_SECONDS maxAge at line 11/21 confirmed. But severity is overstated: the action mutates only the caller's own cookie — no DB, storage, or ledger-CLI work — so the missing WRITE rate limit protects nothing (the budget exists to guard server resources), the unauthenticated-caller angle is security scope (excluded from this review), and clearing a cookie cannot meaningfully fail so the void return is cosmetic (onReset in BaseCurrencyPicker.tsx:30-34 has nothing actionable to report). The year-long 'session' cookie is a real naming/design wart but is surfaced by the always-visible Reset button whenever the override differs from a saved default. Genuine convention inconsistency, but polish-level: low, effort S.

### C7. Commodity/manual prices stored as `real` (float4) — precision loss on financial data

**Severity:** MEDIUM · **Effort:** M (half day) · **Location:** `db/schema/commodityPrice.ts:16`

commodity_price.price and manual_price.price (db/schema/manualPrice.ts:21) use Postgres `real`, a 4-byte float with ~7 significant decimal digits. Provider quotes and user-entered manual prices with more digits (BTC six-figure prices with cents, small-unit FX rates, sats-denominated values) are silently rounded on insert, and the rounded value is what renderPriceDb writes into price-db.ledger — so ledger valuations are computed from degraded prices. This is a lossy representation for the one numeric column the whole portfolio/valuation feature depends on.

```
price: real('price').notNull(),
```

**Fix:** Change both columns to `doublePrecision` (drop-in for the existing JS number plumbing, ~15-16 significant digits) or `numeric` with text parsing if exactness is required; generate and run the ALTER TABLE migration (float4→float8 widening is safe in place).

> **Verifier notes** (independent adversarial check, confidence: high): Confirmed at every layer. (1) Schema: db/schema/commodityPrice.ts:16 and db/schema/manualPrice.ts:21 both read `price: real('price').notNull()`, and the generated migrations (db/migrations/0000_mushy_salo.sql:5, 0009_odd_sunfire.sql:6) contain `"price" real NOT NULL` — Postgres float4, 24-bit mantissa (~6-7 significant decimal digits). (2) Data flow is exactly as described: provider quotes arrive as full-precision JS numbers (lib/prices/provider.ts:48-50, cryptocompare pricemulti) and manual prices as user-entered JS numbers (lib/prices/service.ts:129), both inserted straight into the float4 column; PriceService.regenerateUserPriceDb (lib/prices/service.ts:70-93) reads the rounded values back and renderPriceDb (lib/prices/formatter.ts:24) interpolates them verbatim into price-db.ledger (`P ... ${r.price} ${r.quote}`), which the ledger CLI uses for all valuations. No rounding guard, no compensating cache. (3) Practical impact is real but bounded: for a 6-figure BTC price the float4 ulp is ~0.008, so cents are perturbed and the round-tripped double renders as noise like 104523.8671875 in the price file and in the manual-price list (user-entered 104523.87 will not read back as typed); relative error ~6e-8 means valuations are only marginally wrong monetarily. Medium severity is honest — not high (bounded relative error), not low (user-visible corruption of entered financial data feeding the valuation pipeline). (4) Fix is correct: `doublePrecision` is a drop-in for the existing JS-number plumbing (postgres.js returns float8 as number), and ALTER TABLE float4→float8 widens values exactly; nothing else compares or hashes the column. Note the columns are populated per-day/per-instant with unique constraints, so already-rounded historical rows stay rounded after migration — fix prevents future loss only.

### C8. Price cron does per-user query loops and fetches full price history per user

**Severity:** LOW · **Effort:** M (half day) · **Location:** `lib/prices/service.ts:73`

runOnce loops over all users calling resolveBaseCurrency (one SELECT per user, lines 163-165) and then regenerateUserPriceDb per user (line 184-186), which itself re-queries resolveBaseCurrency and calls listForQuote — fetching every commodity_price row for the quote across all symbols and all history, then filtering by the user's symbols in JS. commodity_price grows by one row per (symbol, day), and its only index is unique(symbol, quote, fetched_date) which cannot serve a quote-only WHERE, so this is a per-user sequential scan of a monotonically growing table, repeated N times per cron run and once per manual-price mutation.

```
const all = await this.deps.commodityRepo.listForQuote(base);
```

**Fix:** Fetch all userSetting rows once per cron run instead of per-user SELECTs; add a symbol filter to listForQuote (WHERE quote = $1 AND symbol IN (...)) and an index on (quote, symbol) — or leading-column reorder of the existing unique to (quote, symbol, fetched_date) — so the regen query is index-served.

> **Verifier notes** (independent adversarial check, confidence: high): Confirmed by reading lib/prices/service.ts, lib/prices/repository.ts, db/schema/commodityPrice.ts, lib/prices/scheduler.ts. All specifics check out: runOnce loops users with one resolveBaseCurrency SELECT each (service.ts:163-165), then loops regenerateUserPriceDb (184-186) which redundantly re-runs resolveBaseCurrency (72) and calls listForQuote (73). listForQuote (repository.ts:53-58) is 'WHERE quote = $1 ORDER BY fetched_at' with no symbol filter; user symbols filtered in JS (service.ts:77). Only index is unique(symbol, quote, fetched_date) (commodityPrice.ts:20-26) whose leading column is symbol, so a quote-only WHERE is a seq scan + sort. Cron is daily (scheduler.ts:21) and manual-price add/delete each trigger a regen (service.ts:133,144), so trigger cadence is as described. Severity 'low' is honest — daily cron, and the per-user `ledger commodities` CLI shell-out (service.ts:237-254, run twice per user per cron) likely dominates cost anyway; DB cost only degrades with users × price history. Suggested fix (batch userSetting fetch, symbol IN(...) filter, (quote, symbol) index or unique-column reorder) is correct and safe — column order does not change unique-constraint semantics, and userSymbols is computed in the same function so the await reorder is trivial.


---

## D. Error handling & silent failures

The recurring shape: a catch block converts a real failure into a value indistinguishable from legitimate data (`0` balance, `[]` suggestions, `ok:true` import). Implementers should adopt one convention — either throw and let the nearest error boundary/toast handle it, or return a discriminated `{ ok, error }` result — and apply it consistently at these sites.

### D1. Garage push failure during journal import is misreported as a parse failure; API returns ok:true and audit logs success

**Severity:** HIGH · **Effort:** M (half day) · **Location:** `lib/journal/service.ts:267`

In replaceFromSingleFile (and identically in replaceFromZip at lines 349-360), a failed push to Garage is caught and returned in the `parseFailure` field. The upload route (app/api/upload/route.ts:113-124) then records the audit event as `result: 'success'` and responds `ok: true` with `parseFailure` set. The import page (app/import/page.tsx:55-66) renders parseFailure with the message 'Ledger could not parse the imported journal — reports will be broken until this is fixed: Failed to save journal to storage.' — a wrong diagnosis. Worse, since imports have no rollback, the local cache now diverges from canonical storage, and the next pull (lib/storage/download.ts:83-87 deletes local files not in the remote set) silently reverts the entire import. The user believes their files landed with a parse problem when in fact nothing persisted. Additionally, when push fails, any real verify.message is discarded, so a genuine parse error is also lost.

```
try {
  await push(userId);
} catch (e) {
  return {
    uidsAdded: backfill.uidsAdded,
    parseFailure:
      e instanceof StorageConflictError
        ? e.message
        : 'Failed to save journal to storage.',
```

**Fix:** Add a distinct `pushFailure` (or `storageError`) field to the replaceFromSingleFile/replaceFromZip result types, separate from parseFailure. Have the upload route return ok:false (5xx) and record the audit event as result:'failure' with reason 'push-failed' when the push throws, and have the import UI explain that the import did not persist and will revert. Preserve verify.message alongside the storage error instead of overwriting it.

> **Verifier notes** (independent adversarial check, confidence: high): All claims verified. lib/journal/service.ts:265-274 (single) and 349-360 (zip) return push failures in the parseFailure field; app/api/upload/route.ts:113-123 records audit result:'success' and responds ok:true; app/import/page.tsx:60-62 frames it as a parse failure ('Ledger could not parse the imported journal…'). verify.message is indeed discarded when push throws (verify computed at line 264, dropped in the catch return). Silent revert confirmed: lib/storage/download.ts:83-87 deletes local files absent from the remote set on next pull, so the un-pushed import reverts. Minor mitigation the finding underweights: the import UI does show an error state and the raw 'Failed to save journal to storage.' text appears in the detail block, so the user is not told success — the diagnosis is just wrong. High severity still fair: API/audit misreport success and the import silently fails to persist.

### D2. Bare catch in getAccountBalance action swallows NEXT_REDIRECT and LockedError, returning a fake '0' balance

**Severity:** MEDIUM · **Effort:** S (<1h) · **Location:** `features/transactions/entry/actions/getAccountBalance.ts:24`

runLedger() calls requireUser() -> requireSession(), which invokes next/navigation redirect('/sign-in') (confirmed in node_modules/@naeemba/next-starter/dist/server: `if (!session) { redirect(opts.redirectTo ?? "/sign-in") }`). redirect() works by throwing NEXT_REDIRECT, and the action's bare `catch { return '0' }` swallows it, so an expired-session or locked user silently gets '0' instead of being routed to sign-in/unlock. This '0' feeds FixBalanceForm (features/transactions/entry/typeForms/FixBalanceForm.tsx:56), which computes the fix-balance adjustment from the current balance — a wrong current balance produces a wrong adjustment posting in the preview. It also defeats the LockedError data-layer backstop that CryptoGate's own comment relies on ('Correctness is still backstopped by LockedError at the data layer').

```
} catch {
    return '0';
  }
```

**Fix:** At the top of the catch block call `unstable_rethrow(err)` from 'next/navigation' (it rethrows Next internal control-flow errors like NEXT_REDIRECT), and rethrow LockedError explicitly so the client-side lock handling fires. Only map genuine ledger-CLI failures / unknown accounts to '0', or better, return a discriminated result ({ok:false} vs {ok:true, balance}) so the form can show 'balance unavailable' instead of 0.

> **Verifier notes** (independent adversarial check, confidence: high): Mechanism confirmed: features/transactions/entry/actions/getAccountBalance.ts:24 has a bare `catch { return '0' }`; runLedger (utils/runLedger.ts:32) calls requireUser -> requireSession, and node_modules/@naeemba/next-starter/dist/server/index.js:12 does `redirect(opts.redirectTo ?? "/sign-in")`, so NEXT_REDIRECT (and LockedError from lib/journal/service.ts:560 / lib/crypto/journalCipher.ts:30) is swallowed and a fake '0' is returned. However the impact is overstated: fixBalanceAdapter.compile (features/transactions/entry/types/fixBalance.ts:41-49) emits a balance ASSERTION with empty posting amounts, so ledger computes the real adjustment; the fetched balance only drives the informational 'Now: X / Implied adjustment' text in FixBalanceForm.tsx:107-116. No wrong posting enters the journal. Real bug (unstable_rethrow is the correct fix), but consequence is a misleading display + missed sign-in navigation, not wrong data — downgrade to medium.

### D3. Proxy redirects unauthenticated /api/* requests to /sign-in HTML instead of returning 401 JSON

**Severity:** MEDIUM · **Effort:** S (<1h) · **Location:** `proxy.ts:105`

The matcher only excludes `api/auth`, so all other API routes (/api/upload, /api/crypto/unlock|lock|material, /api/*/export) pass through the no-session branch at line 80 and receive a 307 redirect to /sign-in?callbackUrl=... when the session cookie is missing/expired. Client fetch() follows the redirect (307 preserves POST) and gets the sign-in page HTML; code like app/import/page.tsx (`const result: UploadResult = await res.json()`) and features/crypto/lib/unlockFlow.ts then throws a JSON parse error ('Unexpected token <'), surfacing a confusing failure instead of a clear session-expired signal. In-handler requireUser() has the same problem: it calls redirect() rather than returning 401.

```
matcher: [
    '/((?!api/auth|_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
```

**Fix:** In proxy(), before the no-session redirect, special-case API paths: `if (req.nextUrl.pathname.startsWith('/api/')) return NextResponse.json({ error: 'unauthenticated' }, { status: 401, headers: securityHeaders })`. In route handlers, replace requireUser() with a variant that returns 401 instead of redirect() (getOptionalUser + explicit 401). Client fetch helpers can then detect 401 and route to /sign-in deliberately.

> **Verifier notes** (independent adversarial check, confidence: high): Confirmed. proxy.ts:105 matcher excludes only `api/auth`; every other /api/* route (16 route.ts files under app/api, e.g. /api/upload, /api/crypto/unlock) falls through to the no-session 307 redirect at proxy.ts:80-88. app/import/page.tsx:44 does `await res.json()` before checking res.ok, so a followed redirect to sign-in HTML throws 'Unexpected token <'. Worse, features/crypto/lib/unlockFlow.ts:12-17 checks only `res.ok` — a followed redirect ends at 200 HTML so postDek would silently 'succeed' without unlocking. In-handler requireUser (app/api/upload/route.ts:17, app/api/crypto/unlock/route.ts:10) also redirects rather than returning 401, as claimed. Medium is honest; suggested fix is sound.

### D4. ConfirmDialog fires async onConfirm with no pending state; slow deletes give zero feedback

**Severity:** MEDIUM · **Effort:** S (<1h) · **Location:** `components/ConfirmDialog/ConfirmDialog.tsx:48`

AlertDialogAction closes the dialog immediately and fires onConfirm fire-and-forget ('void onConfirm()'). Transaction deletion (features/transactions/RowActions.tsx onDelete) shells out to the ledger CLI and round-trips S3, which takes seconds; during that time the row is still visible, nothing is disabled, and there is no spinner or optimistic removal — the user can plausibly open the menu and delete again, or assume the action failed. Every ConfirmDialog consumer (transactions, templates, saved views) inherits this.

```
onClick={() => {
            void onConfirm();
          }}
```

**Fix:** Make ConfirmDialog stateful: track a pending flag around await onConfirm(), disable both footer buttons and show 'Deleting…' while pending, and only close the dialog after the promise settles (control the AlertDialog open state instead of relying on the default close-on-click).

**Also reported (duplicates, folded into this item):**
- `components/ConfirmDialog/ConfirmDialog.tsx:49` — ConfirmDialog discards onConfirm rejections — failed delete actions give the user no feedback

> **Verifier notes** (independent adversarial check, confidence: high): Confirmed. components/ConfirmDialog/ConfirmDialog.tsx:46-50: AlertDialogAction is AlertDialogPrimitive.Close (components/ui/alert-dialog.tsx:164), so the dialog closes immediately while onConfirm runs fire-and-forget via 'void onConfirm()'. features/transactions/RowActions.tsx:38-43 onDelete awaits deleteTransactionAction (ledger CLI + S3 round-trip) then router.refresh() — during that window there is no pending indicator, nothing disabled, and the row remains, allowing a repeat delete attempt. All three consumers (transactions, templates, saved views) inherit it. Minor mitigation: a toast fires when the action settles, but there is zero feedback in between. Suggested stateful fix is correct.

### D5. Account/payee suggestion loaders swallow ledger failures without logging, returning [] indistinguishable from an empty journal

**Severity:** LOW · **Effort:** S (<1h) · **Location:** `lib/transactions/suggestions.ts:13`

getAccountSuggestions and getPayeeSuggestions (lines 10-24) catch every runLedger failure and return [] with no log. When ledger fails (binary missing, journal broken after a bad import, Garage unreachable with no manifest), the new/edit transaction forms silently lose all account and payee autocomplete. Neither the user nor the operator gets any signal — a degraded infra state looks identical to a brand-new user with no accounts. Every other degrade-to-default helper in this codebase (getBaseCurrency, getEntryTabOrder) at least logs the error; these log nothing.

```
export const getAccountSuggestions = async (): Promise<string[]> => {
  try {
    return splitLines(await runLedger(['accounts']));
  } catch {
    return [];
  }
};
```

**Fix:** Add a createLogger('transactions') and log.error({ err }, 'account/payee suggestions failed') in both catch blocks, mirroring lib/settings/getBaseCurrency.ts. Optionally return null on failure so the entry UI can show a 'suggestions unavailable' hint instead of an empty list.

> **Verifier notes** (independent adversarial check, confidence: high): Verified: lib/transactions/suggestions.ts:10-24 matches the evidence verbatim — both getAccountSuggestions and getPayeeSuggestions swallow runLedger failures and return [] with no logging, indistinguishable from an empty journal. Comparison claim holds: lib/settings/getBaseCurrency.ts logs via log.error in its degrade path. Low severity is honest; fix is trivial.

### D6. FixBalanceForm balance fetch is a floating promise with no rejection handler

**Severity:** LOW · **Effort:** S (<1h) · **Location:** `features/transactions/entry/typeForms/FixBalanceForm.tsx:56`

The debounced balance fetch chains `.then()` without a `.catch()`. The server action itself swallows ledger errors (returning '0'), but the action invocation can still reject on the client — network failure, expired session, deploy mid-session — producing an unhandled promise rejection in the browser and leaving the 'Now:' display stuck on the previous account's stale balance while the user has already switched accounts, since setCurrent never runs for the failed request.

```
void getAccountBalance(account, fields.targetCurrency).then((bal) => {
  if (id === reqId.current) setCurrent(bal);
});
```

**Fix:** Append a rejection handler: `.catch(() => { if (id === reqId.current) setCurrent(null); })` so a failed fetch resets the display to the 'Enter an account…' placeholder instead of leaving a stale balance and an unhandled rejection.

> **Verifier notes** (independent adversarial check, confidence: high): Verified: FixBalanceForm.tsx:56-58 chains .then() with no .catch(), and the `void` prefix discards the chain, so a client-side rejection of the getAccountBalance server-action call (network failure, deploy mid-session — the server-side try/catch returning '0' does not cover transport failures) is an unhandled promise rejection. Stale-display claim also correct: on rejection setCurrent never runs, so `current` retains the previous account's balance and line 110 renders it as 'Now: ...' for the newly selected account. Suggested .catch(() => setCurrent(null)) correctly falls back to the line-109 placeholder. Low severity appropriate.


---

## E. Server performance & Next.js behavior

Every report page shells out to the `ledger` binary, so the wins here are: don't spawn sequentially what can run in parallel (E1), don't recompute what the layout already computed (E4, E5), and don't ship or render more than the page shows (E2, E6). E7–E9 are Next.js routing/caching subtleties.

### E1. Account detail and monthly register pages chain independent awaits, including two sequential ledger spawns

**Severity:** MEDIUM · **Effort:** S (<1h) · **Location:** `app/accounts/[account]/page.tsx:24`

The account detail page awaits requireUser → savedViewService.listNames → getBaseCurrency → runLedger(register) → runLedger(balance) strictly sequentially (lines 17-31). The two ledger invocations and the two DB reads are independent; on a large journal each ledger spawn is the dominant cost, so serializing them roughly doubles page latency. app/registers/monthly/[account]/page.tsx:20-41 has the identical pattern (listNames, then two sequential runLedger calls). Dashboard.tsx already demonstrates the correct Promise.all pattern.

```
const stdout = await runLedger(
    ['register', account, '--format', 'NNN%D|%A|%P|%N|%X|%B|%C|%t|%T'],
```

**Fix:** In both pages, resolve params/validation first, then fetch everything else concurrently: `const [existingViewNames, stdout, balance] = await Promise.all([savedViewService.listNames(user.id), runLedger([...register args]), runLedger([...balance args])])` (getBaseCurrency can join the same Promise.all).

**Also reported (duplicates, folded into this item):**
- `app/accounts/[account]/page.tsx:17` — Account drill-down pages await independent data sources sequentially (two ledger CLI runs in series)

> **Verifier notes** (independent adversarial check, confidence: high): Confirmed by reading the code. app/accounts/[account]/page.tsx:17-31 awaits requireUser → savedViewService.listNames → getBaseCurrency → runLedger(register) → runLedger(balance) strictly sequentially; app/registers/monthly/[account]/page.tsx:20-41 has the same shape (getBaseCurrency, params, requireUser, listNames, then two sequential runLedger calls at lines 27 and 34). The two runLedger invocations are independent of each other and of listNames. Mitigation check: utils/runLedger.ts wraps the exec in unstable_cache (60s TTL, keyed per-args), so repeat visits within 60s are cheap — but on a cold/expired cache both spawns run, and register vs balance have different keys, so serialization genuinely adds one full ledger-spawn latency (the dominant cost on large journals). Concurrent runLedger is already the established, working pattern in this repo: features/dashboard/Dashboard.tsx:56 runs five runLedger calls in one Promise.all, and app/api/portfolio/export/route.ts:21 runs two concurrently — so parallelizing here is safe (no hidden mutex; getFingerprint journal pull already races concurrently in production paths). Severity medium is honest: real latency impact, bounded by the 60s cache. One correction to the suggested fix: getBaseCurrency CANNOT simply join the same Promise.all in either page, because the balance runLedger args include defaultCurrency ('-X', defaultCurrency). It must either stay awaited first or be chained: getBaseCurrency().then((c) => runLedger(['balance', account, '-X', c, ...])). The rest of the fix (Promise.all over listNames + both runLedger calls, after resolving params/validation) is correct.

### E2. Account detail page serializes the entire register history and renders every row twice

**Severity:** MEDIUM · **Effort:** M (half day) · **Location:** `app/accounts/[account]/page.tsx:46`

The page fetches the account's full register with no --head/date bound or pagination, then renders every posting twice — once in the mobile `<ul className="... md:hidden">` stack and again in the `hidden ... md:block` desktop table — so the HTML payload is 2× the full transaction history of the account. For a multi-year account with thousands of postings this produces a multi-megabyte response and a slow first paint, in contrast to the transactions page which pages via pageTransactions/PAGE_SIZE. The register format also requests 9 fields (`%D|%A|%P|%N|%X|%B|%C|%t|%T`) of which only 4 (date, payee, amount, total) are ever read.

```
<ul className="flex flex-col gap-3 md:hidden">
```

**Fix:** Bound the query (e.g. `--head N` with a 'show more' control, or reuse the transactions-style pagination) and render one responsive markup tree instead of two parallel ones (CSS grid/table reflow, or a single component with responsive classes). Trim the format string to the four fields actually used.

> **Verifier notes** (independent adversarial check, confidence: high): Confirmed by reading app/accounts/[account]/page.tsx. (1) Lines 24-27: register runs with format 'NNN%D|%A|%P|%N|%X|%B|%C|%t|%T' and no --head/date bound/pagination; runLedger (utils/runLedger.ts) adds no limit (its 60s unstable_cache mitigates CLI re-execution, not payload size). (2) All rows are rendered twice in a server component: mobile stack at line 46 (`<ul className="flex flex-col gap-3 md:hidden">`, rows.map at line 52) and desktop table at lines 91-133 (`hidden ... md:block`, rows.map at line 113), so the full history ships twice in the HTML/RSC payload. (3) 9 format fields requested, only 4 used (columns[0] date, [2] payee, [7] amount, [8] total); unused fields inflate ledger output/parsing but not HTML. Contrast with transactions paging is accurate (features/transactions/pageTransactions.ts:8 PAGE_SIZE=50; Transactions.tsx:23 pages first render). Medium severity is honest — realistic slow first paint / multi-MB response for high-volume accounts, no data corruption. Fix caveat: the page uses sortByDate:false and reverses in JS, so `--head N` would take the OLDEST N postings; use --tail N, or re-enable --sort -date with --head, or slice after reversing.

### E3. Every journal write re-uploads every local file to Garage, sequentially

**Severity:** MEDIUM · **Effort:** M (half day) · **Location:** `lib/storage/save.ts:54`

pushFromLocal uploads all local files on each push regardless of whether they changed: appending one transaction to main.ledger re-PUTs every include file, the price DB, and any zip-imported sub-files, one await at a time. For a multi-file journal that is N sequential S3 round-trips per add/edit/delete, directly inflating server-action latency. pullToLocal has the mirror problem on cold cache: changed objects download one-by-one in a for-await loop (lib/storage/download.ts:76).

```
for (const rel of localRels) {
    const body = await fs.readFile(path.join(dir, rel));
    const payload = encryptForUpload(userId, rel, body);
    const { etag } = await store.put(keyFor(userId, rel), payload);
```

**Fix:** Skip unchanged files: track a local content hash (e.g. sha256 of plaintext) alongside the remote ETag in the manifest, and only PUT files whose hash changed since the last push (carrying the old ETag forward for the rest). Run the remaining PUTs (and the cold-cache GETs in pullToLocal) with bounded concurrency, e.g. Promise.all over chunks of 5.

> **Verifier notes** (independent adversarial check, confidence: high): Confirmed. lib/storage/save.ts:52-59 loops over all local files and PUTs each one sequentially ('Upload every local file' per its own doc comment, line 27-28) with no content/etag short-circuit. push() is invoked on every journal mutation in lib/journal/service.ts (add at :196, imports at :266/:350, raw save at :456, edit/delete via performEdit/performDelete), so one appended transaction re-uploads every include/sub-file. The codebase itself admits the gap: features/crypto/actions/finalizeEncryption.ts:18 comment says 'pushFromLocal re-uploads every file with no content/etag short-circuit'. The pullToLocal half is accurately scoped by the reporter: download.ts:67-75 already skips unchanged ETags when the local file exists, so only cold cache pays the sequential per-object GET loop (store.get at :76 inside the for loop at :58). Severity medium is honest — latency scales with file count but single-file journals (the default layout) are unaffected, and no corruption is possible. Suggested fix is correct: comparing a plaintext hash (ciphertext hash won't work since encryptForUpload is non-deterministic) and carrying the old ETag forward preserves the conflict check at save.ts:44-49, which compares manifest ETags to remote ETags — skipping a PUT leaves both sides unchanged. Bounded-concurrency Promise.all over distinct keys is safe.

### E4. getLayout/ensureLayout are not request-memoized: duplicate userSetting queries on every runLedger call

**Severity:** MEDIUM · **Effort:** S (<1h) · **Location:** `utils/runLedger.ts:36`

Each runLedger call performs two identical userSetting selects: getFingerprint → ensureLayout → getLayout (lib/journal/repository.ts:40) and then its own explicit getLayout, plus repeated mkdir/access/price-db fs.access checks. The repository already React-caches the pull (cachedPull) precisely because 'a single render fires ~8 concurrent reads', but the layout lookup was left uncached — so a dashboard render (5 runLedger calls) plus the layout slots issues ~14 identical DB round-trips per request.

```
const { mainPath, priceDbPath } = await journalRepository.getLayout(user.id);
```

**Fix:** Wrap the layout resolution in React cache() keyed by userId, next to cachedPull in lib/journal/repository.ts (e.g. `const cachedLayout = cache((userId) => repo.ensureLayout(userId))`), and have runLedger and getFingerprint both consume it so one request does one userSetting select and one fs probe.

> **Verifier notes** (independent adversarial check, confidence: high): Confirmed by reading utils/runLedger.ts:35-36 and lib/journal/repository.ts. Each runLedger call does getFingerprint -> cachedPull + ensureLayout -> getLayout (userSetting select #1, mkdir, 2x fs.access) and then a second explicit getLayout (userSetting select #2 + fs.access for price-db). Only the pull is React-cached (repository.ts:20-22 'cachedPull'); getLayout/ensureLayout have no cached wrapper anywhere (verified via grep of all callers). The repository's own comment (repository.ts:13-14) states a single render fires ~8 concurrent reads (7x runLedger + recent-tx/stats), so the fan-out is actually larger than the finding's '5 runLedger calls' — ~14+ identical userSetting selects per dashboard render, plus loadJournalTransactions.ts:22 adds another getFingerprint->ensureLayout->getLayout. Suggested fix (module-level React cache() keyed by userId, consumed by runLedger and getFingerprint) mirrors the existing cachedPull pattern and is safe: cache() is a passthrough outside render, and write paths (service.ts:229/444/527, prices service) keep the uncached methods so no intra-request staleness after setMainFile. Minor correction: finding cites utils/runLedger.ts:36 (correct) but the duplicate-select chain in repository is getFingerprint at repository.ts:131-133 -> ensureLayout:57 -> getLayout:40. Severity medium is honest — redundant PK-indexed selects and fs syscalls, no correctness impact.

### E5. Root layout runs a full flat balance report on every page via BaseCurrencyBanner

**Severity:** MEDIUM · **Effort:** M (half day) · **Location:** `components/BaseCurrencyBanner/BaseCurrencyBanner.tsx:12`

app/layout.tsx mounts BaseCurrencyBanner and BaseCurrencyPickerSlot on every route, and they call getMissingRateCommodities (`ledger balance --flat --no-total -X base` over the whole journal) and getAvailableCurrencies (`ledger commodities`). The 60s unstable_cache bounds the spawns, but every navigation still pays the uncached prefix of runLedger — pullLocked's Garage ListObjectsV2, session lookup, and layout DB reads — even on pages that never use ledger data (settings, templates, sign-in redirect targets), and each journal write re-triggers both full reports on the next paint of any page. The banner is a rarely-changing advisory, not per-page data.

```
getMissingRateCommodities(),
```

**Fix:** Lengthen the freshness contract for these two layout slots: cache getMissingRateCommodities/getAvailableCurrencies with their own unstable_cache keyed by the journal tag with a longer revalidate (e.g. 10 minutes) and rely on revalidateTag from the write path for correctness, so page navigations don't add a full-journal balance run; or compute the missing-rate warning once at write/price-refresh time and store it in userSetting.

> **Verifier notes** (independent adversarial check, confidence: high): Confirmed. app/layout.tsx:56-57 mounts BaseCurrencyPickerSlot + BaseCurrencyBanner in the root layout; BaseCurrencyBanner.tsx:12 calls getMissingRateCommodities → runLedger(['balance','--flat','--no-total','-X',base]) (lib/settings/getMissingRateCommodities.ts:10-16), and BaseCurrencyPickerSlot.tsx:10 calls getAvailableCurrencies → runLedger(['commodities']). In utils/runLedger.ts only the exec is inside unstable_cache (60s, journal tag); the uncached prefix — requireUser session lookup, getFingerprint → pullLocked (Garage ListObjectsV2), getLayout DB read, ensureLayout fs — runs on every layout server render (React cache() in lib/journal/repository.ts:20-22 dedups within a single request only, so on non-ledger pages like settings/templates this is added cost). The write-retrigger claim is actually stronger than stated: lib/journal/service.ts:88 fires revalidatePath('/', 'layout') on every journal mutation (settings actions do the same), purging the router cache and forcing both slots to re-render with a new fingerprint key, re-running both full reports. Two corrections: (1) 'every navigation' is overstated — App Router partial rendering preserves shared layouts on soft client navigations; cost is paid on hard loads, router.refresh, and after any mutation via the blanket revalidatePath('/', 'layout'), which in this app is frequent; (2) the suggested unstable_cache wrapper won't work as written — runLedger calls requireUser() (cookies) and connection(), which are illegal inside unstable_cache, so userId/fingerprint must be passed in explicitly, or use the alternate fix (compute at write/price-refresh time and store in userSetting), which is sound. Severity medium stands: bounded by the 60s TTL but adds a Garage round-trip + DB read to every hard render of every page and two full-journal ledger runs after each write.

### E6. Net-worth and cash-flow reports compute full-history monthly registers then discard all but 36 months

**Severity:** LOW · **Effort:** S (<1h) · **Location:** `features/netWorth/NetWorth.tsx:29`

NetWorth runs `ledger reg ^Assets ^Liabilities --monthly` over the entire journal and slices the result to the last 36 months in JS; MonthlyComparison.utils.ts getCashFlow does the same for both ^Expenses and ^Income (slice(-MONTHS_BACK) after fetching everything). For a decade-old journal, ledger aggregates and prints every month since inception, and the extra stdout is parsed and thrown away on every cache miss. Note the net-worth running total (%T) must still start from inception, so only the display window should be bounded, not the computation start for that report — but the cash-flow per-month totals (%t) can safely pass `-b <36 months ago>`.

```
const rows = parseNetWorthRows(stdout).slice(-MONTHS_BACK);
```

**Fix:** In getCashFlow, add `-b ${toISODate(startOfMonth(subMonths(now, 36)))}` to both register invocations so ledger only aggregates the window being rendered. For NetWorth keep the full-history register (running total requires it) but drop the redundant second parse of stdout (lines 35-40 re-split what parseNetWorthRows already parsed).

> **Verifier notes** (independent adversarial check, confidence: high): Verified. features/netWorth/NetWorth.tsx:29 contains exactly `const rows = parseNetWorthRows(stdout).slice(-MONTHS_BACK);` after an unbounded `ledger reg ^Assets ^Liabilities --monthly` (lines 15-27, no -b/-e). features/monthlyComparison/MonthlyComparison.utils.ts:16-19 runs unbounded --monthly registers for ^Expenses and ^Income and getCashFlow slices(-MONTHS_BACK) at line 47. utils/runLedger.ts caches exec via unstable_cache with 60s TTL (lines 11-21), so full-history work recurs per cache miss as claimed. The fix is correct for cash flow: format is %t (per-period), independent per month, so -b is safe; and the finding correctly notes NetWorth's %T running total requires inception-start, excluding it from the -b fix. One correction: the suggestion to 'drop the redundant second parse' in NetWorth (lines 35-40) is not a pure deletion — lib/netWorth/parse.ts returns only {date, value:number} and discards the raw amount string that lines 35-40 preserve for formatAmount; the parser return type must be extended to carry the raw string. Severity 'low' is honest (arguably generous — ledger parses the whole journal regardless of -b; savings are pre-window aggregation plus extra stdout/JS parsing only, ~120 vs 36 lines for a 10-year journal). Effort S.

### E7. CryptoGate in the root layout calls headers() unconditionally, forcing every route — including the public landing — dynamic

**Severity:** LOW · **Effort:** M (half day) · **Location:** `components/crypto/CryptoGate.tsx:14`

CryptoGate is rendered in app/layout.tsx for every route and awaits headers() before its public/auth-path short-circuit. headers() is a dynamic API, so the entire route tree — including the marketing landing at '/', which is otherwise auth-free and static-friendly — is rendered dynamically per request; the landing can never be prerendered or CDN-cached. It also makes the scattered `export const dynamic = 'force-dynamic'` declarations (app/transactions, app/prices, app/portfolio, app/templates) redundant/misleading, since every route is already dynamic via the layout.

```
const pathname = (await headers()).get('x-pathname') ?? '';
```

**Fix:** Introduce route groups: app/(public)/ for the landing + account/deleted + auth pages with a gate-free layout, and app/(app)/ whose layout renders CryptoGate. The landing becomes statically prerenderable and the gate only runs where it can act. If restructuring is too invasive now, at minimum document that the landing is intentionally dynamic. Caution: several pages (see the /payees finding) currently rely on this incidental dynamism, so pair the change with explicit dynamic APIs/exports on those pages.

> **Verifier notes** (independent adversarial check, confidence: medium): Partially correct. components/crypto/CryptoGate.tsx:13 does await headers() unconditionally and is rendered in app/layout.tsx:54, forcing dynamic rendering everywhere; the force-dynamic exports (app/transactions, app/prices, app/portfolio) are indeed redundant for rendering mode. But the causal framing is over-attributed: the same root layout also renders BaseCurrencyBanner (components/BaseCurrencyBanner/BaseCurrencyBanner.tsx:7) and BaseCurrencyPickerSlot (components/BaseCurrencyPicker/BaseCurrencyPickerSlot.tsx:7), both calling getOptionalUser -> auth.api.getSession({ headers: await headers() }) unconditionally — so the landing is dynamic for three independent reasons, and 'the landing is otherwise auth-free and static-friendly' is inaccurate. The route-group fix only works if the (public) layout also drops those two slots. Low severity stands.

### E8. prefetch={false} redirect-loop fix not applied to other Links to '/' shown to users with a session cookie

**Severity:** LOW · **Effort:** S (<1h) · **Location:** `app/account/deleted/page.tsx:14`

UnlockScreen/SetupWizard document that prefetching href="/" replays the proxy bounce chain (/ -> /dashboard -> CryptoGate redirect) as a storm of ?_rsc requests, and set prefetch={false}. The same Link exists without the fix in three places reachable with a session cookie present: app/account/deleted/page.tsx:14 (publicPaths.ts explicitly documents that a stale session cookie can remain here after signOut() fails, so the proxy bounce fires on prefetch), features/auth/AuthScreen.tsx:57 and features/auth/BrandPanel.tsx:24 (auth pages are reachable while signed in per proxy.ts:49-56, so a signed-in — possibly locked — visitor prefetches / and triggers the redirect chain). These chains don't terminate at the current page so a sustained loop is less likely than the original bug, but each viewport entry wastes a multi-hop redirect and the class of bug is identical.

```
<Link href="/" className={buttonVariants({ variant: 'outline' })}>
```

**Fix:** Add prefetch={false} to the href="/" Links in app/account/deleted/page.tsx, features/auth/AuthScreen.tsx, and features/auth/BrandPanel.tsx, mirroring the comment and fix in features/crypto/UnlockScreen.tsx:43-47.

> **Verifier notes** (independent adversarial check, confidence: medium): Confirmed factually: app/account/deleted/page.tsx:14, features/auth/AuthScreen.tsx:56-60, and features/auth/BrandPanel.tsx:23-27 each render <Link href="/"> without prefetch={false}, while features/crypto/UnlockScreen.tsx:43-47 and SetupWizard.tsx:82-84 carry the fix with the documented ?_rsc-storm rationale. proxy.ts:67-76 does bounce a cookie-bearing prefetch of '/' to /dashboard, so each viewport entry costs a redirect chain (and for a locked user, a further CryptoGate redirect). The finding correctly concedes these chains don't terminate at the current page, so no sustained loop like the original bug — impact is wasted multi-hop prefetch work only. Stands as low/polish.

### E9. /payees redirect computes 'now' with no dynamic API — correct only because the root layout incidentally forces dynamic rendering

**Severity:** LOW · **Effort:** S (<1h) · **Location:** `app/payees/page.tsx:5`

PayeesIndex computes a 12-month date range with `new Date()` and redirect()s to /payees/<from>/<to>. The component uses no dynamic API (no cookies/headers/connection), so on its own it would be statically prerendered at build time and the redirect target — including the dates — baked in, serving every visitor a range frozen at the last deploy. Today it renders per-request only because CryptoGate's headers() call in the root layout makes all routes dynamic; if that gate is ever scoped (see the CryptoGate finding) or the page moves, this silently regresses to build-time dates.

```
const to = new Date();
  const from = new Date(to.getFullYear(), to.getMonth() - 11, 1);
  redirect(`/payees/${toISODate(from)}/${toISODate(to)}`);
```

**Fix:** Add `export const dynamic = 'force-dynamic';` to app/payees/page.tsx (or `await connection()` from next/server before computing dates, matching the pattern in utils/runLedger.ts) so request-time date computation is guaranteed independent of layout behavior.

> **Verifier notes** (independent adversarial check, confidence: high): Verified. app/payees/page.tsx:5-7 matches the evidence verbatim: new Date() range computed in a server component with no dynamic API, redirect() to /payees/<from>/<to>. Without external forcing, Next would prerender this and bake the redirect target (dates frozen at last deploy). The claimed incidental mitigation is real: components/crypto/CryptoGate.tsx awaits headers() and is rendered from app/layout.tsx root layout, making all routes dynamic today — so this is a latent regression risk, not an active bug, which the finding states honestly. Supporting evidence for it being an oversight rather than intent: every other date/request-dependent page (app/transactions/page.tsx:3, app/portfolio/page.tsx:3, app/prices/page.tsx:5, app/templates/page.tsx:3) explicitly declares export const dynamic = 'force-dynamic'; payees is the sole outlier. Suggested fix is correct and matches the existing pattern (utils/runLedger.ts:31 does await connection()). Severity low is appropriate.


---

## F. Client performance & bundle

The transaction-entry surface (CodeMirror + per-posting Comboboxes) dominates this section. F1+F2 (memoized extensions, lazy-loaded editor) and F3 (capped/virtualized Combobox) are the user-visible ones.

### F1. CodeMirror extensions rebuilt every render, forcing a full editor reconfigure on each keystroke

**Severity:** MEDIUM · **Effort:** S (<1h) · **Location:** `features/transactions/entry/LedgerEditor.tsx:80`

LedgerEditor recreates its entire `extensions` array (language, autocompletion source, keymaps, EditorView.theme, DOM event handlers) on every render. @uiw/react-codemirror's useCodeMirror dispatches `StateEffect.reconfigure` whenever the `extensions` or `onChange` identities change (verified in node_modules/@uiw/react-codemirror/cjs/useCodeMirror.js: `}, [theme, extensions, ..., onChange, onUpdate]`). Because RawLens also passes a new inline `onChange` closure each render, every keystroke in the raw editor causes: setText → RawLens re-render → new extensions array + new onChange → full CodeMirror reconfigure (autocomplete plugin, theme stylesheet, keymaps rebuilt). This makes typing in the raw journal editor pay a whole-editor reconfiguration per character.

```
const extensions: Extension[] = [
    ledgerLanguage(),
    indentUnit.of('    '),
    autocompletion({ override: [ledgerCompletions(lists)], icons: false }),
```

**Fix:** Wrap the extensions array in `useMemo` keyed on `[accounts, payees, commodities, ariaLabel]`. Move the static extensions (theme, indentUnit, keymaps) to module scope. For the onChange used inside keymap/blur closures, hold it in a ref (`const onChangeRef = useRef(onChange); onChangeRef.current = onChange;`) and call `onChangeRef.current(...)` inside the extensions so the memoized array never depends on it. In RawLens, wrap its `onChange` handler in `useCallback` (or accept that the ref pattern in LedgerEditor makes the prop identity irrelevant to the reconfigure effect — note react-codemirror also lists `onChange` in the reconfigure deps, so pass a stable `useCallback` from RawLens too).

> **Verifier notes** (independent adversarial check, confidence: high): Verified all three links of the chain. (1) features/transactions/entry/LedgerEditor.tsx:80 builds the extensions array inline every render with fresh ledgerLanguage(), autocompletion(), keymap.of(), and EditorView.theme() instances — no useMemo. (2) node_modules/@uiw/react-codemirror/cjs/useCodeMirror.js:179-186 dispatches StateEffect.reconfigure.of(getExtensions) in an effect whose deps include `extensions` and `onChange`, so any identity change triggers a full reconfigure. (3) features/transactions/entry/RawLens.tsx:33 passes an inline onChange that calls setText, so every keystroke re-renders and hands CodeMirror a new extensions array + new onChange. Extra confirmed cost: each render's EditorView.theme() creates a new StyleModule (fresh class) that CodeMirror mounts and never removes, so styles accumulate during a typing session, and the new ledgerLanguage() instance forces a doc reparse per keystroke. However, the editor holds a single transaction (min-height 12rem), not the whole journal file, so the per-keystroke cost is milliseconds on a tiny doc — real waste plus a slow style leak, but unlikely to cause visible typing lag; severity should be medium, not high. The suggested fix is directionally correct but incomplete as written: RawLens's defaults (accounts = [], payees = [], commodities = [] at RawLens.tsx:14-16) create new array identities per render, so a useMemo keyed on those arrays still busts unless callers pass stable arrays; and RawLens's onChange closes over `draft`, so a plain useCallback would still change identity on every accepted edit — the onChange-in-a-ref pattern (for both the extension closures and the prop passed to <CodeMirror onChange>) is the necessary part.

### F2. CodeMirror stack eagerly bundled into transaction entry route (no lazy loading anywhere in repo)

**Severity:** MEDIUM · **Effort:** S (<1h) · **Location:** `features/transactions/entry/RawLens.tsx:4`

TransactionEntry statically imports RawLens (TransactionEntry.tsx:14), which statically imports LedgerEditor, which imports @uiw/react-codemirror plus @codemirror/autocomplete, commands, language, state, view and @lezer/highlight. The Raw lens is only one of three tabs and is rendered conditionally (`{active === 'raw' && <RawLens .../>}` at TransactionEntry.tsx:218), yet the entire CodeMirror stack (~300KB+ minified) ships in the /transactions/new and /transactions/[uid]/edit route bundles for every user, including those who only ever use the Form or Types tabs. A repo-wide grep shows zero uses of next/dynamic or React.lazy, so nothing in the app is code-split below the route level.

```
import { LedgerEditor } from './LedgerEditor';
```

**Fix:** In RawLens.tsx, replace the static import with `const LedgerEditor = dynamic(() => import('./LedgerEditor').then((m) => m.LedgerEditor), { ssr: false, loading: () => <textarea className="..." disabled /> })` (or React.lazy + Suspense since RawLens is already a client component). CodeMirror then downloads only when the Raw tab is first activated. Keep lib/ledger/highlight.ts and completions.ts reachable only from LedgerEditor so they split with it.

> **Verifier notes** (independent adversarial check, confidence: high): Confirmed by reading the code. Static chain: app/transactions/new/page.tsx -> features/transactions/NewTransaction.tsx:2 -> features/transactions/entry/TransactionEntry.tsx:14 -> features/transactions/entry/RawLens.tsx:4 ('import { LedgerEditor } from ./LedgerEditor') -> LedgerEditor.tsx:3-18 importing @uiw/react-codemirror plus @codemirror/autocomplete, commands, language, state, view; lib/ledger/highlight.ts:7 adds @lezer/highlight. RawLens renders only when the Raw tab is active (TransactionEntry.tsx:217, not 218 — off-by-one in the claim; default tab is orderedTabs[0] per user tab-order setting at lines 95-97). Repo-wide grep confirms zero uses of next/dynamic or React.lazy in app/, features/, components/. CodeMirror is referenced nowhere else outside LedgerEditor + lib/ledger/{completions,highlight}.ts, so the proposed dynamic() split is clean; RawLens is a client component so ssr:false is valid, and it owns its own text state so async editor mount is safe. Severity medium is appropriate: cost is limited to the two transaction-entry routes but those are the app's hot path.

### F3. Combobox renders all options into the DOM with no cap or virtualization; cmdk rescores the full list per keystroke

**Severity:** MEDIUM · **Effort:** M (half day) · **Location:** `components/Combobox/Combobox.tsx:93`

Combobox mounts one CommandItem per option with no limit and no windowing, and cmdk's default filter re-scores and re-sorts every item on each keystroke. This component is fed the complete account and payee lists (transactions Filters page passes all payees/accounts derived from the whole journal; FormLens renders one accounts Combobox per posting row). For journals with a few thousand payees, opening the picker mounts thousands of DOM nodes and each typed character re-runs command-score over all of them — a well-known cmdk lag threshold. cmdk explicitly recommends virtualization or capping above ~1-2k items.

```
<CommandGroup>
          {options.map((opt) => (
            <CommandItem key={opt} value={opt} onSelect={commit}>
```

**Fix:** Set `shouldFilter={false}` on the Command, filter `options` yourself against `search` (simple includes/startsWith), and render only the top N (e.g. 100) matches with a 'refine your search' hint when truncated. Alternatively integrate @tanstack/react-virtual inside CommandList. Either approach bounds both the DOM size and the per-keystroke scoring cost.

> **Verifier notes** (independent adversarial check, confidence: high): Confirmed by reading the code. components/Combobox/Combobox.tsx:92-97 maps all options to CommandItems with no cap or virtualization; the Command wrapper (line 129) and components/ui/command.tsx never set shouldFilter, so cmdk 1.1.1's default command-score filter re-scores the full list per keystroke. Callers verified: features/transactions/Transactions.tsx:24-27 derives complete payee/account lists from the whole journal and passes them uncapped via Filters.tsx:71-91; features/transactions/entry/FormLens.tsx:91 and :186 render one accounts Combobox per posting row with the full account list. @tanstack/react-virtual is already a project dependency but unused here. Suggested fix is correct and safe — the free-text "Use ..." item and CommandEmpty are already manually gated (line 85), so shouldFilter={false} + manual filtering + top-N cap would not regress them. Medium severity is accurate: real per-keystroke O(n) scoring and DOM bloat, noticeable only at thousands of options, no data corruption.

### F4. Posting rows keyed by array index in a removable list

**Severity:** LOW · **Effort:** M (half day) · **Location:** `features/transactions/entry/FormLens.tsx:132`

PostingRow is keyed by `idx` while postings can be removed from the middle via `removePosting`. When row i is deleted, every row after it keeps its old key, so React reuses component instances: internal state of Combobox (open/search text) and AmountInput's caret ref attach to the wrong posting, and all trailing rows re-render with shifted props instead of one row unmounting. With controlled values the data stays correct, but transient UI state (an open account dropdown, in-progress search text, caret restore position) migrates to the neighbouring row, and React does maximal reconciliation work on every removal.

```
{draft.postings.map((posting, idx) => (
            <PostingRow
              key={idx}
```

**Fix:** Add a stable `id` to DraftPosting in draftReducer (generate with a counter or crypto.randomUUID() in `emptyPostings`/`addPosting`/`initDraft`), and use `key={posting.id}`. Keep dispatching by index or switch actions to id-based addressing.

> **Verifier notes** (independent adversarial check, confidence: high): Code facts confirmed: features/transactions/entry/FormLens.tsx:130-132 maps draft.postings with `key={idx}`, and draftReducer.ts 'removePosting' (`state.postings.filter((_, i) => i !== action.index)`) removes from the middle; remove buttons are enabled on every row when length > 2 (`canRemove={draft.postings.length > 2}`). Combobox (components/Combobox/Combobox.tsx:43-44) holds internal `open`/`search` state, so the index-key anti-pattern is genuinely present and React will reuse instances across shifted rows. However the described user-visible harms are almost entirely mitigated in practice: (1) Combobox clears `search` whenever it closes (`if (!next) setSearch('')`, line 48), so no in-progress search text survives to migrate; (2) an open Popover/CommandDialog closes on outside pointerdown, so a dropdown cannot realistically be open on row i+1 while the user clicks remove on row i; (3) AmountInput's caretRef (AmountInput.tsx:26-33) is set in handleChange and consumed on the very next layout effect — it is never pending across a removal, and setSelectionRange on an unfocused input is harmless; (4) extra reconciliation on removal is trivial for 2-10 identical small rows. All values are controlled, so data is never wrong. Verdict: the anti-pattern and fix (stable posting id) are valid and worth doing as hygiene, but 'medium' overstates it — there is no realistic user-visible defect today. One fix caveat: DraftPosting flows through serializeDraftJson/persisted drafts, so an added `id` field must be stripped or tolerated on serialize/parse.

### F5. TransactionRowItem mounts two full interactive row variants (mobile + desktop) per virtualized row

**Severity:** LOW · **Effort:** S (<1h) · **Location:** `features/transactions/TransactionRowItem.tsx:51`

Each row renders both a mobile card and a desktop grid, hidden with CSS (`md:hidden` / `hidden md:grid`). Both variants call `actionsNode(t)` — so every visible row mounts two RowActions trees (DropdownMenu + ConfirmDialog + SaveAsTemplateDialog, each with its own useState/useRouter) — and `magnitudeByCurrency(t)` plus date formatting run twice per row. With ~18–26 rows rendered by the virtualizer (viewport + overscan 8), that's ~50 dropdown/dialog component trees where half are permanently invisible, doubling per-row render and reconciliation cost that virtualization exists to bound.

```
const TransactionRowItem = ({ row: t }: { row: TransactionRow }) => (
  <>
    {/* Mobile: stacked card
```

**Fix:** Compute shared derived values once per row (`const magnitudes = magnitudeByCurrency(t); const date = formatDateWithLocale(...); const actions = actionsNode(t);`) and reference them in both variants — React elements can be rendered in one place only, so render `actions` in a single shared slot or use the existing `useIsMobile` hook to render exactly one variant (the list is client-only, so no SSR-hydration concern).

> **Verifier notes** (independent adversarial check, confidence: high): Confirmed by reading the code. features/transactions/TransactionRowItem.tsx renders both a mobile card (md:hidden, line 54) and a desktop grid (hidden md:grid, line 83) per row; actionsNode(t) is called twice (lines 65 and 99), magnitudeByCurrency(t) twice (lines 72, 93), formatDateWithLocale twice (lines 62, 85). RowActions.tsx is stateful (useState line 36, useRouter line 35) and includes DropdownMenu + ConfirmDialog + SaveAsTemplateDialog plus a toTemplateDraft postings map per render, so two instances mount per row. TransactionList.tsx confirms overscan: 8 (line 39), estimateSize 80, h-[70vh] container — the ~18–26 rendered rows / ~50 RowActions estimate is realistic. Mitigating nuance: base-ui menu/dialog content is portal-mounted only when open, so the hidden half is mostly trigger shells, not full menu DOM — 'low' severity is honest. Fix caveats: (a) the claim that 'the list is client-only, so no SSR-hydration concern' is wrong — 'use client' components are still SSR'd, though the virtualizer emits no rows server-side (no scroll rect), so useIsMobile works but may flash the wrong variant on first client paint; (b) referencing a single hoisted `actions` element in both variants dedupes computation but still mounts two component instances — only rendering exactly one variant eliminates the duplicate mounts.

### F6. Account tree rebuilt and re-sorted synchronously on every search keystroke

**Severity:** LOW · **Effort:** S (<1h) · **Location:** `features/accounts/AccountsView.tsx:18`

Each character typed into the accounts search re-runs filter + `buildAccountTree` (map construction, recursive `localeCompare` sort of every level) + `bucketRoots`, then `countLeaves(bucket.roots)` per bucket in render, all synchronously in the same render as the controlled input update. For typical account counts (hundreds) this is fine, but for large charts of accounts each keystroke blocks the input paint on a full tree rebuild, and there is no `useDeferredValue`/debounce to keep typing responsive.

```
const buckets = useMemo(() => {
    const filtered = trimmed
      ? rows.filter((r) => r.account.toLowerCase().includes(trimmed))
      : rows;
    return bucketRoots(buildAccountTree(filtered));
  }, [rows, trimmed]);
```

**Fix:** Wrap the query in `const deferred = useDeferredValue(trimmed)` and key the useMemo on `deferred` so the input update paints immediately and the tree rebuild happens in a deferred render. Additionally, build the unfiltered tree once (memo on `rows` only) and filter tree nodes rather than rebuilding from rows, and fold `countLeaves` into the memoized bucket computation instead of calling it in JSX per render.

> **Verifier notes** (independent adversarial check, confidence: high): Confirmed by reading the code. features/accounts/AccountsView.tsx lines 15-23: useMemo keyed on [rows, trimmed] where trimmed derives from controlled query state, so each keystroke synchronously re-runs filter + buildAccountTree + bucketRoots; line 40 calls countLeaves(bucket.roots) in JSX per render outside the memo. features/accounts/accountTree.ts lines 63-67 confirm the recursive localeCompare sort at every tree level. No useDeferredValue/startTransition/debounce present. Impact is real but only material for very large charts of accounts (thousands of rows); for typical personal-ledger sizes the work is sub-millisecond, which the reporter honestly concedes. Suggested fix (useDeferredValue + memo unfiltered tree on rows + fold countLeaves into memo) is correct; one caveat — filtering tree nodes instead of rebuilding must retain ancestor chains of matches (current full-path substring filter handles this implicitly), so that refactor needs mild care. Severity 'low' is accurate; this is a polish-level perf finding, effort S.

### F7. Duplicate icon libraries: @heroicons/react kept as a dependency for exactly two icons alongside lucide-react

**Severity:** LOW · **Effort:** S (<1h) · **Location:** `components/Help/Help.tsx:1`

lucide-react is the icon library used across the app (sidebar nav config, crypto flows, settings cards, etc.), but @heroicons/react remains in dependencies and is imported in only two places: QuestionMarkCircleIcon in components/Help/Help.tsx and ArrowRightIcon in components/Card/Card.tsx. Both are in Next's default optimizePackageImports list so the tree-shaken cost is small, but shipping icon glyphs from two libraries adds redundant bytes (Help renders on nearly every page) and one extra dependency to maintain for two icons that have direct lucide equivalents.

```
import { QuestionMarkCircleIcon } from '@heroicons/react/24/outline';
```

**Fix:** Replace QuestionMarkCircleIcon with lucide's CircleHelp and ArrowRightIcon with lucide's ArrowRight in the two components, then remove @heroicons/react from package.json.

> **Verifier notes** (independent adversarial check, confidence: high): Confirmed by reading the code. package.json line 36 has "@heroicons/react": "^2.2.0" and line 50 has "lucide-react": "^1.16.0". Repo-wide grep (excluding node_modules/.next) shows exactly two heroicons imports: components/Help/Help.tsx:1 (QuestionMarkCircleIcon) and components/Card/Card.tsx:1 (ArrowRightIcon), while lucide-react is imported in 20+ files. Help is rendered on many pages (app/debts, app/balance, app/import, features/reconcile, etc.), so both icon libraries' glyphs ship in common routes. Suggested fix is safe: lucide provides ArrowRight and CircleHelp equivalents and there are no other heroicons consumers, so the two swaps plus removing the dependency break nothing. Severity low is honest — impact is bounded because both packages are covered by Next's default optimizePackageImports tree-shaking; this is dependency hygiene, effort S.


---

## G. Architecture & conventions

G1 is the big one: six routes are full pages living in app/, reported independently by four review dimensions. Do it AFTER the correctness fixes in sections A and E that touch the same files (A9, A13, E1) so the extraction moves already-fixed code. G2–G3 consolidate the six divergent hand-rolled ledger-output parsers — that consolidation is also the natural home for the parsing fixes in A7–A8.

### G1. Six route files are full-fat pages, violating the thin-route-shell convention

**Severity:** MEDIUM · **Effort:** M (half day) · **Location:** `app/balance/page.tsx:11`

Project convention (stated in memory/structure) is that app/ pages are thin shells with real UI in features/. Six routes embed the entire feature in app/: app/balance/page.tsx (105 lines: runLedger + full table UI), app/balance/[from]/[to]/page.tsx (172), app/accounts/[account]/page.tsx (138), app/registers/monthly/[account]/page.tsx (122), app/debts/page.tsx (98), and app/import/page.tsx (166 lines and marked 'use client', so the whole page is a client component living in app/). Most other routes (net-worth, monthly, reconcile, templates, portfolio at 7 lines each) follow the convention, so these are inconsistent outliers that also can't be reused or unit-tested the way features/ components are.

```
const Balance = async () => {
  const defaultCurrency = await getBaseCurrency();
  const stdout = await runLedger([
```

**Fix:** Move each page body into features/ (features/balance/BalanceView.tsx, features/registers/..., features/importer/ImportPage.tsx, etc.) and reduce each app/ page to an import + render shell, matching app/net-worth/page.tsx. No behavior change required; mechanical extraction.

**Also reported (duplicates, folded into this item):**
- `app/balance/[from]/[to]/page.tsx:28` — Several app/ pages are fat server components with ledger-CLI invocation, parsing, and full UI inline — not thin route shells
- `app/balance/[from]/[to]/page.tsx:16` — Six app/ routes contain full page UI, violating the thin-route-shell convention
- `app/accounts/[account]/page.tsx:36` — Route files under app/ contain full report UI and parsing logic, violating the thin-route-shell convention
- `app/import/page.tsx:1` — app/import/page.tsx is a 166-line 'use client' page — full UI in app/, violating the thin-route-shell convention

> **Verifier notes** (independent adversarial check, confidence: high): Confirmed by reading the code. app/balance/page.tsx (105 lines) matches the evidence quote verbatim at lines 11-13 and contains runLedger data fetching plus a full inline table UI. All other cited line counts are exact: app/balance/[from]/[to]/page.tsx = 172, app/accounts/[account]/page.tsx = 138, app/registers/monthly/[account]/page.tsx = 122, app/debts/page.tsx = 98, app/import/page.tsx = 166 and begins with 'use client' (entire client component lives in app/). Each of these fetches data (runLedger/getBaseCurrency/savedViewService) and renders full feature JSX inline, unlike compliant routes such as app/net-worth/page.tsx (7 lines, imports features/netWorth). The stated project convention ("app/ pages must stay thin route shells with real UI in features/") is explicitly violated. Severity medium is fair for a convention/maintainability issue with no runtime impact; the suggested mechanical extraction to features/ is correct and low-risk.

### G2. Same ledger report defined twice with divergent parsers (page vs CSV export)

**Severity:** MEDIUM · **Effort:** M (half day) · **Location:** `app/balance/[from]/[to]/page.tsx:43`

app/api/balance/periodic/export/route.ts runs the identical ledger command (`bal Expenses -b … -e … -X … --format NNN%A|%t|%T\n`) as the periodic balance page, but the export parses via lib/balance/parsePeriodic.ts while the page re-implements parsing inline with ad-hoc split/filter chains. Same for debts: app/debts/page.tsx parses `NNN%A|%T` inline with `allDebts.slice(1, allDebts.length - 1)` while app/api/debts/export/route.ts uses lib/balance/parse.ts. The report definition (args) and its parser exist in two copies each, so the on-screen table and the exported CSV can silently drift. lib/payees/parse.ts shows the intended pattern — its docstring even says it was extracted 'for byte-for-byte parity' with the page, and features/payees/Payees.tsx correctly consumes it.

```
.filter((each) => each.split('|')[1].split('\n')[0] !== '0');
```

**Fix:** Move the ledger arg-building plus parsing for each report into lib/<domain>/ (buildPeriodicBalanceArgs + parsePeriodicBalanceRows already exist — make the page consume them; add lib/debts/parse or reuse parseBalanceRows in app/debts). Both the page component and the export route should call the same builder + parser so a format change touches one file.

> **Verifier notes** (independent adversarial check, confidence: high): Confirmed. Page (app/balance/[from]/[to]/page.tsx:28-49) runs the identical ledger args as the export route but parses inline; export uses lib/balance/parsePeriodic.ts. Evidence quote matches line 43 verbatim. The debts pair is even stronger evidence than claimed: the page (app/debts/page.tsx:11-21) and export (app/api/debts/export/route.ts:18-28) have ALREADY drifted — different format strings ('NNN%A|%T' vs '%A|%T\n') and different row filtering (page's slice(1, len-1) drops the parent Assets:Credited aggregate row; the export's account !== 'Total' filter keeps it in the CSV). One correction: for debts the commands are not 'identical', but that divergence supports rather than refutes the finding. lib/payees/parse.ts + features/payees/Payees.tsx:49 confirm the intended shared pattern.

### G3. Six hand-rolled ledger amount parsers alongside utils/parseAmountColumn, with divergent behavior

**Severity:** MEDIUM · **Effort:** M (half day) · **Location:** `lib/payees/parse.ts:7`

utils/parseAmountColumn.ts is the documented shared parser for ledger %t amounts and explicitly tolerates all shapes ledger emits ('USD 100', '100 USD', '$100', '-1,234.56'). Yet near-identical private parsers are re-implemented in lib/payees/parse.ts:3-8, lib/netWorth/parse.ts:3-7, features/monthlyComparison/MonthlyComparison.utils.ts:5-10, features/dashboard/Dashboard.utils.ts:8-10, and features/accounts/amountParts.ts:26. The copies are not equivalent: the `parts.length > 1 ? parts[1] : parts[0]` variants return 0 (or NaN) for symbol-attached amounts like '$100' that parseAmountColumn handles, and they also assume unit-first ordering. Any commodity-format change has to be found and fixed in six places.

```
return Number(numericPart.replaceAll(',', '')) || 0;
```

**Fix:** Replace the private parseAmount copies in lib/payees/parse.ts, lib/netWorth/parse.ts, features/monthlyComparison/MonthlyComparison.utils.ts and features/dashboard/Dashboard.utils.ts with utils/parseAmountColumn (it already returns 0 on garbage). For features/accounts/amountParts.ts, keep the unit/magnitude splitting but delegate the numeric extraction to parseAmountColumn.

> **Verifier notes** (independent adversarial check, confidence: high): Confirmed. utils/parseAmountColumn.ts is the documented tolerant parser and is consumed by only one page (app/registers/monthly/[account]/page.tsx). Duplicate hand-rolled parsers verified at lib/payees/parse.ts:3-8 (evidence quote matches line 7), lib/netWorth/parse.ts:3-7 (no || 0, yields NaN on garbage), features/monthlyComparison/MonthlyComparison.utils.ts:5-10, features/dashboard/Dashboard.utils.ts:8-10 (inline split(' ')[1]), features/accounts/amountParts.ts:26. Divergence claim checks out: the parts[1]/parts[0] variants return 0 or NaN for symbol-attached '$100' and assume unit-first ordering, both of which parseAmountColumn handles. Minor quibbles: 'six parsers' counts five copies plus the shared one, and Dashboard's is inline logic rather than a parseAmount function — neither affects the substance. Suggested fix is sound; amountParts caveat (keep unit/magnitude split) is correctly noted.

**Status:** ✅ DONE — PR #65 (`refactor/txn-model-consolidation`) — 2026-07-04. Superseded by the Txn model consolidation: one canonical `Posting` type (`lib/transactions/posting.ts`) now backs `ParsedPosting`, `DraftPosting`, the `TransactionRow` posting, and (structurally) the zod `postingSchema`; the six scattered posting converters were replaced by the `Txn` class's named constructors/outputs across P1–P4.

### G4. lib/ modules import types from features/ (layering inversion)

**Severity:** MEDIUM · **Effort:** S (<1h) · **Location:** `lib/reconcile/csv.ts:1`

Three lib/ CSV modules depend on feature internals: lib/reconcile/csv.ts imports ReconcileRow from features/reconcile/Reconcile.utils, lib/monthly/csv.ts imports CashFlowRow from features/monthlyComparison/MonthlyComparison.utils, and lib/portfolio/csv.ts imports PortfolioRow from features/portfolio/parsePortfolio. The convention is features depend on lib, never the reverse. These are type-only imports so there is no runtime cost, but the row types (and in reconcile's case the parser that produces them) are shared domain shapes consumed by both the page and the export route — they belong in lib. As-is, refactoring a feature file can break lib, and the parse logic for these reports sits in features while sibling reports (balance, payees, netWorth) keep it in lib — two patterns for the same job.

```
import type { ReconcileRow } from '@/features/reconcile/Reconcile.utils';
```

**Fix:** Move ReconcileRow + parseReconcileRows to lib/reconcile/parse.ts, CashFlowRow (+ getCashFlow's parsing) to lib/monthly/, and PortfolioRow + parsePortfolio to lib/portfolio/, then re-export or import from the features. This also makes reconcile/monthly/portfolio consistent with the lib/balance, lib/payees, lib/netWorth parse-module pattern.

> **Verifier notes** (independent adversarial check, confidence: high): Confirmed. lib/reconcile/csv.ts:1 imports ReconcileRow from features/reconcile/Reconcile.utils (evidence quote exact), lib/monthly/csv.ts:1 imports CashFlowRow from features/monthlyComparison, lib/portfolio/csv.ts:1 imports PortfolioRow from features/portfolio/parsePortfolio. parseReconcileRows does live in features/reconcile/Reconcile.utils.ts while sibling reports (lib/balance, lib/payees, lib/netWorth) keep parse modules in lib — the two-patterns claim is accurate. All three are type-only imports with zero runtime impact, so this is borderline medium/low; medium is defensible given the parser-placement inconsistency, but low would also be honest. Suggested fix is correct and low-risk.

### G5. features/settings and features/auth deep-import features/crypto internals

**Severity:** MEDIUM · **Effort:** M (half day) · **Location:** `features/settings/PasskeyUnlockCard.tsx:14`

Settings reaches into crypto's private lib/ in four files (PasskeyUnlockCard.tsx imports cryptoMaterial, passkeyFlow, and rewrapFlow; ChangePassphraseCard.tsx and RotateRecoveryCard.tsx import rewrapFlow), features/auth/AuthForm.tsx imports features/crypto/lib/passkeyFlow, and features/settings/actions/index.ts re-exports two crypto server actions (enablePasskeyUnlockAction, disablePasskeyUnlockAction) — blurring the one-action-per-file/per-feature ownership. features/crypto has no public index, so every consumer binds to internal file paths; restructuring crypto's lib/ breaks three other features.

```
import { getMaterial } from '@/features/crypto/lib/cryptoMaterial';
```

**Fix:** The flows in features/crypto/lib/ (rewrapFlow, passkeyFlow, cryptoMaterial, clientCrypto) are non-UI client logic — move them to lib/crypto/client/ per the 'lib/ = shared non-UI code' rule, or add a features/crypto/index.ts that exports the sanctioned surface (obtainDek, changePassphrase, rotateRecovery, signInWithPasskey, Authorizer, the two passkey actions) and forbid deep imports. Drop the re-exports from features/settings/actions/index.ts in favor of importing from crypto's public surface.

> **Verifier notes** (independent adversarial check, confidence: high): Confirmed every claim. features/settings/PasskeyUnlockCard.tsx imports cryptoMaterial (line 14, evidence quote exact), passkeyFlow (line 18), rewrapFlow (line 19); ChangePassphraseCard.tsx:14 and RotateRecoveryCard.tsx:15 import rewrapFlow; features/auth/AuthForm.tsx:15 imports features/crypto/lib/passkeyFlow; features/settings/actions/index.ts:23-24 re-exports enablePasskeyUnlockAction/disablePasskeyUnlockAction from features/crypto/actions. features/crypto has no index.ts, so all consumers bind to internal paths. features/crypto/lib/ is non-UI client logic, so the suggested move to lib/ (or a public index) matches the stated 'lib/ = shared non-UI code' convention. Medium severity is fair for cross-feature coupling spanning three consumer features.

### G6. AccountRole/classifyAccount domain helper buried in features/transactions/entry/types/

**Severity:** LOW · **Effort:** S (<1h) · **Location:** `features/accounts/accountTree.ts:4`

Account classification (AccountRole, classifyAccount, accountsForRole) is a core domain concept, but it lives under features/transactions/entry/types/accountRole.ts. The new accounts feature imports it from three files (accountTree.ts, balanceDisplay.ts, FriendlyBalance.tsx), coupling features/accounts to a deep path inside the transactions entry sub-tree. Any reorganization of the transaction-entry UI now breaks the accounts feature.

```
} from '@/features/transactions/entry/types/accountRole';
```

**Fix:** Move accountRole.ts to lib/accounts/accountRole.ts (lib/accounts already exists) and update the ~6 import sites in features/transactions and features/accounts.

> **Verifier notes** (independent adversarial check, confidence: high): Confirmed. AccountRole/classifyAccount/accountsForRole live in features/transactions/entry/types/accountRole.ts and are imported by three features/accounts files: accountTree.ts:4 (evidence quote exact), balanceDisplay.ts:1, FriendlyBalance.tsx:3 (the latter two are type-only). Account classification is a generic domain concept; lib/accounts/ already exists as the natural home. Low severity and S effort are honest; suggested fix is correct.

### G7. SetupWizard.tsx is an 847-line god-file mixing brand panel, step indicator, five wizard steps, and crypto orchestration

**Severity:** LOW · **Effort:** M (half day) · **Location:** `features/crypto/SetupWizard.tsx:75`

The largest file in the repo bundles font setup, an animated SetupBrandPanel, StepIndicator, WhyStep, PassphraseStep (with strength meter), RecoveryStep (with copy/download logic), the runSetup crypto orchestration, and the wizard state machine in one file. The codebase already established the right granularity by extracting PasskeyStep into its own file (features/crypto/PasskeyStep.tsx, 208 lines) — the remaining steps are inconsistent with that. The size makes the passphrase/recovery flows hard to test in isolation.

```
function SetupBrandPanel() {
```

**Fix:** Split along the existing seams: WhyStep.tsx, PassphraseStep.tsx, RecoveryStep.tsx, SetupBrandPanel.tsx, StepIndicator.tsx, and a setupFlow.ts holding runSetup + strengthLabel; SetupWizard.tsx keeps only the step state machine (mirroring how PasskeyStep.tsx was already extracted).

> **Verifier notes** (independent adversarial check, confidence: high): Verified: features/crypto/SetupWizard.tsx is 847 lines; line 75 is verbatim 'function SetupBrandPanel() {'. File contains fonts (30-40), runSetup (49), SetupBrandPanel (75), StepIndicator (194), WhyStep (259), strengthLabel (311), PassphraseStep (324), RecoveryStep (472), EncryptingStep (616), and the SetupWizard state machine (690). PasskeyStep.tsx is already extracted (208 lines), so the inconsistency claim holds. Suggested split follows existing seams and is sound. Severity low is honest.

### G8. Eleven CSV export routes duplicate identical handler boilerplate

**Severity:** LOW · **Effort:** M (half day) · **Location:** `app/api/balance/export/route.ts:34`

Every export route under app/api/*/export/route.ts repeats the same skeleton: requireUser, parseISODateStrict on start/end, getBaseCurrency, runLedger, rowsToCsv + csvDownload, a RangeError → 400 branch, and a log.error → 500 branch (compare app/api/balance/export/route.ts, app/api/balance/periodic/export/route.ts, app/api/debts/export/route.ts, app/api/payees/export/route.ts, etc. — ~40-60 lines each, differing only in ledger args and the csv mapper). Adding a new export means copy-pasting the whole error-handling shape, and a fix to one branch (e.g. the missing-start/end 400 that only the periodic route has) doesn't propagate.

```
export async function GET(req: NextRequest): Promise<Response> {
  await requireUser();
```

**Fix:** Add a factory in lib/csv, e.g. `makeCsvExportRoute({ name, buildArgs(base, start, end), toCsv(stdout, base) })` that returns the GET handler with the shared requireUser/date-parsing/RangeError/logging skeleton; each route file shrinks to a config object plus `export const GET = makeCsvExportRoute(...)`.

> **Verifier notes** (independent adversarial check, confidence: high): Verified: 11 export routes exist and the evidence quote matches app/api/balance/export/route.ts:34-35. Ten share the requireUser + try/catch + log.error->500 + csvDownload skeleton; balance/payees/periodic also share parseISODateStrict + RangeError->400. Corrections: (1) title overstates — app/api/account/export/route.ts is a journal-backup export, not CSV (no csvDownload/getBaseCurrency), so 10 CSV routes, and (2) routes are not 'identical' — debts/accounts/monthly/reconcile have no date parsing or RangeError branch, and transactions/account need the user object. A factory fix works for the ~10 CSV routes but must accommodate these variations. Duplication is real; severity low correct.

### G9. Recovery-code reveal UI (copy/download/saved-checkbox) duplicated between SetupWizard and RotateRecoveryCard

**Severity:** LOW · **Effort:** M (half day) · **Location:** `features/settings/RotateRecoveryCard.tsx:26`

RecoveryStep inside features/crypto/SetupWizard.tsx (line 472+) and features/settings/RotateRecoveryCard.tsx implement the same recovery-code presentation flow twice: copied/saved state, a copyTimeout ref with cleanup, clipboard handleCopy with a 2.5s reset, download-as-file, and an 'I saved it' confirmation gate. The two copies also sit on opposite sides of the settings→crypto coupling. A UX or safety change to how recovery codes are revealed (e.g. only after persist) must be made twice, and the SetupWizard copy has already drifted (extra `interacted` state).

```
const copyTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
```

**Fix:** Extract a shared <RecoveryCodeReveal code={...} onConfirmedSaved={...}/> component (in features/crypto, exported publicly) encapsulating the grouped-code display, copy button with timeout, download button, and saved-confirmation gate; use it from both the wizard's RecoveryStep and RotateRecoveryCard. The passphrase-vs-recovery Authorizer toggle repeated across ChangePassphraseCard/RotateRecoveryCard/PasskeyUnlockCard is a second candidate for the same treatment.

> **Verifier notes** (independent adversarial check, confidence: high): Verified duplication: copyTimeout ref line is at RotateRecoveryCard.tsx:27 (finding said 26; line 26 is the copied state) and identically at SetupWizard.tsx:477. Both implement handleCopy with 2.5s reset, near-identical handleDownload blob text ('Store this safely. This code is shown once...'), grouped code.split('-') display, and a saved-checkbox gate. Drift confirmed: wizard adds 'interacted' state and also lacks the unmount cleanup useEffect that RotateRecoveryCard has (29-34). Caveat for the fix: the two use different visual systems (wizard's custom au-* branded styles vs shadcn Card/Button), so a shared RecoveryCodeReveal component needs styling variants — extraction is feasible but less drop-in than implied. Severity low correct.


---

## H. UX consistency & accessibility

Behavioral consistency issues, each small but confirmed against a concrete divergent counterpart elsewhere in the app.

### H1. Import replaces the entire journal with a single un-confirmed click

**Severity:** MEDIUM · **Effort:** S (<1h) · **Location:** `app/import/page.tsx:121`

Deleting one transaction, one template, or one saved view all require a ConfirmDialog, but the import form overwrites the user's whole journal (every file) on a single submit with no confirmation step. A user who assumes 'Import' merges rather than replaces loses their existing journal in one click. This is the most destructive action in the app and the only destructive action without a confirm, inverting the app's own confirmation hierarchy.

```
{phase === 'uploading' ? 'Uploading…' : 'Replace my journal'}
```

**Fix:** Wrap the submit in the existing components/ConfirmDialog (e.g. title 'Replace your entire journal?', description stating the current journal will be overwritten and how many files will be replaced), calling the upload from onConfirm instead of directly from form submit.

> **Verifier notes** (independent adversarial check, confidence: high): Confirmed. app/import/page.tsx submits directly from handleSubmit (line 34) with no ConfirmDialog; the button at line 121 reads 'Replace my journal' and /api/upload calls journalService.replaceFromZip / replaceFromSingleFile, so it does overwrite the whole journal. ConfirmDialog is used for single-transaction delete (features/transactions/RowActions.tsx:67), template delete, and saved-view delete, so the confirmation hierarchy inversion is real. Mitigation worth noting: the button label and page subtitle ('Replace your journal with an existing file or archive') both signpost replacement, which weakens the 'user assumes merge' scenario, but medium severity is still defensible for the app's most destructive action having its only unconfirmed path.

### H2. Money formatting is inconsistent: Payees/Cash Flow bypass formatAmount and always render expenses red

**Severity:** MEDIUM · **Effort:** S (<1h) · **Location:** `features/payees/Payees.tsx:18`

Nearly every money value in the app goes through utils/formatAmount (comma grouping preserved from ledger output, negatives as parenthesized red, positives green, tabular-nums). Payees and MonthlyComparison each define a private formatNumber using n.toLocaleString(undefined, ...) — in these server components 'undefined' means the server's ICU locale, so grouping/decimal separators can differ from every other page (e.g. '1.234,56' on a de-locale server vs '1,234.56' from formatAmount). Payees additionally hardcodes text-negative (line 123) so expense totals are always red, while the same expense figures on /balance/[from]/[to] render green via formatAmount — the same number, opposite color semantics on two report pages.

```
const formatNumber = (n: number) =>
  n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
```

**Fix:** Add a shared numeric formatter (or extend utils/formatAmount to accept a number + currency) with a fixed locale, and use it in features/payees/Payees.tsx and features/monthlyComparison/MonthlyComparison.tsx; drop the hardcoded text-negative class in Payees so expense magnitudes follow the same color convention as the periodic-balance page.

> **Verifier notes** (independent adversarial check, confidence: high): Confirmed. features/payees/Payees.tsx:18-22 defines formatNumber with n.toLocaleString(undefined, ...) in a server component (locale = server ICU default, not DATE_LOCALE or a fixed locale); features/monthlyComparison/MonthlyComparison.tsx:10-11 duplicates it. Payees.tsx:123 hardcodes text-negative on expense totals, while app/balance/[from]/[to]/page.tsx:132 renders the same positive expense magnitudes through utils/formatAmount, which gives positive values text-positive (green) — opposite color semantics for the same figures. One caveat: the locale-divergence half only manifests if the server's ICU default differs from en-US (most deployments are en-US), so the unconditional part of the finding is the color/formatter inconsistency; medium severity is honest.

### H3. Transaction list dates use the browser locale while all other pages use the configured DATE_LOCALE (plus hydration mismatch)

**Severity:** MEDIUM · **Effort:** S (<1h) · **Location:** `features/transactions/TransactionRowItem.tsx:62`

Server pages format dates via utils/formatDate, which pins the locale to env.DATE_LOCALE. TransactionRowItem (rendered inside the client-side TransactionList) calls formatDateWithLocale(t.date, Format.DATE) with no locale, so it falls back to the runtime locale: the Node default during SSR and the visitor's browser locale after hydration. Result: /transactions can show 07/03/2026 while /dashboard shows 03/07/2026 for the same entries, and when server and browser locales differ the SSR text does not match the hydrated text, producing React hydration warnings/flicker on every row.

```
{formatDateWithLocale(t.date, Format.DATE)}
```

**Fix:** Thread the configured locale to the client: either format the date server-side when building TransactionRow (add a displayDate field in loadJournalTransactions/pageTransactions), or pass env.DATE_LOCALE down as a prop from the server page and call formatDateWithLocale(t.date, Format.DATE, locale) at lines 62 and 85.

> **Verifier notes** (independent adversarial check, confidence: high): Confirmed. features/transactions/TransactionRowItem.tsx:62 and :85 call formatDateWithLocale(t.date, Format.DATE) with no locale; utils/formatDateCore.ts documents that omitting locale 'defaults to the runtime/browser locale' and that server code should use the configured-locale formatDate. TransactionRowItem is rendered inside features/transactions/TransactionList.tsx which is 'use client', so SSR uses the Node locale and hydration uses the browser locale — a real hydration-mismatch vector per row when they differ. features/dashboard/Dashboard.tsx:216 formats the same kind of date via formatDate (DATE_LOCALE, default en-US via lib/env/index.ts:56), so cross-page inconsistency is real. Suggested fix (pass locale or pre-format server-side) is correct.

### H4. Manual price deletion has no confirmation, unlike every other delete in the app

**Severity:** MEDIUM · **Effort:** S (<1h) · **Location:** `features/prices/PricesView.tsx:209`

The trash button in the prices History table calls handleDelete(p.id) directly — no ConfirmDialog, no undo — while deleting a transaction, template, or saved view all require confirmation. Deleting a dated rate silently changes historical report valuations, so an accidental tap on the icon button (adjacent to the row in a dense table) has real consequences and is inconsistent with the app's established delete pattern.

```
onClick={() => handleDelete(p.id)}
```

**Fix:** Wrap the delete button in the shared components/ConfirmDialog (title 'Delete this rate?', description noting historical reports will revalue), matching features/transactions/RowActions.tsx.

> **Verifier notes** (independent adversarial check, confidence: high): Confirmed. features/prices/PricesView.tsx:209 has onClick={() => handleDelete(p.id)} with no confirmation; the action deletes immediately. Every other delete in the app goes through components/ConfirmDialog (features/transactions/RowActions.tsx:67, features/savedViews/SavedViewRowActions.tsx, features/templates/TemplatesList.tsx). Deleting a dated rate does change historical valuations (service regenerates the price db on delete, lib/prices/service.ts deleteManualPrice). Suggested fix matches the existing pattern. Medium severity is fair for an unconfirmed destructive action inconsistent with the app norm.

### H5. Prices page uses inline text feedback instead of the app-wide toast pattern; success message never clears and form keeps stale rows

**Severity:** LOW · **Effort:** S (<1h) · **Location:** `features/prices/PricesView.tsx:165`

Everywhere else mutations report via sonner toasts ('Transaction saved', 'Journal imported', 'Transaction deleted'). PricesView renders success as a persistent inline green <p> and errors as inline red text; the 'Prices saved.' message stays on screen indefinitely and the just-saved rows remain in the form, so a second submit re-adds the same prices. The page also uses its own layout shell (mx-auto max-w-3xl, plain h1 without tracking-tight, no Help component) unlike every other report/form page.

```
{state.ok && <p className="text-sm text-green-600">Prices saved.</p>}
```

**Fix:** On state.ok, fire toast.success('Prices saved') in an effect and reset rows to [{ symbol: '', price: '' }]; use toast.error for formError/deleteError; align the page wrapper and heading with the standard 'flex flex-col gap-6' + tracking-tight header used by other pages.

> **Verifier notes** (independent adversarial check, confidence: high): Mostly confirmed. Evidence quote matches PricesView.tsx:165; success renders as a persistent inline green <p> and errors as inline text (lines 162-165, 174-176), while 30+ other mutation sites use sonner toasts. Rows are indeed never reset on state.ok, and the h1 lacks tracking-tight unlike other feature pages (Reconcile.tsx:28, Payees.tsx:57 etc.). One correction: the claim that a second submit 're-adds the same prices' is wrong — lib/prices/manualRepository.ts upsertMany uses onConflictDoUpdate on (userId, symbol, quote, pricedAt) with a matching unique constraint in db/schema/manualPrice.ts, so re-submitting identical rows is idempotent (it only re-adds if the user changes the date). Core finding (feedback inconsistency + stale form state) stands at low severity.

### H6. Every route shares one document title — tabs, history, and bookmarks are indistinguishable

**Severity:** LOW · **Effort:** M (half day) · **Location:** `app/layout.tsx:14`

Only the root layout and the landing page define metadata; no other route exports metadata or generateMetadata, so /transactions, /settings, /balance/..., /reconcile etc. all show the same APP_NAME in the browser tab, history, and bookmarks. The nav config already has a title for every route, so this is pure wiring. It also hurts screen-reader users, for whom the document title is the primary navigation announcement.

```
title: APP_NAME,
```

**Fix:** Set title: { template: `%s · ${APP_NAME}`, default: APP_NAME } in app/layout.tsx and add `export const metadata = { title: 'Transactions' }` (etc., reusing components/nav/config titles) to each page.tsx.

> **Verifier notes** (independent adversarial check, confidence: high): Confirmed. Grep across app/ and features/ shows metadata is exported only in app/layout.tsx:13 (title: APP_NAME) and app/page.tsx:11; no other route has metadata or generateMetadata, so /transactions, /settings, /prices etc. all share the same tab/history/bookmark title. components/nav/config.ts already defines a title per route, so the wiring is straightforward. Low severity and effort M are honest.

### H7. Transaction row-actions trigger is an icon-only button without an accessible name

**Severity:** LOW · **Effort:** S (<1h) · **Location:** `features/transactions/RowActions.tsx:50`

The dropdown trigger renders only a MoreHorizontal icon with no aria-label, so screen readers announce it as an unnamed button on every transaction row. The equivalent component in savedViews does this correctly (SavedViewRowActions.tsx:75 has aria-label="Open view actions"), so the two features are inconsistent as well as one being inaccessible.

```
<Button variant="ghost" size="icon-sm">
              <MoreHorizontal className="h-4 w-4" />
```

**Fix:** Add aria-label="Transaction actions" (or `Actions for ${t.payee}`) to the trigger Button, matching the savedViews pattern.

> **Verifier notes** (independent adversarial check, confidence: high): Confirmed. features/transactions/RowActions.tsx:50 renders <Button variant="ghost" size="icon-sm"> containing only a MoreHorizontal icon — no aria-label, and neither Button nor DropdownMenuTrigger supplies an accessible name. The parallel component features/savedViews/SavedViewRowActions.tsx:75 has aria-label="Open view actions", confirming the inconsistency. Fix is a one-line attribute addition.

### H8. Filter labels are not associated with their controls (no htmlFor/id)

**Severity:** LOW · **Effort:** S (<1h) · **Location:** `features/transactions/Filters.tsx:70`

The Account/Payee/Search labels in the transactions filter bar and the From/To labels in the shared DateFilter (components/DateFilter/DateFilter.tsx:84,93) are bare <label> elements with no htmlFor pointing at the input, and the inputs have no id or aria-label. Clicking the label does not focus the field and assistive tech reads the inputs as unlabeled. Other forms in the app (PricesView, import) correctly pair Label htmlFor with Input id, so this is also inconsistent.

```
<label className="text-xs text-muted-foreground">Account</label>
```

**Fix:** Give each input/Combobox an id and set htmlFor on the label (or pass an aria-label into Combobox where it renders the underlying input), in both features/transactions/Filters.tsx and components/DateFilter/DateFilter.tsx.

> **Verifier notes** (independent adversarial check, confidence: high): Confirmed. features/transactions/Filters.tsx:70/82/94 use bare <label> elements with no htmlFor, and the Search Input has no id/aria-label; components/DateFilter/DateFilter.tsx:84 and :93 likewise pair bare labels with unassociated date inputs. PricesView correctly uses Label htmlFor + Input id, confirming the inconsistency. One nuance on the fix: components/Combobox/Combobox.tsx accepts neither id nor aria-label props (its trigger is a Button named only by the current value/placeholder), so the fix requires forwarding a prop through Combobox — still S effort. Low severity is right.

### H9. DateFilter month/quarter shortcuts always jump to the current year, ignoring the period being viewed

**Severity:** LOW · **Effort:** S (<1h) · **Location:** `components/DateFilter/DateFilter.tsx:78`

The Monthly and Quarterly shortcut buttons compute their range from `refDate = new Date()`, i.e. always the current year. A user reviewing 2024 (via the Yearly buttons or a custom range) who clicks 'May' or 'Q2' is silently jumped to May/Q2 of 2026 — the selected year context is discarded with no indication. Since the component already receives the active `from` prop, the expected behavior (month within the year currently in view) is cheap to provide.

```
const refDate = new Date();
```

**Fix:** Derive refDate from the current `from` prop when present (new Date(fromProp)) so month/quarter shortcuts stay within the year being viewed, and/or render the resolved year in the section header ('Monthly — 2024') so the target is visible before clicking.

> **Verifier notes** (independent adversarial check, confidence: high): Confirmed. components/DateFilter/DateFilter.tsx:78 is verbatim `const refDate = new Date();`, and Monthly (line 110) and Quarterly (lines 131-135) shortcuts use `refDate.getFullYear()` — always the current year — while the Yearly section (lines 154-173) lets users navigate up to 4 years back and the component already receives `from`/`to` props (line 51) that are ignored by these shortcuts. No year is shown in the Monthly/Quarterly section headers, so the jump is silent. Severity 'low' is honest (could be an intentional current-year shortcut design, but the inconsistency with the Yearly buttons is real). Fix note: derive the year from the `from` string (e.g. fromProp.slice(0,4)) rather than `new Date(fromProp).getFullYear()`, since ISO date-only strings parse as UTC midnight and can yield the previous year in negative-offset timezones.


---

## I. Dead code & housekeeping

All verified as having zero imports/usages before being reported (Next.js conventional files were excluded from the dead-file check). Safe, mechanical deletions.

### I1. Unused dependency: next-themes

**Severity:** LOW · **Effort:** S (<1h) · **Location:** `package.json:52`

next-themes is declared as a production dependency but has zero imports anywhere in the repo (grep across all .ts/.tsx/.js/.css files finds only the package.json entry and the lockfile), and it is not a peer dependency of @naeemba/next-starter (the starter's peers are resend, @react-email/*, @better-auth/passkey, next, postgres, react — all of which ARE legitimately required). knip independently flags it as the sole unused runtime dependency. It adds install weight and implies a theming capability that does not exist.

```
"next-themes": "^0.4.6",
```

**Fix:** Run `pnpm remove next-themes`. Note: do NOT remove resend/@react-email/components/@react-email/render despite them having no direct app imports — they are peerDependencies of @naeemba/next-starter and must stay. Similarly keep pino-pretty (referenced as a pino transport target string in lib/log/index.ts:42) and @commitlint/config-conventional (extended in commitlint.config.js).

> **Verifier notes** (independent adversarial check, confidence: high): Verified directly. package.json:52 declares "next-themes": "^0.4.6" as a production dependency. Grep across app/, features/, components/, lib/ finds zero imports; the only non-lockfile references are docs, and PLAN.md:127 confirms the origin: the shadcn sonner.tsx was "patched to drop `next-themes`" but the dependency was never removed. components/ui/sonner.tsx has no next-themes import. The installed @naeemba/next-starter's peerDependencies are @better-auth/passkey, @react-email/components, @react-email/render, next, postgres, react, react-dom, resend — next-themes is not among them, so `pnpm remove next-themes` is safe; the reporter's caveats about keeping resend/@react-email/* (real peers) are also accurate. Severity low is correct.

### I2. Orphaned file: utils/deviceName.ts (zero imports)

**Severity:** LOW · **Effort:** S (<1h) · **Location:** `utils/deviceName.ts:1`

getDeviceName (the file's only export, a 34-line user-agent sniffing helper) is imported nowhere — repo-wide grep for `deviceName` and `getDeviceName` outside the file itself returns nothing, and no other code in features/crypto or features/auth touches navigator.userAgent. It was added in commit 1475dea ('feat: add login and signup using passkey') and orphaned when passkey naming moved elsewhere. knip confirms the file is unreachable from any entry point.

```
const getDeviceName = (): string => {
  if (typeof navigator === 'undefined') return 'Device';
```

**Fix:** Delete utils/deviceName.ts. If passkey device naming is wanted later, it can be recovered from git history (commit 1475dea).

> **Verifier notes** (independent adversarial check, confidence: high): Verified: utils/deviceName.ts line 1 matches the evidence quote verbatim ("const getDeviceName = (): string => {" / "if (typeof navigator === 'undefined') return 'Device';"). Its only export is `export default getDeviceName;` (line 34). Case-insensitive repo-wide grep for "devicename" (excluding node_modules, .git, .next) returns hits only inside the file itself — zero importers, no dynamic/string-path references across any branch of the working tree. `git log --all -- utils/deviceName.ts` shows a single commit, 1475dea ("feat: add login and signup using passkey"), confirming the claimed origin and that it was never modified or wired up afterwards. Severity=low and the suggested fix (delete the file, recover from git history if needed) are both accurate and safe.

### I3. Orphaned file: components/ui/select.tsx (zero imports)

**Severity:** LOW · **Effort:** S (<1h) · **Location:** `components/ui/select.tsx:1`

The shadcn Select component (201 lines wrapping @base-ui/react/select) is imported by no file: grep for 'ui/select' across app/, features/, components/ returns nothing, and knip flags the whole file as unused. The app uses Combobox and native controls instead. Keeping an unwired shadcn primitive invites drift from the generator and false 'this exists, use it' signals.

```
import { Select as SelectPrimitive } from '@base-ui/react/select';
```

**Fix:** Delete components/ui/select.tsx. If a Select is needed later, regenerate with `pnpm shadcn:add select` so it matches the current shadcn version.

> **Verifier notes** (independent adversarial check, confidence: high): Confirmed. components/ui/select.tsx is 201 lines and its line 3 matches the evidence quote ("import { Select as SelectPrimitive } from '@base-ui/react/select';"). Repo-wide grep (excluding node_modules) for 'ui/select' across .ts/.tsx/.js/.mjs/.json finds no importers, and no other file references SelectTrigger/SelectContent/SelectItem. The file is a fully orphaned shadcn primitive. Severity low and category dead-code are honest; deleting it is safe since nothing imports it. Minor caveat: the finding cites 'pnpm shadcn:add select' as the regeneration path — I did not verify that script exists in package.json, but that detail doesn't affect the validity of the finding.

### I4. Dead barrel files: components/Header/index.ts, features/templates/index.ts, features/transactions/index.ts

**Severity:** LOW · **Effort:** S (<1h) · **Location:** `components/Header/index.ts:1`

Three index.ts barrels are never imported: components/Header/index.ts (AppShell.tsx imports '@/components/Header/AppHeader' directly), features/templates/index.ts, and features/transactions/index.ts (no file imports '@/features/templates' or '@/features/transactions' — pages import concrete files). knip flags all three as unused files. This is inconsistent with features/accounts/index.ts, which IS used via '@/features/accounts', so the codebase has two competing import conventions and the losing side leaves dead barrels behind (features/transactions/index.ts still re-exports NewTransaction/EditTransaction, artifacts of the pre-TransactionEntry refactor in da14e47).

```
export { default } from './AppHeader';
```

**Fix:** Either delete the three dead barrels, or standardize: make app pages import via the feature barrel (as accounts does) and keep barrels current. Deleting is safer and smaller: rm components/Header/index.ts features/templates/index.ts features/transactions/index.ts, then confirm `pnpm type-check` passes.

> **Verifier notes** (independent adversarial check, confidence: high): Confirmed. components/Header/index.ts:1 is exactly `export { default } from './AppHeader';`. Repo-wide grep (alias and relative forms) shows zero imports of the three barrels: components/AppShell/AppShell.tsx:9 imports '@/components/Header/AppHeader' directly; app/transactions/page.tsx, app/transactions/new/page.tsx, app/transactions/[uid]/edit/page.tsx, and app/templates/page.tsx all import concrete files. Meanwhile features/accounts/index.ts IS used via barrel (app/accounts/page.tsx:1 `import Accounts from '@/features/accounts';`), confirming the two-convention inconsistency. Commit da14e47 exists as described. Deleting the three files is safe (no importers). Minor correction: features/transactions/index.ts's NewTransaction/EditTransaction re-exports point at files that still exist and are used directly by pages — the barrel is dead but its targets are not stale artifacts. Severity low and fix are appropriate.

### I5. Dead export chain: createDbConnection is exported twice, used never

**Severity:** LOW · **Effort:** S (<1h) · **Location:** `lib/db/connection.ts:9`

createDbConnection is exported from lib/db/connection.ts and re-exported from lib/db/index.ts, but a repo-wide grep shows zero call sites — repositories are constructed with the DbInstance type and the starter's lazy `db` proxy, never with this factory. The DbInstance type alias in the same file is genuinely used and should stay; only the factory re-export is dead.

```
export { createDb as createDbConnection } from '@naeemba/next-starter/db';
```

**Fix:** Remove the `export { createDb as createDbConnection }` line from lib/db/connection.ts and the `export { createDbConnection } from './connection';` line from lib/db/index.ts, keeping the DbInstance type export. Anyone needing the factory later can import createDb from '@naeemba/next-starter/db' directly.

> **Verifier notes** (independent adversarial check, confidence: high): Confirmed. lib/db/connection.ts:9 has `export { createDb as createDbConnection } from '@naeemba/next-starter/db';` and lib/db/index.ts:8 re-exports it (`export { createDbConnection } from './connection';`). Repo-wide grep for createDbConnection matches only those two export lines — no call sites in app code or tests. DbInstance (connection.ts:7) is genuinely used by 15+ files (lib/journal/repository.ts, lib/settings/repository.ts, lib/crypto/*, lib/prices/*, lib/test-utils/db.ts, etc.), so the reporter's carve-out to keep the type is correct. The line-1 `import { createDb }` must stay since DbInstance is derived from it; the suggested fix (remove both export lines only) is safe and breaks nothing. Severity low / dead-code is honest.

### I6. Dead destructured exports in lib/auth-client.ts

**Severity:** LOW · **Effort:** S (<1h) · **Location:** `lib/auth-client.ts:6`

lib/auth-client.ts exports `signIn`, `signOut`, and `useSession` destructured from authClient, but every consumer (AppHeader.tsx, AuthForm.tsx, DangerZone.tsx, passkeyFlow.ts, app/settings/passkeys/page.tsx) imports the `authClient` object and accesses methods on it. knip flags all three named exports as unused. The dead line also forces evaluation of the destructure at module load for nothing.

```
export const { signIn, signOut, useSession } = authClient;
```

**Fix:** Delete line 6 of lib/auth-client.ts, leaving only `export const authClient = createAuthClient({ passkey: passkeyClient });`.

> **Verifier notes** (independent adversarial check, confidence: high): Confirmed. lib/auth-client.ts:6 reads exactly `export const { signIn, signOut, useSession } = authClient;`. A repo-wide grep shows every importer of '@/lib/auth-client' (app/settings/passkeys/page.tsx:3, features/settings/DangerZone.tsx:11, features/crypto/lib/passkeyFlow.ts:6, features/auth/AuthForm.tsx:16, components/Header/AppHeader.tsx:27, plus the test at features/crypto/lib/passkeyFlow.test.ts:16) imports only { authClient }; no file imports signIn/signOut/useSession from this module (the only signIn* import is signInWithPasskey from passkeyFlow). The test mock also stubs only authClient, so the suggested fix (delete line 6) is safe and correct. Runtime-cost claim is negligible but the dead-code claim stands; severity low is accurate.

### I7. Dead re-export: formatDateWithLocale in utils/formatDate.ts

**Severity:** LOW · **Effort:** S (<1h) · **Location:** `utils/formatDate.ts:9`

utils/formatDate.ts re-exports formatDateWithLocale from formatDateCore, but the only consumer (features/transactions/TransactionRowItem.tsx) imports it from '@/utils/formatDateCore' directly, so the re-export has zero users (knip-confirmed). Two import paths for the same symbol invites the same barrel drift seen elsewhere.

```
formatDateWithLocale,
```

**Fix:** Remove formatDateWithLocale from the utils/formatDate.ts export list (or, if the intent is that formatDate.ts is the public surface, switch TransactionRowItem.tsx to import from '@/utils/formatDate' and keep the re-export — pick one path).

> **Verifier notes** (independent adversarial check, confidence: high): Verified: utils/formatDate.ts:9 re-exports formatDateWithLocale, but repo-wide grep shows no import of it from '@/utils/formatDate' — the sole consumer (features/transactions/TransactionRowItem.tsx:4) imports from '@/utils/formatDateCore'. The internal use at formatDate.ts:17 comes from the line-1 direct import, so dropping the re-export is safe. Caveat: the file comment (lines 4-6) frames the export block as an intentional compat surface and explicitly directs client components to formatDateCore, so this is a deliberate-but-now-unused compat entry rather than accidental drift; other symbols in the same block (Format, formatLedgerDateTime) do have consumers. Real but minimal-impact dead code; severity low is accurate, fix is S effort.

### I8. TODO.md contains stale/incorrect cleanup items; in-code TODOs are clean

**Severity:** LOW · **Effort:** S (<1h) · **Location:** `TODO.md:24`

The codebase itself is remarkably TODO-free (grep for TODO/FIXME/HACK/XXX across all source finds only a false positive in a Base32 comment), but TODO.md carries stale items that misdirect future work: (1) line 24 claims '/api/upload + FileUpload' is an orphan with 'no UI references' — false, app/import/page.tsx:43 fetches '/api/upload', and the FileUpload component no longer exists, so the item as written is unactionable; (2) line 26 flags amount-parsing fragility in '/registers/monthly/[account]'; (3) line 30 lists pure-function test targets by pre-refactor names (Accounts.utils#buildTree etc.) that no longer match current file names (features/accounts/accountTree.ts); (4) line 13 Budget and Tier 3 items (CSV export marked open though export routes exist under app/api/*/export) are open/uncertain.

```
- [ ] **Orphan `/api/upload` + `FileUpload`** — no UI references it. Wire into nav or delete.
```

**Fix:** Sweep TODO.md: delete the /api/upload orphan item (route is live via app/import/page.tsx), mark 'CSV export of any report' done or rescope (per-report export routes exist under app/api/*/export), update stale symbol names in the Maintenance test list to current files, and re-verify whether the amount-parsing fragility item still applies to app/registers.

> **Verifier notes** (independent adversarial check, confidence: high): All four sub-claims confirmed by reading the code. (1) TODO.md:24 verbatim says "Orphan `/api/upload` + `FileUpload` — no UI references it", but app/import/page.tsx:43 has `fetch('/api/upload', { method: 'POST', body: fd })`, and no FileUpload component exists anywhere — the item is factually wrong and unactionable as written. (2) TODO.md:26 says the split-based amount parsing "Still affects /registers/monthly/[account]", but that page now uses utils/parseAmountColumn.ts (regex-based, explicitly handles unit-less amounts) and formatAmount — the item is stale. (3) TODO.md:30 lists `Accounts.utils#buildTree`, but the function is `buildAccountTree` in features/accounts/accountTree.ts:33; additionally most listed test targets already have tests (Dashboard.utils.test.ts, Reconcile.utils.test.ts, utils/validateAccount.test.ts, utils/formatDate.test.ts), so the item is largely done under stale names. (4) TODO.md:18 marks "CSV export of any report" open while 10+ export routes exist (app/api/balance/export, app/api/transactions/export, app/api/monthly/export, app/api/net-worth/export, etc.). Severity low is honest (docs-only, no runtime impact); suggested fix is a correct doc-only sweep. Effort S.

### I9. drizzle.config.ts tablesFilter omits cryptoPasskeyWrap and accountDeletionChallenge

**Severity:** LOW · **Effort:** S (<1h) · **Location:** `drizzle.config.ts:13`

The tablesFilter lists 9 of the app's 11 tables; cryptoPasskeyWrap and accountDeletionChallenge are missing even though both exist in db/schema and in past migrations (0001, 0005, 0010). tablesFilter scopes `drizzle-kit push` (exposed as the `db:push` script) and `pull`, so running db:push against a fresh or drifted database will never create or update those two tables — a fresh push-provisioned environment gets runtime 'relation does not exist' failures on account deletion and passkey unlock, and future schema changes to them silently never apply via push.

```
tablesFilter: [
    'auditLog',
    'userSetting',
```

**Fix:** Add 'cryptoPasskeyWrap' and 'accountDeletionChallenge' to tablesFilter. Consider generating the list from the schema barrel (or adding a test asserting every pgTable name in db/schema appears in the filter) so new tables can't be forgotten again.

> **Verifier notes** (independent adversarial check, confidence: high): Confirmed: drizzle.config.ts:13-23 tablesFilter lists 9 tables while db/schema defines 11 pgTables; 'cryptoPasskeyWrap' (db/schema/cryptoPasskeyWrap.ts:11) and 'accountDeletionChallenge' (db/schema/accountDeletionChallenge.ts:7) are omitted, and both are created in migrations 0001/0005/0010. tablesFilter scopes drizzle-kit push, and 'db:push' exists in package.json, so push silently ignores these tables. BUT the claimed impact is overstated: predev/prebuild/prestart all run 'pnpm migrate' (next-starter migrate && drizzle-kit migrate), which applies the migration SQL regardless of tablesFilter — so every dev/build/start environment gets both tables. drizzle-kit generate is also unaffected by tablesFilter, so future changes flow correctly via generate→migrate. The 'fresh push-provisioned environment with runtime relation-does-not-exist failures' scenario requires bypassing every wired lifecycle script. Real residual impact: db:push iterations touching these two tables silently no-op — a genuine config inconsistency worth fixing (the suggested fix is correct and harmless), but low, not medium.


---

## Refuted claims

One finding was rejected by adversarial verification and should NOT be implemented:

- **Price pipeline ignores the session cookie base: PriceService.resolveBaseCurrency reads only the DB setting** (`lib/prices/service.ts:228`) — claimed high. Refuted: The code facts quoted are accurate — PriceService.resolveBaseCurrency (lib/prices/service.ts:228-235) reads only userSetting.baseCurrency, and runOnce builds pairs only against the saved base — but the claimed impact ('ledger -X <sessionBase> has no rate data toward the session base, conversions silently fail, banner shows permanently, never self-heals') is empirically false. Ledger inverts and chains P directives: verified with ledger 3.4.1 that a price DB containing only `P EUR 1.10 USD` and `P BTC 60000 USD` fully converts a mixed USD/BTC journal with `-X EUR`. The session base is always chosen from the header picker (components/BaseCurrencyPicker/BaseCurrencyPicker.tsx, allowFreeText={false}) whose options are the user's journal commodities (getAvailableCurrencies → `ledger commodities`), and runOnce fetches every journal commodity !== savedBase against the saved base daily — so the session base always has a rate toward the saved base, and every other commodity converts via one chained hop. This works historically too, since saved-base history keeps accumulating (in fact better than the saved-base-switch case in finding 0). The only failure mode is a commodity whose fetch fails against the saved base (e.g. a symbol cryptocompare cannot price), and that commodity is equally unconverted under the saved base — not a session-specific defect. No permanent-banner, no self-heal problem in the described scenario.


## Coverage notes

- **Not reviewed:** security (separate review), test quality/coverage, live runtime profiling (this was a static review — no load testing or Web Vitals measurement was performed), the mobile PR stack (#36–#41, unmerged).
- Reviewers were capped at ~12 findings each, prioritizing impact; low-value nits below that bar are intentionally absent.
- The error-handling reviewer reported 6 findings against a cap of 10 — the codebase's error handling is generally deliberate (StorageConflictError, LockedError, and toast patterns exist and are mostly used); section D lists the exceptions.
- Verifier notes were preserved verbatim because several contain fix corrections; where a verifier adjusted a severity, the adjusted severity is shown.
