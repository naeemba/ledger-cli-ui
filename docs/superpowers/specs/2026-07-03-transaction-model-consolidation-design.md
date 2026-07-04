# Transaction model consolidation (`Txn`) — design

**Date:** 2026-07-03
**Supersedes:** REVIEW.md item **G3** (parser/converter consolidation)
**Folds in:** REVIEW.md item **A4** (template hydration re-strips cost/assertion)

## Problem

The entry/transaction subsystem represents "a transaction with postings" as
**five near-identical container types** plus **one posting shape declared four
times**, and moves data between them through **six bespoke converter functions
scattered across five files**. Every converter must independently remember to
carry the `@@` cost and `=` assertion annotations; forgetting is the entire
A1–A4 bug class. The recently-added `carryAnnotations` helper papers over the
symptom (field-copy) without addressing the cause (too many parallel types and
ad-hoc converters).

### The one posting shape, declared 4×

`ParsedPosting` (`lib/journal/parser.ts`), `DraftPosting`
(`features/transactions/entry/draftReducer.ts`), `postingSchema`
(`lib/transactions/schema.ts`), and `TransactionRow`'s inline posting
(`features/transactions/transactionRow.ts`) are field-for-field identical:

```ts
{ account: string; amount: string; currency: string; cost?: Annotation; assertion?: Annotation }
```

### The five container states (these genuinely differ — do NOT merge)

| State | Type | Distinct because |
|---|---|---|
| parsed | `Transaction` / `ParsedBlock` | carries provenance: `file`/`startLine`/`endLine`/`rawBlock`/`fingerprint` (Transaction) or `unparsedLines` (ParsedBlock) |
| draft | `DraftState` | mutable editor state; `note` is `string` not `string \| null` |
| submit | `TransactionDraft` (`z.infer`) | zod-validated wire format; has `date`+`uid` |
| template | `TemplateDraft` (`z.infer`) | **no `date`, no `uid`** by design |
| row | `TransactionRow` | list view-model = `Transaction` minus `rawBlock`/`endLine` |

### The six converter edges (scattered)

```
parsed   ─parsedBlockToDraft→  draft       entry/parsedBlockToDraft.ts
txn      ─transactionToDraft→  draft/submit entry/transactionToDraft.ts   (A1)
template ─(inline map)───────→ draft       NewTransaction.tsx:44          (A4, still inline)
draft    ─draftToTemplateDraft→ template   entry/draftToTemplateDraft.ts  (A3)
txn      ─toTransactionRow───→ row         transactionRow.ts
row      ─toTemplateDraft────→ template    transactionRow.ts              (A2)
```

`draft` is the natural hub — almost every edge is `draft ↔ X`. Two separate
template producers exist only because the row path bypasses the draft.

## Goal

One canonical in-memory model — a **`Txn` class** — that owns the shared
editable field set, exposes named constructors (`from…`) and named outputs
(`to…`), and is used at every boundary. Reconstructed from JSON wherever
behavior is needed (instance identity is irrelevant; outputs are what matter).

## Non-goals (scope boundaries)

- **Does not absorb the `types/*` + `typeForms/*` adapter layer**
  (transfer/expense/income/exchange/fixBalance). Those encode per-transaction-type
  domain rules and their own `toDraft`/`fromDraft`; they become *consumers* that
  call `Txn` constructors. Folding them in balloons scope for marginal gain.
- **Does not merge the parser types.** `Transaction`/`ParsedBlock` keep their
  provenance fields; `Txn.fromTransaction`/`fromParsedBlock` project out the
  editable core. Provenance (e.g. `fingerprint` for the concurrency guard)
  continues to travel separately, exactly as today (`expectedFingerprint`).
- **Does not change `TransactionDraft`/`TemplateDraft` as DTOs.** They remain
  plain `z.infer` types — the validated shapes at the boundary. `Txn.toSubmit()`
  / `Txn.toTemplate()` produce them; zod still validates them.

## Design

### The model

```ts
// lib/transactions/model.ts
export type Posting = {              // the ONE posting shape, declared once
  account: string; amount: string; currency: string;
  cost?: Annotation; assertion?: Annotation;
};

export type TxnStatus = 'cleared' | 'pending' | 'none';

/** Serialized wire shape for the hidden entry-form field. */
export type TxnJSON = {
  date: string; payee: string; status: TxnStatus;
  note?: string; uid?: string; postings: Posting[];
};

export class Txn {
  constructor(
    readonly date: string,          // '' when hydrated from a date-less template
    readonly payee: string,
    readonly status: TxnStatus,
    readonly note: string | null,
    readonly postings: readonly Posting[],
    readonly uid?: string | null,
  ) {}

  // ── named constructors ──
  static empty(defaultCurrency: string): Txn;
  static fromTransaction(tx: Transaction, defaultCurrency: string): Txn;
  static fromParsedBlock(block: ParsedBlock, prev?: Txn): Txn;
  static fromTemplate(t: TemplateDraft, defaultCurrency: string): Txn;
  static fromJSON(j: unknown): Txn;               // server-side rehydrate

  // ── immutable updates (reducer delegates to these) ──
  withField(field: 'date' | 'payee' | 'status' | 'note', value: string): Txn;
  withPosting(index: number, patch: Partial<Posting>): Txn;
  addPosting(currency: string): Txn;
  removePosting(index: number): Txn;              // no-op below 2 postings

  // ── named outputs ──
  // NB: named `toWire`, not `toJSON`, to avoid colliding with the built-in
  // JSON.stringify hook (which would call it with a key arg, not our mode).
  toWire(mode: 'create' | 'edit'): TxnJSON;       // trims; drops uid unless edit
  toSubmit(): TransactionDraft;                   // → transactionDraftSchema.parse
  toTemplate(): TemplateDraft;                    // trims; drops date/uid
}
```

`Posting` is imported by the parser (`ParsedPosting = Posting`), the reducer,
`postingSchema`'s inferred type, and `TransactionRow` — collapsing four
declarations to one. `carryAnnotations` is deleted: a `Posting → Posting`
copy is a plain spread, and `to*` methods build the exact target shape once.

### Reducer (Option B — the class IS the state)

`useReducer` state becomes a `Txn` instance. Each action delegates to an
immutable `with*`/`add*`/`remove*` method returning a new `Txn`:

```ts
export const draftReducer = (state: Txn, action: DraftAction): Txn => {
  switch (action.type) {
    case 'setField':     return state.withField(action.field, action.value);
    case 'setPosting':   return state.withPosting(action.index, action.patch);
    case 'addPosting':   return state.addPosting(action.currency);
    case 'removePosting':return state.removePosting(action.index);
    case 'replaceAll':   return action.state;     // action.state is a Txn
    default:             return state;
  }
};
```

Consumers that only *read* fields (`draft.postings`, `draft.payee`, …) are
unaffected — a `Txn` instance satisfies the same field access. Only sites that
**construct** a draft literal must switch to a `Txn` constructor.

### Data flow (unchanged at the boundary)

```
edit page:   Txn.fromTransaction(tx, cur) ──▶ reducer state
raw lens:    Txn.fromParsedBlock(block, prev) ──▶ dispatch replaceAll
template:    Txn.fromTemplate(t, cur) ──▶ reducer state          (closes A4)
form field:  <input name="draft" value={JSON.stringify(draft.toWire(mode))} />
server:      Txn.fromJSON(JSON.parse(draftJson)).toSubmit() ──▶ zod.parse
save tmpl:   draft.toTemplate() ──▶ templateInputSchema.safeParse
```

## Blast radius

~26 files consume `DraftState`/`DraftPosting`/`dispatch`; five converter files
plus `serializeDraftJson`/`initDraft`/`emptyPostings` are replaced. The
`types/*` + `typeForms/*` layer constructs draft shapes and is the largest
consumer group — those construction sites switch to `Txn` constructors but keep
their domain logic.

## Phasing (each phase = one PR, suite green throughout)

- **P1 — introduce, wire nothing.** Add `Posting` + `Txn` (all constructors,
  updates, outputs) in `lib/transactions/model.ts`, fully unit-tested (round-trip
  `fromX(...).toY()`, cost/assertion carried, trimming, date-less template,
  `removePosting` floor). Existing code untouched.
- **P2 — repoint the reducer & state.** `draftReducer` operates on `Txn`;
  `initDraft`→`Txn.empty`/`fromX`; `serializeDraftJson`→`toWire`. Update the ~26
  consumer construction sites. `types/*`/`typeForms/*` build `Txn` via
  constructors.
- **P3 — replace the converters.** Swap `transactionToDraft`,
  `parsedBlockToDraft`, `draftToTemplateDraft`, row `toTemplateDraft`, and the
  inline template-hydration map (**A4**) for `Txn` calls. Delete the old
  converter files and `carryAnnotations`.
- **P4 — sweep.** Collapse the four posting declarations to one `Posting`;
  delete dead exports; confirm a single declaration; full green.

## Testing

- TDD throughout: `lib/transactions/model.test.ts` is written first in P1 and
  pins every constructor/output, especially cost/assertion round-tripping and
  the date-less-template case that A2–A4 regressed.
- P2–P4 are behavior-preserving: the existing 872-test suite is the regression
  net. `npx vitest run`, `npx tsc --noEmit`, `npx eslint` green before each PR.
- No new mocks — the model is pure; constructors take plain parsed/DTO inputs.

## Risks

- **Construction-site sweep (P2)** is the main risk: a plain literal passed where
  a `Txn` instance is expected fails typecheck. Mitigation: `tsc --noEmit` after
  each file; phase is mechanical and compiler-guided.
- **`readonly postings`** — consumers that mutate the array in place would break.
  Audit in P2; the reducer already treats postings immutably, so exposure is low.
