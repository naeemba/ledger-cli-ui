# Transaction Model Consolidation (`Txn`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the six scattered posting-converters and four duplicate posting declarations with one canonical `Txn` class (named constructors + outputs) that is the entry-form reducer state.

**Architecture:** A single `Txn` class in `lib/transactions/model.ts` owns the shared editable field set (`date`, `payee`, `status`, `note`, `postings`, `uid`). Named static constructors project the five container states (`Transaction`, `ParsedBlock`, `TemplateDraft`, wire JSON, empty) into a `Txn`; instance `to*` methods emit the validated DTOs (`TransactionDraft`, `TemplateDraft`) and the form-wire shape. Instances are reconstructed from JSON at each client/server boundary — identity never crosses, only field values. `useReducer` holds a `Txn` and each action delegates to an immutable `with*` method returning a new instance.

**Tech Stack:** TypeScript, React (`useReducer`), Zod (`z.infer` DTOs), Vitest.

## Global Constraints

- TDD: no production code without a failing test first. Suite command: `npx vitest run`.
- Green gate before every commit: `npx vitest run`, `npx tsc --noEmit`, `npx eslint <changed files>`.
- One PR per phase (P1–P4). Keep the existing 872-test suite green at every phase.
- Posting shape is exactly `{ account: string; amount: string; currency: string; cost?: Annotation; assertion?: Annotation }` where `Annotation = { amount: string; currency: string }` (`lib/journal/parser.ts:24`).
- `note` is represented internally as `string` (empty `''` = absent), matching the existing `DraftState` contract, so editor consumers keep reading a string. This **refines** the spec's `string | null` to minimize P2 consumer churn. `to*` outputs convert `''` → `undefined`.
- No self-reference in commits/docs (no AI/tooling attribution); no `Co-Authored-By` trailer.

---

## File Structure

- **Create** `lib/transactions/model.ts` — the `Posting` type + `Txn` class (constructors, immutable updates, outputs). One responsibility: the canonical in-memory transaction model.
- **Create** `lib/transactions/model.test.ts` — unit tests for every constructor/update/output.
- **Modify (P2)** `features/transactions/entry/draftReducer.ts` — reducer delegates to `Txn`; `DraftState`→`Txn`, `initDraft`/`emptyPostings`/`serializeDraftJson` removed in favour of `Txn` API.
- **Modify (P2)** the ~26 `DraftState`/`DraftPosting`/`dispatch` consumers (entry lenses, `typeForms/*`, `types/*`) — switch construction sites to `Txn` constructors; keep domain logic.
- **Modify (P3)** `features/transactions/EditTransaction.tsx`, `NewTransaction.tsx`, `RawLens.tsx`/`rawLensLogic.ts`, `pageTransactions.ts`, `RowActions.tsx` — call `Txn` constructors/outputs.
- **Delete (P3)** `transactionToDraft.ts`, `parsedBlockToDraft.ts`, `draftToTemplateDraft.ts`, `carryAnnotations.util.ts`; fold `transactionRow.ts`'s `toTemplateDraft` into `Txn.toTemplate`.
- **Modify (P4)** `lib/journal/parser.ts`, `lib/transactions/schema.ts`, `transactionRow.ts` — reference the single `Posting` type.

---

## Phase 1 — Introduce the `Txn` model (wire nothing)

Self-contained: adds new tested code, touches no existing behavior. Deliverable is `lib/transactions/model.ts` with a green `model.test.ts`.

### Task 1: `Posting` type and `Txn` constructors `empty` / `fromTransaction`

**Files:**
- Create: `lib/transactions/model.ts`
- Test: `lib/transactions/model.test.ts`

**Interfaces:**
- Consumes: `Annotation`, `Transaction` from `@/lib/journal/parser` (type-only).
- Produces:
  - `type Posting = { account: string; amount: string; currency: string; cost?: Annotation; assertion?: Annotation }`
  - `type TxnStatus = 'cleared' | 'pending' | 'none'`
  - `class Txn` with `constructor(date, payee, status, note, postings, uid?)` where `date: string`, `payee: string`, `status: TxnStatus`, `note: string`, `postings: readonly Posting[]`, `uid?: string`
  - `static Txn.empty(defaultCurrency: string): Txn`
  - `static Txn.fromTransaction(tx: Transaction, defaultCurrency: string): Txn`

- [ ] **Step 1: Write the failing test**

```ts
// lib/transactions/model.test.ts
import { describe, expect, it } from 'vitest';
import { Txn } from './model';
import type { Transaction } from '@/lib/journal/parser';

const txnFixture = (over: Partial<Transaction> = {}): Transaction => ({
  uid: 'u1',
  file: 'main.ledger',
  startLine: 1,
  endLine: 4,
  date: '2024-01-15',
  payee: 'Coffee Shop',
  status: 'cleared',
  note: null,
  postings: [
    { account: 'Expenses:Food', amount: '10.00', currency: 'USD' },
    { account: 'Assets:Cash', amount: '-10.00', currency: 'USD' },
  ],
  rawBlock: '',
  fingerprint: 'fp',
  ...over,
});

describe('Txn.empty', () => {
  it('seeds two blank postings in the default currency', () => {
    const t = Txn.empty('EUR');
    expect(t.date).toBe('');
    expect(t.payee).toBe('');
    expect(t.status).toBe('none');
    expect(t.note).toBe('');
    expect(t.uid).toBeUndefined();
    expect(t.postings).toEqual([
      { account: '', amount: '', currency: 'EUR' },
      { account: '', amount: '', currency: 'EUR' },
    ]);
  });
});

describe('Txn.fromTransaction', () => {
  it('projects the editable core and defaults blank currency', () => {
    const t = Txn.fromTransaction(txnFixture(), 'USD');
    expect(t.date).toBe('2024-01-15');
    expect(t.payee).toBe('Coffee Shop');
    expect(t.status).toBe('cleared');
    expect(t.note).toBe('');
    expect(t.uid).toBe('u1');
    expect(t.postings[0]).toEqual({
      account: 'Expenses:Food',
      amount: '10.00',
      currency: 'USD',
    });
  });

  it('carries cost and assertion annotations', () => {
    const t = Txn.fromTransaction(
      txnFixture({
        postings: [
          {
            account: 'Assets:USD',
            amount: '100',
            currency: 'USD',
            cost: { amount: '90', currency: 'EUR' },
          },
          {
            account: 'Assets:EUR',
            amount: '-90',
            currency: 'EUR',
            assertion: { amount: '500', currency: 'EUR' },
          },
        ],
      }),
      'USD'
    );
    expect(t.postings[0].cost).toEqual({ amount: '90', currency: 'EUR' });
    expect(t.postings[1].assertion).toEqual({ amount: '500', currency: 'EUR' });
  });

  it('maps a missing posting currency to the default', () => {
    const t = Txn.fromTransaction(
      txnFixture({
        postings: [{ account: 'A', amount: '1', currency: '' }],
      }),
      'GBP'
    );
    expect(t.postings[0].currency).toBe('GBP');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/transactions/model.test.ts`
Expected: FAIL — `Cannot find module './model'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/transactions/model.ts
import type { Annotation, Transaction } from '@/lib/journal/parser';

export type Posting = {
  account: string;
  amount: string;
  currency: string;
  cost?: Annotation;
  assertion?: Annotation;
};

export type TxnStatus = 'cleared' | 'pending' | 'none';

const carry = (p: {
  cost?: Annotation;
  assertion?: Annotation;
}): Pick<Posting, 'cost' | 'assertion'> => ({
  ...(p.cost ? { cost: p.cost } : {}),
  ...(p.assertion ? { assertion: p.assertion } : {}),
});

const blankPostings = (currency: string): Posting[] => [
  { account: '', amount: '', currency },
  { account: '', amount: '', currency },
];

export class Txn {
  constructor(
    readonly date: string,
    readonly payee: string,
    readonly status: TxnStatus,
    readonly note: string,
    readonly postings: readonly Posting[],
    readonly uid?: string
  ) {}

  static empty(defaultCurrency: string): Txn {
    return new Txn('', '', 'none', '', blankPostings(defaultCurrency));
  }

  static fromTransaction(tx: Transaction, defaultCurrency: string): Txn {
    return new Txn(
      tx.date,
      tx.payee,
      tx.status,
      tx.note ?? '',
      tx.postings.map((p) => ({
        account: p.account,
        amount: p.amount,
        currency: p.currency || defaultCurrency,
        ...carry(p),
      })),
      tx.uid ?? undefined
    );
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/transactions/model.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/transactions/model.ts lib/transactions/model.test.ts
git commit -m "feat(model): add Posting type and Txn.empty/fromTransaction (P1)"
```

### Task 2: constructors `fromParsedBlock`, `fromTemplate`, `fromJSON`

**Files:**
- Modify: `lib/transactions/model.ts`
- Test: `lib/transactions/model.test.ts`

**Interfaces:**
- Consumes: `ParsedBlock` from `@/lib/journal/parser`; `TemplateDraft` from `@/lib/templates/schema` (type-only).
- Produces:
  - `static Txn.fromParsedBlock(block: Omit<ParsedBlock, 'unparsedLines'>, prev?: Txn): Txn` — falls back to `prev?.uid` when `block.uid` is null (preserves raw-lens identity).
  - `static Txn.fromTemplate(t: TemplateDraft, defaultCurrency: string): Txn` — `date` is `''` (templates are date-less).
  - `static Txn.fromJSON(j: unknown): Txn` — trusts an already-parsed wire object; used server-side after `JSON.parse`.

- [ ] **Step 1: Write the failing test**

```ts
// append to lib/transactions/model.test.ts
import type { ParsedBlock } from '@/lib/journal/parser';
import type { TemplateDraft } from '@/lib/templates/schema';

describe('Txn.fromParsedBlock', () => {
  const block: Omit<ParsedBlock, 'unparsedLines'> = {
    uid: null,
    date: '2024-02-01',
    status: 'pending',
    payee: 'Rent',
    note: 'monthly',
    postings: [
      { account: 'Expenses:Rent', amount: '1200', currency: 'USD' },
      { account: 'Assets:Bank', amount: '-1200', currency: 'USD' },
    ],
  };

  it('maps the block and keeps note as a string', () => {
    const t = Txn.fromParsedBlock(block);
    expect(t.date).toBe('2024-02-01');
    expect(t.status).toBe('pending');
    expect(t.note).toBe('monthly');
    expect(t.postings).toHaveLength(2);
  });

  it('falls back to prev uid when the block omits it', () => {
    const prev = new Txn('2024-02-01', 'Rent', 'pending', '', [], 'keep-me');
    expect(Txn.fromParsedBlock(block, prev).uid).toBe('keep-me');
    expect(Txn.fromParsedBlock({ ...block, uid: 'own' }, prev).uid).toBe('own');
  });
});

describe('Txn.fromTemplate', () => {
  const tmpl: TemplateDraft = {
    payee: 'Groceries',
    status: 'none',
    postings: [
      {
        account: 'Assets:USD',
        amount: '100',
        currency: 'USD',
        cost: { amount: '90', currency: 'EUR' },
      },
      { account: 'Assets:EUR', amount: '-90', currency: 'EUR' },
    ],
  };

  it('hydrates a date-less template and carries cost', () => {
    const t = Txn.fromTemplate(tmpl, 'USD');
    expect(t.date).toBe('');
    expect(t.payee).toBe('Groceries');
    expect(t.postings[0].cost).toEqual({ amount: '90', currency: 'EUR' });
  });

  it('defaults a blank template posting currency', () => {
    const t = Txn.fromTemplate(
      { ...tmpl, postings: [{ account: 'A', amount: '1', currency: '' }] },
      'JPY'
    );
    expect(t.postings[0].currency).toBe('JPY');
  });
});

describe('Txn.fromJSON', () => {
  it('rebuilds a Txn from a parsed wire object', () => {
    const t = Txn.fromJSON({
      date: '2024-03-03',
      payee: 'Wire',
      status: 'cleared',
      note: 'n',
      uid: 'w1',
      postings: [{ account: 'A', amount: '1', currency: 'USD' }],
    });
    expect(t).toBeInstanceOf(Txn);
    expect(t.uid).toBe('w1');
    expect(t.note).toBe('n');
    expect(t.postings[0].currency).toBe('USD');
  });

  it('treats a missing note/uid as empty/undefined', () => {
    const t = Txn.fromJSON({
      date: '2024-03-03',
      payee: 'Wire',
      status: 'none',
      postings: [],
    });
    expect(t.note).toBe('');
    expect(t.uid).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/transactions/model.test.ts`
Expected: FAIL — `Txn.fromParsedBlock is not a function`.

- [ ] **Step 3: Write minimal implementation**

```ts
// add imports at top of lib/transactions/model.ts
import type {
  Annotation,
  ParsedBlock,
  Transaction,
} from '@/lib/journal/parser';
import type { TemplateDraft } from '@/lib/templates/schema';

// add these static methods inside class Txn:
  static fromParsedBlock(
    block: Omit<ParsedBlock, 'unparsedLines'>,
    prev?: Txn
  ): Txn {
    return new Txn(
      block.date,
      block.payee,
      block.status,
      block.note ?? '',
      block.postings.map((p) => ({
        account: p.account,
        amount: p.amount,
        currency: p.currency,
        ...carry(p),
      })),
      block.uid ?? prev?.uid
    );
  }

  static fromTemplate(t: TemplateDraft, defaultCurrency: string): Txn {
    return new Txn(
      '',
      t.payee,
      t.status,
      t.note ?? '',
      t.postings.map((p) => ({
        account: p.account,
        amount: p.amount,
        currency: p.currency || defaultCurrency,
        ...carry(p),
      }))
    );
  }

  static fromJSON(j: unknown): Txn {
    const o = j as {
      date?: string;
      payee?: string;
      status?: TxnStatus;
      note?: string;
      uid?: string;
      postings?: Posting[];
    };
    return new Txn(
      o.date ?? '',
      o.payee ?? '',
      o.status ?? 'none',
      o.note ?? '',
      (o.postings ?? []).map((p) => ({
        account: p.account,
        amount: p.amount,
        currency: p.currency,
        ...carry(p),
      })),
      o.uid
    );
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/transactions/model.test.ts`
Expected: PASS (all Task 1 + Task 2 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/transactions/model.ts lib/transactions/model.test.ts
git commit -m "feat(model): add Txn.fromParsedBlock/fromTemplate/fromJSON (P1)"
```

### Task 3: immutable updates `withField` / `withPosting` / `addPosting` / `removePosting`

**Files:**
- Modify: `lib/transactions/model.ts`
- Test: `lib/transactions/model.test.ts`

**Interfaces:**
- Produces (all return a NEW `Txn`, original unchanged):
  - `withField(field: 'date' | 'payee' | 'status' | 'note', value: string): Txn`
  - `withPosting(index: number, patch: Partial<Posting>): Txn`
  - `addPosting(currency: string): Txn`
  - `removePosting(index: number): Txn` — no-op when `postings.length <= 2`.

- [ ] **Step 1: Write the failing test**

```ts
// append to lib/transactions/model.test.ts
describe('Txn immutable updates', () => {
  const base = () =>
    new Txn('2024-01-01', 'P', 'none', '', [
      { account: 'A', amount: '1', currency: 'USD' },
      { account: 'B', amount: '-1', currency: 'USD' },
    ]);

  it('withField returns a new instance and does not mutate', () => {
    const a = base();
    const b = a.withField('payee', 'Changed');
    expect(b.payee).toBe('Changed');
    expect(a.payee).toBe('P');
    expect(b).not.toBe(a);
  });

  it('withPosting patches one posting only', () => {
    const b = base().withPosting(1, { amount: '-2' });
    expect(b.postings[1].amount).toBe('-2');
    expect(b.postings[0].amount).toBe('1');
  });

  it('addPosting appends a blank posting in the given currency', () => {
    const b = base().addPosting('EUR');
    expect(b.postings).toHaveLength(3);
    expect(b.postings[2]).toEqual({ account: '', amount: '', currency: 'EUR' });
  });

  it('removePosting deletes by index above the two-row floor', () => {
    const b = base().addPosting('USD').removePosting(0);
    expect(b.postings).toHaveLength(2);
    expect(b.postings[0].account).toBe('B');
  });

  it('removePosting is a no-op at two postings', () => {
    const a = base();
    expect(a.removePosting(0)).toBe(a);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/transactions/model.test.ts`
Expected: FAIL — `a.withField is not a function`.

- [ ] **Step 3: Write minimal implementation**

```ts
// add instance methods inside class Txn:
  withField(
    field: 'date' | 'payee' | 'status' | 'note',
    value: string
  ): Txn {
    return new Txn(
      field === 'date' ? value : this.date,
      field === 'payee' ? value : this.payee,
      field === 'status' ? (value as TxnStatus) : this.status,
      field === 'note' ? value : this.note,
      this.postings,
      this.uid
    );
  }

  withPosting(index: number, patch: Partial<Posting>): Txn {
    return this.replacePostings(
      this.postings.map((p, i) => (i === index ? { ...p, ...patch } : p))
    );
  }

  addPosting(currency: string): Txn {
    return this.replacePostings([
      ...this.postings,
      { account: '', amount: '', currency },
    ]);
  }

  removePosting(index: number): Txn {
    if (this.postings.length <= 2) return this;
    return this.replacePostings(this.postings.filter((_, i) => i !== index));
  }

  private replacePostings(postings: readonly Posting[]): Txn {
    return new Txn(
      this.date,
      this.payee,
      this.status,
      this.note,
      postings,
      this.uid
    );
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/transactions/model.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/transactions/model.ts lib/transactions/model.test.ts
git commit -m "feat(model): add immutable with*/add*/removePosting updates (P1)"
```

### Task 4: outputs `toWire` / `toSubmit` / `toTemplate`

**Files:**
- Modify: `lib/transactions/model.ts`
- Test: `lib/transactions/model.test.ts`

**Interfaces:**
- Consumes: `TransactionDraft` from `@/lib/transactions/schema` (type-only).
- Produces:
  - `type TxnJSON = { date: string; payee: string; status: TxnStatus; note?: string; uid?: string; postings: Posting[] }`
  - `toWire(mode: 'create' | 'edit'): TxnJSON` — trims all string fields and posting annotation fields; `note`→`undefined` when blank; `uid` only in `'edit'`. Replaces `serializeDraftJson` (callers `JSON.stringify(t.toWire(mode))`).
  - `toSubmit(): TransactionDraft` — same trimmed shape typed as the submit DTO (includes `date`+`uid`).
  - `toTemplate(): TemplateDraft` — trims; `payee` blank→`'—'`; omits `date`/`uid`.

- [ ] **Step 1: Write the failing test**

```ts
// append to lib/transactions/model.test.ts
describe('Txn outputs', () => {
  const t = () =>
    new Txn(
      '2024-01-15',
      '  Coffee  ',
      'cleared',
      '  hi  ',
      [
        {
          account: '  Assets:USD  ',
          amount: ' 100 ',
          currency: ' USD ',
          cost: { amount: ' 90 ', currency: ' EUR ' },
        },
        { account: 'Assets:EUR', amount: '-90', currency: 'EUR' },
      ],
      'u9'
    );

  it('toWire trims, drops blank note, and keeps uid only in edit mode', () => {
    expect(t().toWire('edit').uid).toBe('u9');
    expect(t().toWire('create').uid).toBeUndefined();
    const w = t().toWire('edit');
    expect(w.payee).toBe('Coffee');
    expect(w.note).toBe('hi');
    expect(w.postings[0]).toEqual({
      account: 'Assets:USD',
      amount: '100',
      currency: 'USD',
      cost: { amount: '90', currency: 'EUR' },
    });
    expect(
      new Txn('2024-01-15', 'P', 'none', '   ', []).toWire('create').note
    ).toBeUndefined();
  });

  it('toSubmit produces the trimmed submit DTO with date and uid', () => {
    const s = t().toSubmit();
    expect(s.date).toBe('2024-01-15');
    expect(s.uid).toBe('u9');
    expect(s.postings[0].cost).toEqual({ amount: '90', currency: 'EUR' });
  });

  it('toTemplate omits date/uid, trims, and defaults blank payee to dash', () => {
    const tpl = t().toTemplate();
    expect('date' in tpl).toBe(false);
    expect('uid' in tpl).toBe(false);
    expect(tpl.payee).toBe('Coffee');
    expect(tpl.postings[0].cost).toEqual({ amount: '90', currency: 'EUR' });
    expect(
      new Txn('', '   ', 'none', '', [
        { account: 'A', amount: '1', currency: 'USD' },
        { account: 'B', amount: '-1', currency: 'USD' },
      ]).toTemplate().payee
    ).toBe('—');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/transactions/model.test.ts`
Expected: FAIL — `t(...).toWire is not a function`.

- [ ] **Step 3: Write minimal implementation**

```ts
// add import at top:
import type { TransactionDraft } from '@/lib/transactions/schema';

// add type near the other exports:
export type TxnJSON = {
  date: string;
  payee: string;
  status: TxnStatus;
  note?: string;
  uid?: string;
  postings: Posting[];
};

// add a private trim helper + the three outputs inside class Txn:
  private trimmedPostings(): Posting[] {
    return this.postings.map((p) => ({
      account: p.account.trim(),
      amount: p.amount.trim(),
      currency: p.currency.trim(),
      ...(p.cost
        ? { cost: { amount: p.cost.amount.trim(), currency: p.cost.currency.trim() } }
        : {}),
      ...(p.assertion
        ? {
            assertion: {
              amount: p.assertion.amount.trim(),
              currency: p.assertion.currency.trim(),
            },
          }
        : {}),
    }));
  }

  toWire(mode: 'create' | 'edit'): TxnJSON {
    return {
      date: this.date,
      payee: this.payee.trim(),
      status: this.status,
      note: this.note.trim() || undefined,
      uid: mode === 'edit' ? this.uid : undefined,
      postings: this.trimmedPostings(),
    };
  }

  toSubmit(): TransactionDraft {
    return {
      date: this.date,
      payee: this.payee.trim(),
      status: this.status,
      note: this.note.trim() || undefined,
      uid: this.uid,
      postings: this.trimmedPostings(),
    } as TransactionDraft;
  }

  toTemplate(): TemplateDraft {
    return {
      payee: this.payee.trim() || '—',
      status: this.status,
      note: this.note.trim() || undefined,
      postings: this.trimmedPostings(),
    } as TemplateDraft;
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/transactions/model.test.ts`
Expected: PASS.

- [ ] **Step 5: Full green gate + commit**

Run: `npx vitest run && npx tsc --noEmit && npx eslint lib/transactions/model.ts lib/transactions/model.test.ts`
Expected: all pass; suite still 872+ green.

```bash
git add lib/transactions/model.ts lib/transactions/model.test.ts
git commit -m "feat(model): add Txn.toWire/toSubmit/toTemplate outputs (P1)"
```

### Task 5: open the P1 PR

- [ ] **Step 1:** `git push -u origin refactor/txn-model-consolidation`
- [ ] **Step 2:** Open PR titled `refactor(model): introduce canonical Txn model (P1)`, body summarizing the spec, noting it wires nothing yet and supersedes G3 / folds in A4 across later phases. Link the spec doc.

---

## Phases 2–4 — roadmap (expand just-in-time)

> These phases modify existing behavior and their exact edits depend on P1's realized API. Expand each into full bite-sized TDD steps **after the prior phase merges**, using the existing suite as the regression net. Each is its own PR.

### Phase 2 — the class becomes the reducer state

**Files:** `features/transactions/entry/draftReducer.ts` (rewrite around `Txn`); the ~26 consumers of `DraftState`/`DraftPosting`/`dispatch` (entry lenses `FormLens`/`RawLens`/`LedgerEditor`, `TransactionEntry.tsx`, `typeForms/*`, `types/*`, `balance.ts`, `rawLensLogic.ts`).

**Procedure:**
1. Replace `DraftState`/`DraftPosting` with `Txn`/`Posting`; re-export aliases (`export type DraftState = Txn`) temporarily to shrink the diff, remove in P4.
2. `draftReducer(state: Txn, action)` delegates: `setField→withField`, `setPosting→withPosting`, `addPosting→addPosting`, `removePosting→removePosting`, `replaceAll→action.state`.
3. `initDraft(...)`→`Txn.empty`/`Txn.from*` at call sites; delete `initDraft`/`emptyPostings`.
4. `serializeDraftJson(state, mode)`→`JSON.stringify(state.toWire(mode))` at `TransactionEntry.tsx`; delete `serializeDraftJson`.
5. Fix construction sites in `types/*`/`typeForms/*` that build draft literals → `Txn` constructors or `state.with*` chains. Keep domain logic.
6. Consumers reading `draft.note` already see a `string` (unchanged). Verify no in-place `postings` mutation (array is `readonly`); convert any to `withPosting`/`replacePostings`.

**Gate:** existing suite green; `tsc --noEmit`; `eslint`. **PR:** `refactor(entry): make Txn the reducer state (P2)`.

### Phase 3 — replace the six converters (closes A4)

**Files/deletes:** `transactionToDraft.ts`, `parsedBlockToDraft.ts`, `draftToTemplateDraft.ts`, `carryAnnotations.util.ts`; `transactionRow.ts` (`toTemplateDraft`→`Txn`); `EditTransaction.tsx`, `NewTransaction.tsx`, `RawLens.tsx`/`rawLensLogic.ts`, `RowActions.tsx`, `pageTransactions.ts`.

**Procedure (each edge, TDD against existing tests):**
- `EditTransaction`: `transactionToDraft(tx, cur)` → `Txn.fromTransaction(tx, cur)`.
- Raw lens: `parsedBlockToDraft(block, prev)` → `Txn.fromParsedBlock(block, prev)`.
- **`NewTransaction.tsx:44` inline template map → `Txn.fromTemplate(t.draft, cur)` — this closes A4** (add a regression test that a cost-carrying template hydrates with `cost` intact).
- Entry-form save-as-template: `draftToTemplateDraft(draft)` → `draft.toTemplate()`.
- Row save-as-template: `RowActions` builds a `Txn` from the row and calls `.toTemplate()`, retiring `transactionRow.ts`'s `toTemplateDraft`.
- Delete the four converter files + `carryAnnotations`; update imports.

**Gate:** existing suite green (+ the A4 regression test); `tsc`; `eslint`. Move the migrated converter tests' assertions into `model.test.ts` where not already covered. **PR:** `refactor(entry): route all conversions through Txn; close A4 (P3)`. Update REVIEW.md: mark **A4 ✅ DONE** and **G3 ✅ DONE (superseded by Txn consolidation)**.

### Phase 4 — collapse the posting declarations

**Files:** `lib/journal/parser.ts` (`ParsedPosting = Posting`), `lib/transactions/schema.ts` (posting shape references `Posting`), `transactionRow.ts` (row posting = `Posting`). Extract `Posting`/`Annotation` into a leaf `lib/transactions/posting.ts` if needed to avoid an import cycle (parser imports the leaf; `model.ts` imports the leaf + type-only parser types).

**Procedure:** point all four posting declarations at the single `Posting` type; remove the temporary `DraftState`/`DraftPosting` aliases from P2; delete any now-dead exports; confirm one declaration via `grep`.

**Gate:** full suite green; `tsc`; `eslint`. **PR:** `refactor(model): collapse posting declarations to one Posting type (P4)`.

---

## Self-Review

- **Spec coverage:** `Posting`+`Txn` (Tasks 1–4) ✓; constructors `from{Transaction,ParsedBlock,Template,JSON,empty}` ✓; updates `with*/add*/remove*` ✓; outputs `toWire/toSubmit/toTemplate` ✓; reducer-as-`Txn` (P2) ✓; converter replacement + A4 (P3) ✓; posting collapse + G3 (P4) ✓; non-goals (type-adapter layer, parser types, DTOs) respected — P2/P3 keep `types/*` as consumers and DTOs as `z.infer` ✓.
- **Placeholder scan:** P1 tasks contain complete code + exact commands. P2–P4 are intentionally roadmap-level (flagged, expand-after-merge) because their diffs depend on P1's realized API — the honest boundary given the ~26-file sweep; not silent TODOs.
- **Type consistency:** `Txn` constructor arg order `(date, payee, status, note, postings, uid?)` is identical across every `new Txn(...)` in tests and impl; `note: string`; `postings: readonly Posting[]`; `toWire` (not `toJSON`, per spec self-review) used consistently. `carry` helper name reused across constructors.
