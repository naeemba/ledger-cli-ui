# Extra Items in Guided Transaction Forms

**Date:** 2026-07-09
**Status:** Approved design, pending implementation plan

## Problem

A single transaction often carries incidental extra postings — a tip on a
meal, a shipping fee on a purchase, a broker fee on a trade, a processor cut on
income. The **Form** and **Raw** entry lenses already allow arbitrary extra
postings (min 2, max 50). The **Types** tab does not: each of the five guided
forms compiles to exactly two postings, so a user working in a guided form has
no way to add a fee or tip without dropping down to the Form/Raw lens.

This design adds a dynamic "extra items" list to the guided forms so a user can
append as many fee/tip-style postings as they want, each with its own account,
amount, and currency.

## Scope

- **In scope:** Expense, Exchange, Transfer, Income guided forms.
- **Out of scope:** Fix Balance form (a balance assertion has no meaningful
  notion of extra items).
- **Out of scope:** changes to the generic `Transaction` model, the Form lens,
  or the Raw lens — they already support arbitrary postings.

## Data Model

A new shared type describes one extra item:

```ts
type ExtraItem = { account: string; amount: string; currency: string };
```

Each extra item corresponds to exactly one ledger posting.

`ExtraItem[]` is added to the **domain field types** of the four affected
adapters (`expense.ts`, `exchange.ts`, `transfer.ts`, `income.ts`) as
`extraItems: ExtraItem[]`. It is **not** added to the generic `Transaction`
class — after compilation, extras are simply additional entries in the
existing `postings` array.

Each adapter's `emptyFields()` seeds `extraItems: []`.

## Compile (fields → postings)

Each extra item compiles to one posting `{account, amount, currency}`. The
form's **balancing account** absorbs the extras, emitting one posting per
distinct currency. Nothing relies on ledger's blank-posting elision — every
amount is explicit, matching the current adapters' behavior.

The absorbing account and direction are form-specific:

| Form     | Base posting            | Absorbing account | Effect of extras                                          |
|----------|-------------------------|-------------------|-----------------------------------------------------------|
| Expense  | `spentOn +base`         | `paidFrom`        | outflow grows: `paidFrom = -(base + extras)` per currency |
| Transfer | `to +base`              | `from`            | outflow grows: `from = -(base + extras)` per currency     |
| Exchange | buy/sell with `@@` cost | paying asset acct | fee posting(s) added; asset pays the extra per currency   |
| Income   | `source -base`          | `earnedTo`        | inflow shrinks: `earnedTo = +(base - extras)` per currency |

Grouping rule: sum extra amounts by currency; the base currency folds into its
own currency group. Emit one absorbing posting per distinct currency present
across base + extras.

### Example (Expense)

Base 100 USD to `Expenses:Dining`, paid from `Assets:Checking`, plus tip 20 USD
and fee 2 EUR:

```
Expenses:Dining   100 USD
Expenses:Tips      20 USD
Expenses:Fees       2 EUR
Assets:Checking  -120 USD
Assets:Checking    -2 EUR
```

`Assets:Checking` emits two postings because two currencies are present.

## Detect (postings → fields)

`detect()` currently returns fields only for the exact two-posting shape. It
must now accept **N postings**:

1. Identify the base posting using the existing per-adapter rule (Expense: the
   positive `Expenses:*` posting; Income: the negative `Income:*` posting;
   etc.).
2. Identify the absorbing account — the asset/liability posting(s) filling the
   `paidFrom`/`from`/`earnedTo` role.
3. Everything remaining becomes `extraItems`.

**Determinism guard:** only lift a posting into `extraItems` when the two
canonical postings are unambiguously identifiable (a single base posting of the
expected account type plus a single absorbing asset/liability account, possibly
split across currencies). If the classification is ambiguous, `detect()`
returns `null` and the draft falls back to the Form/Raw lens exactly as it does
today. This guarantees no regression: a draft that is recognized today stays
recognized; a draft that is unrecognized today is never *mis*-recognized.

`detectType()` in the registry is unchanged in spirit: the first adapter whose
`detect()` returns non-null wins, and adapter order is preserved. The added
extra-item handling must not let, e.g., an Expense-with-extras draft be misread
as a Transfer.

## UI

A new shared component `ExtraItemsField.tsx` lives in
`features/transactions/entry/typeForms/` and is rendered by all four affected
forms.

- Section label: "Extra items (fees, tips…)" with a `[+ add item]` button.
- Each row: Account combobox (default filter to Expense accounts, any account
  allowed) · AmountInput · CurrencyCombobox (defaults to the form's currency) ·
  remove `[x]` button.
- An empty list renders only the add button (no visual clutter).
- Reuses the existing `Combobox`, `AmountInput`, and `CurrencyCombobox`
  widgets — the same components used by `PostingRow`.

Each form renders `<ExtraItemsField items={fields.extraItems} onChange={…} />`
below its core fields and above the balance/preview area.

**Cap:** the total posting count remains bounded by the existing
`MAX_POSTINGS = 50` (schema.ts). Adding an item that would exceed the cap is
disabled with a hint.

## Testing

- **Adapter compile** (each of the four): base + N extras same currency; mixed
  currency producing per-currency absorbing postings; zero extras producing
  byte-identical output to today (regression guard).
- **Adapter detect round-trip**: `compile → detect` returns identical fields
  including extras; an ambiguous three-posting draft returns `null`; existing
  two-posting drafts still detect unchanged.
- **detectType ordering**: an Expense-with-extras draft is not misread as
  Transfer, and analogous cross-type checks.
- **Schema**: N extras within `MAX_POSTINGS` passes; exceeding 50 is rejected.
- **Component** (`ExtraItemsField`): add/remove rows; currency defaulting to the
  form currency.
- **Snapshot**: serialized ledger output for the mixed-currency Expense example
  above.
