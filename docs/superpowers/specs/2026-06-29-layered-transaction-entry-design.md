# Layered Transaction Entry — Design

**Date:** 2026-06-29
**Status:** Approved design, pending implementation plan

## Problem

The transaction form exposes raw double-entry: every transaction is a set of
postings that must sum to zero per commodity. This is correct and powerful, but
most people don't think in debits and credits — they think *"I spent $42 on
groceries with my debit card."* The single generic form makes everyday entry
feel harder than it needs to be, while power users want the speed of typing
ledger directly.

## Goal

Let each user enter transactions at the level of abstraction they prefer,
without changing any settings to do so on a one-off basis, and without changing
the underlying data model. The ledger file stays the single source of truth.

## Core Idea: three lenses over one draft

There is one canonical in-memory transaction **draft** — the existing
`transactionDraftSchema` (`date · payee · status · note · postings`). Each entry
level is a **lens** that reads and writes that same draft:

1. **Raw lens** — a textarea of ledger text. The existing parser converts
   text ↔ draft with live validation. This is in-app hand-editing; the
   power-user fast path.
2. **Form lens** — today's `PostingRow` posting UI, unchanged. Becomes one tab.
3. **Type lens** — friendly per-type mini-forms (Expense, Income, Transfer,
   Exchange, Fix balance).

Nothing new is written to the ledger file. A transaction's "type" is **never
stored** — it is **inferred** from posting shape whenever needed. This keeps
files clean, portable, and fully compatible with imported or hand-edited
journals, and dissolves any source-of-truth/sync problem: every lens compiles
down to the same standard postings.

## The new/edit transaction page becomes tabbed

Tabs: `Types · Form · Raw`. All three are **always present**. They share one
draft, so switching tabs carries the in-progress transaction.

- **Form ↔ Raw** conversion is always lossless (both represent arbitrary
  postings).
- **Type tabs are enabled only when the current draft matches a type**
  (via the type's `detect()`). Example: build a clean 2-posting expense and the
  Expense form shows it; add a third posting (a split) in Form and the Type tabs
  grey out with a tooltip — *"Splits can't be shown as a single type; edit in
  Form or Raw."* Nothing is ever lost; the richer lenses take over.

### Default tab and order (settings)

A small settings block controls the **order** of the three tabs; the **first
tab is the default**. Ships as `Types · Form · Raw` (Types default). A power
user can reorder to `Raw · Form · Types`. Order/default is a global per-user
preference; per-transaction switching never requires touching settings.

## Type engine

Each type is an **adapter** exposing three functions over the shared draft:

- `fields` — the friendly inputs the user sees.
- `compile(fields) → postings` — build the canonical draft.
- `detect(postings) → fields | null` — recognize this type when opening an
  existing transaction; `null` means "not this type."

On **edit**: run `detect()` for each type. A match opens that Type tab; no match
opens the **Form** tab; Raw is always available. Imported/hand-written
transactions that fit no type simply land in Form/Raw.

### Account-role classification

Type forms need to know each account's role (to offer the right accounts and to
power `detect()`). Classification uses the **standard five roots**:
`Assets`, `Liabilities`, `Income`, `Expenses`, `Equity`.

Journals that don't follow this convention still work **fully** via the Form and
Raw tabs; the Type tabs just won't auto-apply. An alias map or per-user mapping
can be added later if needed — out of scope for v1.

### Categories on the fly

In Type forms, account fields ("Spent on", "From", etc.) are comboboxes over the
user's existing accounts. Typing a new name creates the account path on save
(`Expenses:<name>`, `Income:<name>`). The user never types a root prefix — they
just see a category.

## The five types (v1)

Friendly fields on top; generated postings underneath (normally hidden).

### Expense — "I spent money"
Fields: Amount + currency · Date (default today) · Paid from (asset/liability) ·
Spent on (expense category) · Payee (optional) · Note (optional).
```
2026-06-29 Whole Foods
    Expenses:Groceries     $42.50
    Assets:Checking       -$42.50
```

### Income — "I received money"
Fields: Amount + currency · Received into (asset) · From (income source) ·
Payee (optional) · Note (optional).
```
2026-06-29 Acme Corp
    Assets:Checking    $3,000
    Income:Salary     -$3,000
```

### Transfer — "I moved my own money"
Fields: Amount + currency · From (asset) · To (asset) · Note (optional).
Single currency.
```
2026-06-29 Transfer
    Assets:Savings     $500
    Assets:Checking   -$500
```

### Exchange — currency/commodity conversion
Fields: You gave (amount + currency) from (account) · You got
(amount + currency) into (account).

Two different commodities cannot balance on their own, so a **price annotation
is required**. The form collects both totals, so output uses total-cost form
(`@@`), which also records the rate for later multi-currency reporting and gains.
```
2026-06-29 Currency exchange
    Assets:EUR-Wallet   €92 @@ $100
    Assets:Checking   -$100
```

### Fix balance — reconcile an account to a known balance
Fields: Account · "Should be" target amount + currency.

The app reads the current balance and books the difference. Output is a
**balance assertion plus an auto-balanced `Equity:Adjustments` posting**:
self-documenting (the file states the intended balance), ledger-verified, and
the difference stays in an equity bucket out of income/expense reports.
```
2026-06-29 Balance adjustment
    Assets:Checking   = $1,234.56
    Equity:Adjustments
```

## Templates interaction

The existing templates feature is unaffected and complementary: selecting a
template prefills the shared draft, after which any lens can edit it.

## Build plan (phased, each independently shippable)

1. **Lens scaffold** — convert the new/edit page into the tabbed shell over one
   shared draft; move today's form into the **Form** tab. Pure refactor, no new
   entry logic.
2. **Raw tab** — wire textarea ↔ existing parser ↔ draft with live validation.
3. **Type engine** — the adapter interface (`fields` / `compile` / `detect`) and
   the account-role classifier (standard roots + graceful fallback).
4. **The five type forms** — Expense, Income, Transfer, Exchange, Fix balance,
   each an adapter + mini-form.
5. **Settings** — entry-tab order / default.

## Non-goals (v1)

- Storing the type in the ledger file.
- Account-role aliases or per-user role mapping (standard roots only for now).
- Additional types beyond the five (debt/lend, refund, investment) — reachable
  via Form/Raw; addable later cheaply once the adapter framework exists.
- Natural-language quick-add, smart per-type defaults, and recurring/scheduled
  transactions — noted as future ideas riding on the same machinery.

## Key decisions (resolved)

| Decision | Choice |
|---|---|
| Entry model | Tabbed layered entry; Types default; all three always available |
| Source of truth | Ledger file unchanged; type inferred, never stored |
| v1 types | Expense, Income, Transfer, Exchange, Fix balance |
| Account roles | Standard five roots, graceful fallback to Form/Raw |
| Level choice | Global default + tab order in settings; per-entry switching free |
| Exchange rate | Total-cost `@@` annotation (required to balance) |
| Fix balance | Balance assertion + auto-balanced `Equity:Adjustments` |
