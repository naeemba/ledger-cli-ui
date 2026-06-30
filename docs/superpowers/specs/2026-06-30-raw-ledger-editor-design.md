# Raw ledger editor — design

**Date:** 2026-06-30
**Status:** Approved (pending spec review)

## Problem

The raw transaction entry surface (`RawLens`) is a plain `<textarea>`. It has no
autocomplete, no formatting, and no smart indentation, even though the form layer
(`FormLens`) already has account/payee/currency comboboxes and the suggestion lists
are already fetched server-side and passed down as props. Typing a transaction as raw
ledger text is therefore unassisted and error-prone.

## Goals

Upgrade the raw entry field to an IDE-grade editor with exactly four capabilities:

1. **Context-aware autocomplete** at the caret — accounts on posting lines, payees on
   the header line, commodities/currencies after an amount.
2. **Ledger syntax highlighting**.
3. **A formatter** that aligns amounts to a column and normalizes indentation.
4. **Smart indentation** — Enter auto-indents new posting lines; Tab is context-aware.

## Non-goals (YAGNI)

- Snippet templates / transaction-type scaffolding (that is `TypeLens`).
- Editing multiple transactions in one buffer.
- Linting beyond the existing single parse error.
- User-facing settings/toggles for any of the above.

## Decisions

| Decision | Choice |
|----------|--------|
| Editor engine | CodeMirror 6 |
| React integration | `@uiw/react-codemirror` wrapper + specific `@codemirror/*` extensions |
| Format trigger | On blur + a Format button + `Shift+Alt+F`. Never reformats while typing. |
| Tab key | Smart: accept open completion if dropdown is open, else insert a posting indent. `Shift+Tab` dedents. |
| Enter key | Auto-indents the next line to 4 spaces when on/after a posting or header line. |
| Indent unit | 4 spaces (matches existing `formatTransaction` output). |

## Architecture

The existing data flow is preserved exactly — only the input surface changes. The
editor's `onChange(value)` feeds the same `parseBlock` → `dispatch({ type: 'replaceAll' })`
path with the same error handling, so `RawLens`'s parse/dispatch logic and its tests
are untouched.

```
RawLens.tsx  (swap <Textarea> for <LedgerEditor>; thread suggestion lists in)
  └─ LedgerEditor                 features/transactions/entry/LedgerEditor.tsx
       ├─ ledgerLanguage()        lib/ledger/highlight.ts    StreamLanguage tokenizer
       ├─ ledgerCompletions(lists) lib/ledger/completions.ts context-aware CompletionSource
       ├─ ledgerKeymap            (Smart Tab + Enter auto-indent, in LedgerEditor)
       └─ formatLedgerText()      lib/ledger/format.ts       pure formatter
```

### Prop threading

`accounts`, `payees`, and `commodities` are already fetched in `NewTransaction.tsx`
and passed to `TransactionEntry` (and onward to `FormLens`). Thread the same three
lists into `RawLens`, which passes them to `LedgerEditor`. No new server calls.

### Components and units

**`LedgerEditor`** — `features/transactions/entry/LedgerEditor.tsx`
- Props: `value: string`, `onChange: (v: string) => void`, `accounts: string[]`,
  `payees: string[]`, `commodities: string[]`, plus `aria-label` and styling passthrough.
- Composes CodeMirror extensions: `ledgerLanguage()`, `autocompletion({ override: [ledgerCompletions(lists)] })`,
  the smart keymap, syntax highlight theme, and an on-blur handler that calls
  `formatLedgerText` and writes the result back through `onChange`.
- Exposes the Format action (button rendered by `LedgerEditor` or `RawLens`) and the
  `Shift+Alt+F` binding, both calling `formatLedgerText`.

**`ledgerLanguage()`** — `lib/ledger/highlight.ts`
- A `StreamLanguage`-based tokenizer that tags: date, status marker (`*` / `!`),
  payee, account, amount + commodity, and `;` comments. Mapped to the app theme
  (light/dark). No unit tests (visual, low value).

**`ledgerCompletions(lists)`** — `lib/ledger/completions.ts`
- A factory returning a `CompletionSource`. Given the document + caret, classify the
  current line and caret position:
  - header line (`^\d{4}-\d{2}-\d{2}`) with caret past the date/status → **payees**
  - indented posting line, caret within the account token → **accounts**
  - posting line, caret after an amount number → **commodities**
  - otherwise → no completions
- Free-text always allowed; unknown values are never blocked.
- Unit-tested: caret-context → expected source + filtered options.

**`formatLedgerText(raw): string`** — `lib/ledger/format.ts`
- Pure. Reuses `lib/journal/parser.ts` line parsers to split account/amount.
- Normalizes posting indent to 4 spaces.
- Aligns every amount to a shared start column = (longest `indent + account`) + gap.
- Preserves comments and unparsed lines verbatim — no data loss, no routing through
  the draft.
- Idempotent: `format(format(x)) === format(x)`.
- Unit-tested: alignment, comment/unparsed preservation, idempotency.

### Keymap detail

- **Enter**: if the current line is a header or posting line, insert `\n    ` (newline +
  4 spaces) so the next posting starts indented; otherwise default newline.
- **Tab**: if the completion dropdown is open, `acceptCompletion`; else insert a 4-space
  indent at the line start position. **Shift+Tab**: dedent one level.

## Error handling

Unchanged from today: on `onChange`, `parseBlock` failures set the existing
`PARSE_ERROR` and propagate via `onError`. The formatter is defensive — if `raw` cannot
be parsed into postings, it returns the input unchanged rather than throwing, so a
half-typed transaction is never mangled or lost on blur.

## Testing

- `formatLedgerText` — alignment correctness, comment + unparsed-line preservation,
  idempotency, and the unparseable-input passthrough.
- `ledgerCompletions` — header→payees, posting-account→accounts, post-amount→commodities,
  and substring filtering.
- `RawLens` — existing parse→dispatch(`replaceAll`) behavior still holds (regression).
- Highlighting tokenizer — not unit-tested (visual).

## Mobile

CodeMirror 6 is touch-capable; the completion dropdown must not be clipped inside the
entry container. Verify the editor and dropdown render correctly at mobile widths
(consistent with the project's mobile roadmap work).

## Dependencies

Add `@uiw/react-codemirror` and the required `@codemirror/*` packages
(`@codemirror/state`, `@codemirror/view`, `@codemirror/commands`,
`@codemirror/autocomplete`, `@codemirror/language`) via pnpm.
