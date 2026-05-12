# TODO

## Features

### Tier 1 — high value, small lift
- [x] **Net Worth over time** — `/net-worth`.
- [x] **Income vs Expenses (cash flow)** — `/monthly` shows income, expenses, and net side-by-side.
- [x] **Recent transactions on Dashboard** — `register --head 10` table on `/`.
- [x] **Stats card on Dashboard** — "Journal health" grid sourced from `ledger stats`.
- [x] **Account-tree search** — client-side filter on `/accounts`.

### Tier 2 — journal-conditional
- [ ] **Budget actual-vs-target** — `ledger budget`. Paused: user wants help setting up periodic transactions first before we wire the UI.
- [x] **Reconciliation view** — `/reconcile`. Uncleared postings sorted by age, stale-over-30-days called out.
- [x] **Payee analytics** — `/payees/[from]/[to]`. Top 15 payees by spend, with chart and DateFilter. Default range is the last 12 months ending today.

### Tier 3 — niche / larger
- [ ] CSV export of any report (`ledger csv`).
- [ ] Commodity / portfolio view (`bal Assets:Investments -X CCY`).
- [ ] Forecasting (`ledger --forecast`).

## Cleanup / bugs noticed during review

- [ ] **Orphan `/api/upload` + `FileUpload`** — no UI references it. Wire into nav or delete.
- [x] **`MonthlyComparison.utils.ts` 48-subprocess loop** — replaced with two parallel `reg --monthly` calls.
- [ ] **Amount parsing fragility** — `each.split('|')[1].split(' ')[1]` assumes the `<unit> <amount>` shape and breaks for unit-less amounts. Still affects `/registers/monthly/[account]`.

## Maintenance

- [ ] Tests — pure-function targets: `Dashboard.utils#getHighestExpense`, `Accounts.utils#buildTree`, `MonthlyComparison.utils#getCashFlow`, `Reconcile#parseRows`, `validateAccount`, `formatAmount`, `formatDate`. Vitest is the natural fit.
- [ ] ESLint 10 — blocked. Retested 2026-05-12: `eslint-plugin-react@7.37.5` still latest; bumping to 10.x reproduces `getFilename is not a function`. Revisit when upstream releases.

## Done

- [x] Help tooltips (`?` icons) across every page header.
- [x] Net Worth at `/net-worth`.
- [x] Cash Flow at `/monthly`.
- [x] Recent transactions widget on Dashboard.
- [x] Journal-health stats on Dashboard.
- [x] Account-tree search on `/accounts`.
- [x] Reconcile at `/reconcile`.
- [x] Payees at `/payees`.
