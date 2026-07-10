# Project instructions — ledger-cli-ui

## HARD RULE: ledger does the accounting math, never JS/TS

`ledger` is the source of truth for every monetary and accounting computation.
Application code orchestrates ledger, parses its output, and handles only what
ledger genuinely cannot. **Do not reimplement ledger's math in JavaScript or
TypeScript.**

This is not a style preference. `ledger` is a mature, trusted engine with its
own commodity/precision/price-graph semantics; a JS reimplementation silently
diverges from it (float drift, wrong rounding, different sign/precedence rules),
and the two can accept or reject the same data differently. When money is
involved, that divergence is a bug.

### Forbidden — compute these by shelling out to ledger, not in JS/TS

- **Balancing / totals**: summing postings, per-currency residuals, checking a
  transaction balances. Use `ledger balance` / the register total column.
- **Currency conversion / valuation**: never divide or multiply rates in JS to
  cross commodities. Store the raw price directives and let `-X <ccy>` bridge
  them through ledger's price graph (including multi-hop pivots).
- **Aggregation / ranking of amounts**: per-payee, per-account, per-period sums
  and their sort order. Use `--by-payee`, `--collapse`, `--sort`, `-p`,
  `--period`, `--display`, etc.
- **Decomposing rendered amounts**: don't regex a rendered amount back into
  quantity + commodity. Ask ledger for the parts via
  `%(quantity(scrub(...)))` / `%(commodity(scrub(...)))`.
- **Windowing / running totals**: use `-p 'last N months'`, `--display
  'date>=[...]'` (not `-b` when a `%T` running total must accumulate from
  journal start), etc.

### Allowed in JS/TS — everything that is not accounting math

Orchestrating the `ledger` invocation; parsing its stdout into typed rows;
auth, HTTP, the database, and DB-only provenance (who/when a price was set);
formatting for display; dates and staleness flags; input validation that is
not itself an accounting decision.

### How to add a ledger-backed value

1. Find the ledger command that computes it. **Verify it by actually running
   `ledger` (3.4.1) against a synthetic multi-commodity journal** — commands and
   outputs, not memory or assumption. Watch for its gotchas (see
   `LEDGER-AUDIT.md`: e.g. `reg -P -X` segfaults without `--collapse`;
   `--sort -amount` compares pre-conversion commodities; `ledger prices` does
   not bridge; ledger inherits an input price's decimal count when it inverts).
2. Shell out via the existing `runLedger` / `runLedgerForUser` helpers.
3. Keep JS to parsing the output and non-accounting concerns.
4. Add a test that asserts the value comes out right end-to-end.

### Client-side exception

Instant per-keystroke feedback (e.g. the transaction entry form) may compute in
JS for responsiveness where shelling out is impossible — but a server-side
ledger check must be the authority for anything that gets **saved or acted on**.
The JS is a hint; ledger is the verdict.

### Reference

`LEDGER-AUDIT.md` at the repo root is the full audit of where this rule was
violated, the verified ledger replacements, and ledger 3.4.1 gotchas. Consult
and prune it when working in these areas.
