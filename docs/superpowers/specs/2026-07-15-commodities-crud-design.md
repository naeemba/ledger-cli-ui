# Commodities CRUD — design

2026-07-15

## Problem

Commodity display behavior (decimal precision, aliases, note, `nomarket`,
`default`) is controlled by `commodity` directive blocks in the user's
definitions file. Today the only way to change one is a full backup
download → hand edit → re-import round trip. Concretely: a
`format KIRT 1,000` block (zero decimals) makes every register surface render
`Kirt 0.9` as `KIRT 1`, and there is no in-app way to fix it.

## Goal

A CRUD surface for commodity definitions on the existing `/currencies` page,
editing `definitions.ledger` blocks in place without disturbing the rest of
the file. (`definitions.ledger` is the relocated home for user declarations —
included by the main journal; the legacy `price-db.ledger` is deleted by the
relocation flow. Users not yet relocated see their legacy blocks read-only
with a hint until relocation runs.)

## Non-goals

- Editing definitions that live in files other than `definitions.ledger`
  (shown read-only with a hint instead).
- Editing `P` price directives (the Prices page owns those).
- Arbitrary raw `format` strings in the form — the UI models display
  decimals only and compiles the directive itself.

## UI

`/currencies` becomes two tabs:

- **Price mapping** — the existing `CurrenciesView`, unchanged.
- **Commodities** — new. A table of every commodity observed in the journal
  (existing available-currencies source) left-joined with parsed definition
  blocks:
  - Defined in `definitions.ledger`: editable row (edit dialog).
  - Defined elsewhere (legacy `price-db.ledger` or another include):
    read-only row with a "defined in <file>" hint.
  - No definition: row with an "Add definition" action, pre-filled symbol.

Form fields:

| Field | Directive | Form control |
|---|---|---|
| Symbol | `commodity <symbol>` | text, create-only (immutable on edit) |
| Note | `note <text>` | text |
| Aliases | `alias <symbol>` (repeatable) | tag list |
| Display decimals | `format <symbol> 1,000[.0…]` | number input 0–8, blank = no format line |
| No market | `nomarket` | checkbox |
| Default | `default` | toggle; setting it clears the flag from the previous holder |

Delete removes the whole block (postings referencing the commodity are
untouched — it is display metadata only).

## Data model

```ts
type CommodityDefinition = {
  symbol: string;          // unquoted canonical symbol
  note?: string;
  aliases: string[];
  decimalPlaces?: number;  // derived from the format sample
  nomarket: boolean;
  default: boolean;
  file: string;            // where the block lives
  startLine: number;       // block span, inclusive
  endLine: number;
};
```

## Parsing and serialization

- New parser module beside `lib/prices/definitions.ts`, reusing its
  block-tracking approach: a block starts at `commodity <symbol>` and ends
  before the next non-indented, non-blank line. Symbols are unquoted for the
  model and re-quoted on write only when they contain separator characters
  (the existing `extractDefinitions` rule).
- `format` samples are parsed for decimal count (`1,000.00` → 2). A sample
  that cannot be modeled (scientific, no thousands group, unexpected tokens)
  marks the block **opaque**.
- A block containing unmodeled lines (inline comments, unknown
  sub-directives) is **opaque**: it renders with a raw-block textarea editor
  instead of the form, so no line is ever silently dropped.
- Serialization is canonical (tab-indented sub-directives, one per line,
  field order: note, alias…, format, nomarket, default). Round-trip test:
  parse → serialize equals input for canonical blocks.

## Writes

One server action per operation (project convention):

- `createCommodityAction` — append a block to `definitions.ledger`,
  creating the file (banner + `include` line in the main journal) when
  missing.
- `updateCommodityAction` — replace exactly `startLine..endLine`.
- `deleteCommodityAction` — remove the span plus one adjacent blank line.
- Setting `default` rewrites the previous default holder's block too
  (both edits in one write).

Every action:

1. Validates fields with Zod (symbol charset mirrors `currencySchema`;
   decimals 0–8; aliases distinct, not equal to any existing symbol —
   ledger aborts on alias/commodity collisions).
2. Uses the journal repository read-modify-write path with the existing
   fingerprint/ETag concurrency guard.
3. Runs the existing verify-with-`ledger stats` guard and rolls back if
   ledger rejects the file set.

## Testing

- Parser: fixtures from the real price-db shapes (quoted symbols, `د.إ`,
  symbol-less format samples, opaque blocks); round-trip property.
- Actions: end-to-end against a temp journal layout — create/update/delete,
  default-flag handover, rejection rollback.
- One ledger-backed test: saving decimals=1 for a 0-decimal commodity
  changes `ledger reg %t` output from `KIRT 1` to `KIRT 0.9` (per the
  CLAUDE.md rule, verified against ledger 3.4.1, not JS math).
