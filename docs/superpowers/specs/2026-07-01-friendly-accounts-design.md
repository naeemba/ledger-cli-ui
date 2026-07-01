# Friendly Accounts Section — Design

**Date:** 2026-07-01
**Status:** Approved design, pending implementation plan
**Scope:** The Accounts list section only. Presentation-layer only — no changes to the journal, ledger commands, or data model.

## Problem

The accounts section is legible to people who already know ledger-cli, but opaque to everyone else. Three distinct pains:

1. **Naming/hierarchy** — `Assets:Bank:Checking` colon-notation looks alien.
2. **The "accounts" concept** — non-ledger users don't think of Income/Expenses as *accounts*; they think in terms of *money they have/owe* and *where money goes*.
3. **Discovery/navigation** — the current list (`features/accounts/Tree.tsx`) is a flat, always-fully-expanded tree with no balances, no grouping by meaning, and no icons.

The raw material to fix this already exists in the codebase: `classifyAccount()` (`features/transactions/entry/types/accountRole.ts`) maps a root segment to a role, and the export route (`app/api/accounts/export/route.ts`) already pulls per-account balances via `ledger balance`. Neither is currently surfaced in the accounts list.

### Deliberately NOT solving

- **Renaming the colon-hierarchy.** The colon-paths *are* the ledger model — every ledger command and the portability of the journal depend on them. We keep them as the source of truth and only *display* them kindly. Inferring account subtypes from names (e.g. detecting "credit card") is explicitly out — it's a fragile guess ledger never promised.

## Approach

One reframe, entirely in the presentation layer. The same account data (names + balances) is rendered through a friendlier view. Nothing about the journal or the ledger commands changes.

## Section 1 — Grouping structure

The single flat tree is replaced by two labeled, collapsible sections mapped from ledger's roots:

- **Accounts** (what you have / owe) ← `Assets` + `Liabilities`
- **Categories** (where money comes from / goes) ← `Income` + `Expenses`

`Equity` and any `unknown`-role account (non-standard root) are tucked into a small **"Advanced / Other"** collapsible at the bottom — real data, but plumbing most users never touch, kept out of the two clean buckets.

Roles come from the existing `classifyAccount()` (root segment → `asset | liability | income | expense | equity | unknown`).

## Section 2 — How balances read

### The core truth

The **sign of a balance is the direction of the debt/flow**, and a single account can legitimately swing between directions over time (e.g. `Liabilities:My_Friend`: a credit balance means *you owe them*; a debit balance means *they owe you* — functionally a receivable). Therefore the direction indicator must be **derived from the actual signed balance relative to the role's normal polarity** — never hard-coded per role.

### Display rule

Always show the **magnitude** (absolute value) plus a **direction arrow** and **color**. A short **chip** appears only when the balance sits opposite its normal side (the surprising case).

A single pure function drives all three outputs:

```
balanceDisplay(role, signedBalance) -> { magnitude, direction: 'favor' | 'against', chip?: string }
```

- `direction: 'favor'` → arrow `↑`, green
- `direction: 'against'` → arrow `↓`, red
- `chip` is set only when the balance is reversed from the role's normal side.

Normal polarity per role (debit-normal = asset/expense; credit-normal = liability/income):

| Role | Normal balance | Reversed balance |
|---|---|---|
| **Liability** | `↓ $500` red (you owe) | `↑ $200` green · `owed to you` |
| **Asset** | `↑ $2,340` green | `↓ $50` red · `overdrawn` |
| **Income** | `↑ $5,000` green (earned) | `↓ $X` red · `reduced` (refund/reversal) |
| **Expense** | `↓ $412` red (spent) | `↑ $X` green · `refunded` (rebate) |

The arrow is a second rendering of the same computed direction, so colorblind users are not relying on red/green alone. One legend/tooltip explains the arrows; after that, the overwhelming majority of rows are just `↑/↓ + amount`, wordless — chips appear only on genuine exceptions.

### Data source

Reuse the balance approach from `app/api/accounts/export/route.ts` (`ledger balance ... -X <currency>`). Each account needs a signed balance in the base display currency; parent (collapsed) rows show the sum of their descendants, which ledger's hierarchical balance already computes. Multi-currency accounts are shown as a single base-currency figure in this friendly view; richer multi-currency display is out of scope here.

## Section 3 — Row layout & collapsing

1. **Collapsible nodes** replace the always-expanded tree. Collapsed parents roll up their descendants' balances so a folded node still shows a meaningful total.
   - **Default expand state:** everything collapsed **except `Expenses`, which is expanded** (spending categories are the most-checked view).
2. **Row anatomy:** `[disclosure triangle if parent] [leaf name] .... [↑/↓ magnitude + optional chip]`. The friendly leaf name leads.
   - **Deferred to implementation:** whether the full colon-path is shown muted alongside the leaf or only on hover/tooltip.
3. **Leaf rows stay clickable** → the existing account detail page (`app/accounts/[account]/page.tsx`, register + balance) is unchanged.

## Testing

The `balanceDisplay(role, signedBalance)` function is the part that must be correct and gets its own unit tests, explicitly covering:

- Normal cases for all four roles.
- `Liabilities:My_Friend` in the **reversed (owed-to-you)** state.
- An **overdrawn** asset (credit balance on a debit-normal account).
- Income refund / expense rebate reversals.
- Zero balances.

## Out of scope / documented follow-ups

- **"Ledger mode" setting.** A future per-user preference that renders accounts raw — five roots, full colon-paths, raw signs, always-expanded (i.e. today's behavior) — for power users. Deferred entirely, along with the decision of whether it is scoped to the accounts section or site-wide. This is also where the current raw tree is preserved.
- **Path visible-vs-tooltip** choice (Section 3, item 2).
- **Account-subtype icons / tagging.** Only via explicit user tagging if ever built; never inferred from names.
- **Richer multi-currency** rendering in the friendly view.
