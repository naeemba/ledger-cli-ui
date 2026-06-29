# Layered Transaction Entry — Phase 3: Type Engine (model extension + five adapters) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the pure, fully unit-tested type engine — an account-role classifier, a `TransactionType` adapter interface, and the five adapters (Expense, Income, Transfer, Exchange, Fix balance) — first extending the posting model so it can represent the `@@` total-cost and `= balance-assertion` shapes that Exchange and Fix balance require. No new UI in this phase; Phase 4 renders it.

**Architecture:** The shared draft posting (`DraftPosting`) and its parser/formatter/validator counterparts gain two optional fields — `cost` (renders ` @@ <cur> <amt>`) and `assertion` (renders ` = <cur> <amt>`). These thread through the parser (`parsePostingLine`), the formatter (`formatPosting`), the Zod validator (`transactionDraftSchema`), the balance calculator (`computeBalance`), the JSON serializer (`serializeDraftJson`), and the Raw-lens mapper (`parsedBlockToDraft`) so all three lenses round-trip the richer shapes losslessly and the existing server-action save path (which only ever calls `transactionDraftSchema` + `formatTransaction`) needs no changes. On top of that model, the type engine is added under `features/transactions/entry/types/`: a `TransactionTypeAdapter<F>` interface with `compile(fields, ctx) → DraftState` and `detect(draft) → fields | null`, five adapters implementing it, and an ordered registry with a `detectType(draft)` dispatcher.

**Tech Stack:** TypeScript, Zod, Vitest (`node` env), pnpm. Pure logic only — no React components, no `'use client'`, no `renderToStaticMarkup` in this phase.

## Global Constraints

- **Source of truth is the ledger file; type is never stored.** The engine *infers* type from posting shape via `detect()`; nothing type-related is written to the journal. The only new persisted bytes are standard ledger `@@` cost and `=` assertion annotations.
- **Pure phase, no UI.** Every file created here is plain `.ts` with unit tests. Do NOT add React components, type forms, or a "Types" tab — that is Phase 4. Do NOT register a new tab in `TransactionEntry`.
- **The posting model is extended, not replaced.** `DraftPosting`/`ParsedPosting`/`PostingDraft` keep `{ account, amount, currency }` and gain `cost?: { amount, currency }` and `assertion?: { amount, currency }` — both optional, both absent on every existing posting so all current behavior is unchanged.
- **Standard five roots only.** `classifyAccount` recognizes `Assets`, `Liabilities`, `Income`, `Expenses`, `Equity`; everything else is `'unknown'`. Non-standard journals fall back to Form/Raw (their adapters' `detect` returns `null`) — that is correct, not a bug.
- **Confirmed ledger semantics (do not re-litigate):** Exchange `<into> <gotCur> <gotAmt> @@ <gaveCur> <gaveAmt>` + `<from> -<gaveCur> <gaveAmt>` balances on the cost currency. Fix balance `<account> = <cur> <amt>` (no posting amount) + bare `Equity:Adjustments` makes `ledger` book the difference into `Equity:Adjustments` and the assertion holds. Both were verified against the real `ledger` CLI.
- **Follow the existing test pattern.** Vitest `node` environment. Run one file with `pnpm vitest run <path>`; the full suite with `pnpm test`; type-check with `pnpm type-check`.
- **Package manager is pnpm.**
- **No attribution lines** in commit messages (no "Generated with" / `Co-Authored-By` trailers).

---

## File Structure

**Model extension (modify existing):**
- `lib/journal/parser.ts` — extend `ParsedPosting` type; restructure `parsePostingLine` to parse `@@` cost and bare `=` assertion postings.
- `features/transactions/entry/draftReducer.ts` — add `DraftCost`/`DraftAssertion` types; add optional `cost`/`assertion` to `DraftPosting`; extend `serializeDraftJson` to carry them.
- `features/transactions/entry/parsedBlockToDraft.ts` — copy `cost`/`assertion` through from the parsed block.
- `lib/transactions/schema.ts` — add optional `cost`/`assertion` to `postingSchema`; teach `superRefine` to exclude assertion-only postings from the blank/sum checks and to balance cost postings on the cost currency; extend `formatPosting` to emit `@@` and `=`.
- `features/transactions/entry/balance.ts` — extend `computeBalance` to exclude assertion-only postings and balance cost postings on the cost currency.

**Type engine (new, all under `features/transactions/entry/types/`):**
- `accountRole.ts` — `AccountRole`, `classifyAccount`, `accountsForRole`.
- `amount.ts` — `negateAmount`, `absAmount` pure string helpers.
- `adapter.ts` — `TypeContext`, `HeaderFields`, `TransactionTypeAdapter<F>` interface, the shared `headerOf`/`draftFromHeader` helpers.
- `expense.ts`, `income.ts`, `transfer.ts`, `exchange.ts`, `fixBalance.ts` — the five adapters.
- `registry.ts` — `TYPE_ADAPTERS` ordered list + `detectType(draft)` dispatcher.

Reference (current shapes, from research):
- `DraftPosting = { account: string; amount: string; currency: string }` (`features/transactions/entry/draftReducer.ts:1`).
- `ParsedPosting = { account: string; amount: string; currency: string }` (`lib/journal/parser.ts:23`); `parsePostingLine` at `:36`; `parseAmtCur`-style logic uses `isAmount`/`stripCommas` helpers at `:33-34`.
- `formatPosting` at `lib/transactions/schema.ts:~135`; `transactionDraftSchema.superRefine` blank/sum logic at `:~95-122`; `postingSchema` at `:~70`.
- `computeBalance(postings) → Balance` at `features/transactions/entry/balance.ts:10`.
- Server save path: `createTransaction.ts:25` / `updateTransaction.ts:32` `JSON.parse` the hidden `draft` input then call `journalService.addTransaction(userId, parsed)`, which validates via `transactionDraftSchema` and formats via `formatTransaction`. **No action/service edits are required** — the model-extension tasks make the save path carry cost/assertion end to end.

---

## Task 1: Extend the parser to read `@@` cost and `=` assertion postings

**Files:**
- Modify: `lib/journal/parser.ts` (`ParsedPosting` type at `:23`; `parsePostingLine` at `:36-60`)
- Test: `lib/journal/parser.test.ts` (add cases; keep all existing cases passing)

**Interfaces:**
- Consumes: existing `isAmount`, `stripCommas`, `POSTING_BARE_REGEX`.
- Produces:
  - `type ParsedPosting = { account: string; amount: string; currency: string; cost?: { amount: string; currency: string }; assertion?: { amount: string; currency: string } }`
  - `parsePostingLine(line: string): ParsedPosting | null` — now also returns `cost` for `... AMT CUR @@ AMT CUR` lines and `assertion` (with `amount: ''`, `currency: ''`) for bare `... = AMT CUR` lines.

- [ ] **Step 1: Write failing tests**

Add to `lib/journal/parser.test.ts` (import `parsePostingLine` if not already imported):

```ts
describe('parsePostingLine — cost and assertion', () => {
  it('parses a total-cost (@@) posting', () => {
    expect(parsePostingLine('    Assets:EUR-Wallet   EUR 92 @@ $ 100')).toEqual({
      account: 'Assets:EUR-Wallet',
      amount: '92',
      currency: 'EUR',
      cost: { amount: '100', currency: '$' },
    });
  });
  it('parses a bare balance-assertion posting (no amount)', () => {
    expect(parsePostingLine('    Assets:Checking   = $ 1234.56')).toEqual({
      account: 'Assets:Checking',
      amount: '',
      currency: '',
      assertion: { amount: '1234.56', currency: '$' },
    });
  });
  it('still parses a plain amount posting with no cost/assertion', () => {
    expect(parsePostingLine('    Expenses:Groceries   USD 42.50')).toEqual({
      account: 'Expenses:Groceries',
      amount: '42.50',
      currency: 'USD',
    });
  });
  it('still parses a bare posting (no amount at all)', () => {
    expect(parsePostingLine('    Equity:Adjustments')).toEqual({
      account: 'Equity:Adjustments',
      amount: '',
      currency: '',
    });
  });
  it('returns null when the cost side is malformed', () => {
    expect(parsePostingLine('    Assets:EUR-Wallet   EUR 92 @@ garbage')).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run lib/journal/parser.test.ts`
Expected: FAIL — the cost/assertion cases throw or mismatch (no `cost`/`assertion` keys yet).

- [ ] **Step 3: Extend the type and rewrite `parsePostingLine`**

In `lib/journal/parser.ts`, replace the `ParsedPosting` type (`:23-27`) with:

```ts
export type ParsedPosting = {
  account: string;
  amount: string;
  currency: string;
  cost?: { amount: string; currency: string };
  assertion?: { amount: string; currency: string };
};
```

Then replace `parsePostingLine` (`:36-60`) and add the two helpers above it:

```ts
const splitAccountRest = (
  line: string
): { account: string; rest: string } | null => {
  const m = line.match(/^\s+([^\t;]+?)(?:\s{2,}|\t+)(\S.*?)\s*$/);
  if (!m) return null;
  return { account: m[1].trim(), rest: m[2].trim() };
};

const parseAmtCur = (
  s: string
): { amount: string; currency: string } | null => {
  const parts = s.trim().split(/\s+/);
  if (parts.length !== 2) return null;
  const [first, second] = parts;
  if (isAmount(first) && !isAmount(second)) {
    return { amount: stripCommas(first), currency: second };
  }
  if (!isAmount(first) && isAmount(second)) {
    return { amount: stripCommas(second), currency: first };
  }
  return null;
};

export const parsePostingLine = (line: string): ParsedPosting | null => {
  const split = splitAccountRest(line);
  if (split) {
    const { account, rest } = split;

    // Bare assertion: "= AMT CUR" (no posting amount).
    if (rest.startsWith('=')) {
      const assertion = parseAmtCur(rest.slice(1).trim());
      if (!assertion) return null;
      return { account, amount: '', currency: '', assertion };
    }

    // Total-cost annotation: "AMT CUR @@ AMT CUR".
    const atAt = rest.split('@@');
    if (atAt.length === 2) {
      const main = parseAmtCur(atAt[0].trim());
      const cost = parseAmtCur(atAt[1].trim());
      if (!main || !cost) return null;
      return { account, amount: main.amount, currency: main.currency, cost };
    }
    if (atAt.length > 2) return null;

    // Plain amount posting.
    const main = parseAmtCur(rest);
    if (!main) return null;
    return { account, amount: main.amount, currency: main.currency };
  }

  const bareMatch = line.match(POSTING_BARE_REGEX);
  if (bareMatch) {
    return { account: bareMatch[1].trim(), amount: '', currency: '' };
  }
  return null;
};
```

Delete the now-unused `POSTING_AMOUNT_REGEX` constant (`:30-31`) if nothing else references it (`git grep POSTING_AMOUNT_REGEX` → only this file).

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run lib/journal/parser.test.ts`
Expected: PASS — new cost/assertion cases plus every pre-existing parser case.

- [ ] **Step 5: Commit**

```bash
git add lib/journal/parser.ts lib/journal/parser.test.ts
git commit -m "feat(journal): parse @@ cost and = assertion postings"
```

---

## Task 2: Extend the draft model and serializer to carry cost/assertion

**Files:**
- Modify: `features/transactions/entry/draftReducer.ts` (`DraftPosting` type; `serializeDraftJson`)
- Modify: `features/transactions/entry/parsedBlockToDraft.ts`
- Test: `features/transactions/entry/draftReducer.test.ts` (add serialize cases); `features/transactions/entry/parsedBlockToDraft.test.ts` (add carry-through case)

**Interfaces:**
- Consumes: `ParsedPosting` (Task 1).
- Produces:
  - `type DraftCost = { amount: string; currency: string }`
  - `type DraftAssertion = { amount: string; currency: string }`
  - `type DraftPosting = { account: string; amount: string; currency: string; cost?: DraftCost; assertion?: DraftAssertion }`
  - `serializeDraftJson(state, mode)` now emits `cost`/`assertion` keys only when present.
  - `parsedBlockToDraft(block, prev?)` now copies `cost`/`assertion` through.

- [ ] **Step 1: Write failing tests**

Add to `features/transactions/entry/draftReducer.test.ts`:

```ts
describe('serializeDraftJson — cost and assertion', () => {
  it('serializes a cost-bearing posting', () => {
    const json = JSON.parse(
      serializeDraftJson(
        {
          ...base,
          postings: [
            { account: 'Assets:EUR', amount: '92', currency: 'EUR', cost: { amount: '100', currency: 'USD' } },
            { account: 'Assets:Checking', amount: '-100', currency: 'USD' },
          ],
        },
        'create'
      )
    );
    expect(json.postings[0].cost).toEqual({ amount: '100', currency: 'USD' });
    expect(json.postings[1].cost).toBeUndefined();
  });
  it('serializes an assertion-bearing posting', () => {
    const json = JSON.parse(
      serializeDraftJson(
        {
          ...base,
          postings: [
            { account: 'Assets:Checking', amount: '', currency: '', assertion: { amount: '1234.56', currency: 'USD' } },
            { account: 'Equity:Adjustments', amount: '', currency: '' },
          ],
        },
        'create'
      )
    );
    expect(json.postings[0].assertion).toEqual({ amount: '1234.56', currency: 'USD' });
    expect(json.postings[1].assertion).toBeUndefined();
  });
});
```

Add to `features/transactions/entry/parsedBlockToDraft.test.ts`:

```ts
it('carries cost and assertion through from the parsed block', () => {
  const draft = parsedBlockToDraft({
    uid: null,
    date: '2026-06-29',
    status: 'none',
    payee: 'Currency exchange',
    note: null,
    postings: [
      { account: 'Assets:EUR', amount: '92', currency: 'EUR', cost: { amount: '100', currency: 'USD' } },
      { account: 'Assets:Checking', amount: '', currency: '', assertion: { amount: '5', currency: 'USD' } },
    ],
  });
  expect(draft.postings[0].cost).toEqual({ amount: '100', currency: 'USD' });
  expect(draft.postings[1].assertion).toEqual({ amount: '5', currency: 'USD' });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run features/transactions/entry/draftReducer.test.ts features/transactions/entry/parsedBlockToDraft.test.ts`
Expected: FAIL — `cost`/`assertion` are dropped (undefined) by the current serializer/mapper.

- [ ] **Step 3: Extend the types, serializer, and mapper**

In `features/transactions/entry/draftReducer.ts`, replace the `DraftPosting` type (`:1-5`) with:

```ts
export type DraftCost = { amount: string; currency: string };
export type DraftAssertion = { amount: string; currency: string };

export type DraftPosting = {
  account: string;
  amount: string;
  currency: string;
  cost?: DraftCost;
  assertion?: DraftAssertion;
};
```

Replace the `postings` mapping inside `serializeDraftJson` with:

```ts
    postings: state.postings.map((p) => ({
      account: p.account.trim(),
      amount: p.amount.trim(),
      currency: p.currency.trim(),
      ...(p.cost
        ? { cost: { amount: p.cost.amount.trim(), currency: p.cost.currency.trim() } }
        : {}),
      ...(p.assertion
        ? { assertion: { amount: p.assertion.amount.trim(), currency: p.assertion.currency.trim() } }
        : {}),
    })),
```

In `features/transactions/entry/parsedBlockToDraft.ts`, replace the `postings` mapping with:

```ts
  postings: block.postings.map((p) => ({
    account: p.account,
    amount: p.amount,
    currency: p.currency,
    ...(p.cost ? { cost: p.cost } : {}),
    ...(p.assertion ? { assertion: p.assertion } : {}),
  })),
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run features/transactions/entry/draftReducer.test.ts features/transactions/entry/parsedBlockToDraft.test.ts`
Expected: PASS.

- [ ] **Step 5: Type-check**

Run: `pnpm type-check`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add features/transactions/entry/draftReducer.ts features/transactions/entry/draftReducer.test.ts features/transactions/entry/parsedBlockToDraft.ts features/transactions/entry/parsedBlockToDraft.test.ts
git commit -m "feat(transactions): carry cost/assertion through draft model"
```

---

## Task 3: Validate and format cost/assertion postings

**Files:**
- Modify: `lib/transactions/schema.ts` (`postingSchema`; `transactionDraftSchema.superRefine`; `formatPosting`)
- Test: `lib/transactions/schema.test.ts` (add validation + format cases)

**Interfaces:**
- Consumes: existing `amountSchema`, `currencySchema`, `ACCOUNT_COLUMN`.
- Produces:
  - `postingSchema` accepts optional `cost`/`assertion` objects.
  - `transactionDraftSchema` accepts an Exchange (cost balances on cost currency) and a Fix balance (assertion-only posting excluded from blank count) as **valid**.
  - `formatTransaction`/`formatPosting` emit `<cur> <amt> @@ <cur> <amt>` and bare `<account>  = <cur> <amt>`.

- [ ] **Step 1: Write failing tests**

Add to `lib/transactions/schema.test.ts` (import `transactionDraftSchema`, `formatTransaction`):

```ts
describe('transactionDraftSchema — cost and assertion', () => {
  it('accepts an exchange transaction that balances on the cost currency', () => {
    const result = transactionDraftSchema.safeParse({
      date: '2026-06-29',
      payee: 'Currency exchange',
      status: 'none',
      postings: [
        { account: 'Assets:EUR', amount: '92', currency: 'EUR', cost: { amount: '100', currency: 'USD' } },
        { account: 'Assets:Checking', amount: '-100', currency: 'USD' },
      ],
    });
    expect(result.success).toBe(true);
  });
  it('accepts a fix-balance transaction (assertion + blank equity)', () => {
    const result = transactionDraftSchema.safeParse({
      date: '2026-06-29',
      payee: 'Balance adjustment',
      status: 'none',
      postings: [
        { account: 'Assets:Checking', amount: '', currency: '', assertion: { amount: '1234.56', currency: 'USD' } },
        { account: 'Equity:Adjustments', amount: '', currency: '' },
      ],
    });
    expect(result.success).toBe(true);
  });
});

describe('formatTransaction — cost and assertion', () => {
  it('emits @@ for a cost posting', () => {
    const out = formatTransaction({
      date: '2026-06-29',
      payee: 'Currency exchange',
      status: 'none',
      postings: [
        { account: 'Assets:EUR', amount: '92', currency: 'EUR', cost: { amount: '100', currency: 'USD' } },
        { account: 'Assets:Checking', amount: '-100', currency: 'USD' },
      ],
    } as never);
    expect(out).toContain('EUR 92 @@ USD 100');
  });
  it('emits a bare = assertion line for a fix-balance posting', () => {
    const out = formatTransaction({
      date: '2026-06-29',
      payee: 'Balance adjustment',
      status: 'none',
      postings: [
        { account: 'Assets:Checking', amount: '', currency: '', assertion: { amount: '1234.56', currency: 'USD' } },
        { account: 'Equity:Adjustments', amount: '', currency: '' },
      ],
    } as never);
    expect(out).toMatch(/Assets:Checking\s+= USD 1234\.56/);
    expect(out).toMatch(/\n {4}Equity:Adjustments$/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run lib/transactions/schema.test.ts`
Expected: FAIL — exchange/fix-balance rejected by `superRefine`; `@@`/`=` not emitted.

- [ ] **Step 3: Extend `postingSchema`, `superRefine`, and `formatPosting`**

In `lib/transactions/schema.ts`, add a required-amount sub-schema and the cost/assertion object schemas near the other field schemas:

```ts
const annotationAmountSchema = z
  .string()
  .trim()
  .regex(/^-?\d+(\.\d+)?$/, 'Amount must be a number');

const annotationSchema = z
  .object({ amount: annotationAmountSchema, currency: currencySchema.refine((s) => s.trim() !== '', 'Currency is required') })
  .optional();
```

Extend `postingSchema` to include the two optional fields (add inside the `z.object({...})`):

```ts
    cost: annotationSchema,
    assertion: annotationSchema,
```

Rewrite the `superRefine` body to exclude assertion-only postings from blank/sum and to balance cost postings on the cost currency:

```ts
  .superRefine((draft, ctx) => {
    // Assertion-only postings (no amount) check a balance; they do not
    // participate in the transaction's own balancing.
    const active = draft.postings.filter(
      (p) => !(p.assertion && p.amount === '')
    );
    const blanks = active.filter((p) => p.amount === '').length;
    if (blanks > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Only one posting may have a blank amount (auto-balance)',
        path: ['postings'],
      });
      return;
    }
    if (blanks === 1) return; // ledger will balance the blank line

    const byCurrency = new Map<string, number>();
    for (const p of active) {
      if (p.cost) {
        const cost = Number(p.cost.amount);
        if (!Number.isFinite(cost)) return;
        const sign = Number(p.amount) < 0 ? -1 : 1;
        byCurrency.set(p.cost.currency, (byCurrency.get(p.cost.currency) ?? 0) + sign * cost);
      } else {
        const value = Number(p.amount);
        if (!Number.isFinite(value)) return;
        byCurrency.set(p.currency, (byCurrency.get(p.currency) ?? 0) + value);
      }
    }
    for (const [currency, total] of byCurrency) {
      if (Math.abs(total) > 1e-9) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Postings in ${currency} do not balance (sum = ${total})`,
          path: ['postings'],
        });
      }
    }
  });
```

Replace `formatPosting` with the cost/assertion-aware version:

```ts
const formatPosting = (p: PostingDraft): string => {
  const indent = '    ';
  const pad = (account: string) =>
    ' '.repeat(Math.max(2, ACCOUNT_COLUMN - indent.length - account.length));

  if (p.assertion && p.amount === '') {
    const value = `= ${p.assertion.currency} ${p.assertion.amount}`;
    return `${indent}${p.account}${pad(p.account)}${value}`;
  }
  if (p.amount === '') return `${indent}${p.account}`;
  let value = `${p.currency} ${p.amount}`;
  if (p.cost) value += ` @@ ${p.cost.currency} ${p.cost.amount}`;
  return `${indent}${p.account}${pad(p.account)}${value}`;
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run lib/transactions/schema.test.ts`
Expected: PASS — new cost/assertion cases plus every pre-existing schema case.

- [ ] **Step 5: Commit**

```bash
git add lib/transactions/schema.ts lib/transactions/schema.test.ts
git commit -m "feat(transactions): validate and format cost/assertion postings"
```

---

## Task 4: Teach `computeBalance` about cost and assertion

**Files:**
- Modify: `features/transactions/entry/balance.ts`
- Test: `features/transactions/entry/balance.test.ts`

**Interfaces:**
- Consumes: `DraftPosting` (Task 2).
- Produces: `computeBalance(postings)` returns `{ kind: 'balanced' }` for a cost-balanced exchange and `{ kind: 'auto-balance' }` for a fix-balance (assertion posting excluded; lone equity blank auto-balances).

- [ ] **Step 1: Write failing tests**

Add to `features/transactions/entry/balance.test.ts`:

```ts
describe('computeBalance — cost and assertion', () => {
  it('treats a cost posting as balancing on its cost currency', () => {
    expect(
      computeBalance([
        { account: 'Assets:EUR', amount: '92', currency: 'EUR', cost: { amount: '100', currency: 'USD' } },
        { account: 'Assets:Checking', amount: '-100', currency: 'USD' },
      ])
    ).toEqual({ kind: 'balanced' });
  });
  it('excludes an assertion-only posting and auto-balances the lone blank', () => {
    expect(
      computeBalance([
        { account: 'Assets:Checking', amount: '', currency: '', assertion: { amount: '1234.56', currency: 'USD' } },
        { account: 'Equity:Adjustments', amount: '', currency: '' },
      ])
    ).toEqual({ kind: 'auto-balance' });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run features/transactions/entry/balance.test.ts`
Expected: FAIL — exchange reports `unbalanced` (EUR side), fix-balance reports `too-many-blanks`.

- [ ] **Step 3: Extend `computeBalance`**

Replace the body of `computeBalance` in `features/transactions/entry/balance.ts` with:

```ts
export const computeBalance = (postings: DraftPosting[]): Balance => {
  // Assertion-only postings check a balance; they don't participate in balancing.
  const active = postings.filter((p) => !(p.assertion && p.amount.trim() === ''));
  const blanks = active.filter((p) => p.amount.trim() === '').length;
  if (blanks > 1) return { kind: 'too-many-blanks' };
  if (blanks === 1) return { kind: 'auto-balance' };
  const byCurrency = new Map<string, number>();
  for (const p of active) {
    if (p.cost) {
      const cost = Number(p.cost.amount);
      if (!Number.isFinite(cost)) return { kind: 'invalid' };
      const sign = Number(p.amount) < 0 ? -1 : 1;
      byCurrency.set(p.cost.currency, (byCurrency.get(p.cost.currency) ?? 0) + sign * cost);
    } else {
      const value = Number(p.amount);
      if (!Number.isFinite(value)) return { kind: 'invalid' };
      byCurrency.set(p.currency, (byCurrency.get(p.currency) ?? 0) + value);
    }
  }
  const issues = [...byCurrency.entries()].filter(
    ([, total]) => Math.abs(total) > 1e-9
  );
  if (issues.length === 0) return { kind: 'balanced' };
  return { kind: 'unbalanced', issues };
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run features/transactions/entry/balance.test.ts`
Expected: PASS — new cases plus every pre-existing balance case.

- [ ] **Step 5: Commit**

```bash
git add features/transactions/entry/balance.ts features/transactions/entry/balance.test.ts
git commit -m "feat(transactions): balance cost/assertion postings"
```

---

## Task 5: Account-role classifier

**Files:**
- Create: `features/transactions/entry/types/accountRole.ts`
- Test: `features/transactions/entry/types/accountRole.test.ts`

**Interfaces:**
- Produces:
  - `type AccountRole = 'asset' | 'liability' | 'income' | 'expense' | 'equity' | 'unknown'`
  - `classifyAccount(account: string): AccountRole`
  - `accountsForRole(accounts: string[], role: AccountRole): string[]`

- [ ] **Step 1: Write failing tests**

```ts
// features/transactions/entry/types/accountRole.test.ts
import { describe, it, expect } from 'vitest';
import { classifyAccount, accountsForRole } from './accountRole';

describe('classifyAccount', () => {
  it('maps the five standard roots', () => {
    expect(classifyAccount('Assets:Checking')).toBe('asset');
    expect(classifyAccount('Liabilities:Visa')).toBe('liability');
    expect(classifyAccount('Income:Salary')).toBe('income');
    expect(classifyAccount('Expenses:Groceries')).toBe('expense');
    expect(classifyAccount('Equity:Adjustments')).toBe('equity');
  });
  it('classifies a bare root with no subaccount', () => {
    expect(classifyAccount('Assets')).toBe('asset');
  });
  it('returns unknown for non-standard roots', () => {
    expect(classifyAccount('Funny:Money')).toBe('unknown');
    expect(classifyAccount('')).toBe('unknown');
  });
});

describe('accountsForRole', () => {
  it('filters accounts by role', () => {
    const accounts = ['Assets:Checking', 'Assets:Savings', 'Expenses:Food', 'Income:Salary'];
    expect(accountsForRole(accounts, 'asset')).toEqual(['Assets:Checking', 'Assets:Savings']);
    expect(accountsForRole(accounts, 'expense')).toEqual(['Expenses:Food']);
    expect(accountsForRole(accounts, 'equity')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run features/transactions/entry/types/accountRole.test.ts`
Expected: FAIL — cannot resolve `./accountRole`.

- [ ] **Step 3: Implement the classifier**

```ts
// features/transactions/entry/types/accountRole.ts
export type AccountRole =
  | 'asset'
  | 'liability'
  | 'income'
  | 'expense'
  | 'equity'
  | 'unknown';

const ROOT_TO_ROLE: Record<string, AccountRole> = {
  Assets: 'asset',
  Liabilities: 'liability',
  Income: 'income',
  Expenses: 'expense',
  Equity: 'equity',
};

export const classifyAccount = (account: string): AccountRole => {
  const root = account.split(':')[0]?.trim() ?? '';
  return ROOT_TO_ROLE[root] ?? 'unknown';
};

export const accountsForRole = (
  accounts: string[],
  role: AccountRole
): string[] => accounts.filter((a) => classifyAccount(a) === role);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run features/transactions/entry/types/accountRole.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add features/transactions/entry/types/accountRole.ts features/transactions/entry/types/accountRole.test.ts
git commit -m "feat(transactions): account-role classifier for type engine"
```

---

## Task 6: Adapter interface and shared helpers

**Files:**
- Create: `features/transactions/entry/types/amount.ts`
- Create: `features/transactions/entry/types/adapter.ts`
- Test: `features/transactions/entry/types/amount.test.ts`

**Interfaces:**
- Consumes: `DraftState`, `DraftStatus`, `DraftPosting` (Task 2).
- Produces:
  - `negateAmount(amount: string): string`, `absAmount(amount: string): string`
  - `type TypeContext = { defaultCurrency: string }`
  - `type HeaderFields = { date: string; payee: string; status: DraftStatus; note: string; uid?: string }`
  - `type TransactionTypeAdapter<F> = { id: string; label: string; icon: string; emptyFields: (ctx: TypeContext) => F; compile: (fields: F, ctx: TypeContext) => DraftState; detect: (draft: DraftState) => F | null }`
  - `headerOf(draft: DraftState): HeaderFields`
  - `draftFromHeader(header: HeaderFields, postings: DraftPosting[]): DraftState`

Note: `HeaderFields` carries `uid` (and `status`) as non-rendered carry fields so `detect → edit → compile` preserves transaction identity and status across the Type lens. Phase 4 forms render only the type-specific fields; the header fields are threaded through untouched.

- [ ] **Step 1: Write failing tests for the amount helpers**

```ts
// features/transactions/entry/types/amount.test.ts
import { describe, it, expect } from 'vitest';
import { negateAmount, absAmount } from './amount';

describe('negateAmount', () => {
  it('prepends a minus to a positive amount', () => {
    expect(negateAmount('42.50')).toBe('-42.50');
  });
  it('strips the minus from a negative amount', () => {
    expect(negateAmount('-42.50')).toBe('42.50');
  });
  it('leaves empty and zero untouched', () => {
    expect(negateAmount('')).toBe('');
    expect(negateAmount('0')).toBe('0');
  });
});

describe('absAmount', () => {
  it('drops a leading minus', () => {
    expect(absAmount('-42.50')).toBe('42.50');
  });
  it('leaves a positive amount untouched', () => {
    expect(absAmount('42.50')).toBe('42.50');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run features/transactions/entry/types/amount.test.ts`
Expected: FAIL — cannot resolve `./amount`.

- [ ] **Step 3: Implement the helpers and the interface module**

```ts
// features/transactions/entry/types/amount.ts
export const negateAmount = (amount: string): string => {
  const t = amount.trim();
  if (t === '' || Number(t) === 0) return t;
  return t.startsWith('-') ? t.slice(1) : `-${t}`;
};

export const absAmount = (amount: string): string => {
  const t = amount.trim();
  return t.startsWith('-') ? t.slice(1) : t;
};
```

```ts
// features/transactions/entry/types/adapter.ts
import type { DraftState, DraftStatus, DraftPosting } from '../draftReducer';

export type TypeContext = { defaultCurrency: string };

export type HeaderFields = {
  date: string;
  payee: string;
  status: DraftStatus;
  note: string;
  uid?: string;
};

export type TransactionTypeAdapter<F> = {
  id: string;
  label: string;
  icon: string;
  emptyFields: (ctx: TypeContext) => F;
  compile: (fields: F, ctx: TypeContext) => DraftState;
  detect: (draft: DraftState) => F | null;
};

export const headerOf = (draft: DraftState): HeaderFields => ({
  date: draft.date,
  payee: draft.payee,
  status: draft.status,
  note: draft.note,
  uid: draft.uid,
});

export const draftFromHeader = (
  header: HeaderFields,
  postings: DraftPosting[]
): DraftState => ({
  date: header.date,
  payee: header.payee,
  status: header.status,
  note: header.note,
  uid: header.uid,
  postings,
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run features/transactions/entry/types/amount.test.ts`
Expected: PASS.

- [ ] **Step 5: Type-check**

Run: `pnpm type-check`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add features/transactions/entry/types/amount.ts features/transactions/entry/types/amount.test.ts features/transactions/entry/types/adapter.ts
git commit -m "feat(transactions): adapter interface and amount helpers"
```

---

## Task 7: Expense adapter

**Files:**
- Create: `features/transactions/entry/types/expense.ts`
- Test: `features/transactions/entry/types/expense.test.ts`

**Interfaces:**
- Consumes: `TransactionTypeAdapter`, `HeaderFields`, `TypeContext`, `headerOf`, `draftFromHeader` (Task 6); `negateAmount`, `absAmount` (Task 6); `classifyAccount` (Task 5); `DraftState` (Task 2).
- Produces:
  - `type ExpenseFields = HeaderFields & { amount: string; currency: string; paidFrom: string; spentOn: string }`
  - `const expenseAdapter: TransactionTypeAdapter<ExpenseFields>`

Compile rule: `spentOn` (expense) gets `+amount`; `paidFrom` (asset/liability) gets `-amount`; same currency.
Detect rule: exactly 2 postings, no cost/assertion, one role `expense` (positive amount) and one role `asset`|`liability` (negative amount), same currency, summing to zero. Otherwise `null`.

- [ ] **Step 1: Write failing tests**

```ts
// features/transactions/entry/types/expense.test.ts
import { describe, it, expect } from 'vitest';
import { expenseAdapter, type ExpenseFields } from './expense';

const ctx = { defaultCurrency: 'USD' };
const header = { date: '2026-06-29', payee: 'Whole Foods', status: 'none' as const, note: '' };

describe('expenseAdapter.compile', () => {
  it('builds a +expense / -asset pair', () => {
    const draft = expenseAdapter.compile(
      { ...header, amount: '42.50', currency: 'USD', paidFrom: 'Assets:Checking', spentOn: 'Expenses:Groceries' },
      ctx
    );
    expect(draft.postings).toEqual([
      { account: 'Expenses:Groceries', amount: '42.50', currency: 'USD' },
      { account: 'Assets:Checking', amount: '-42.50', currency: 'USD' },
    ]);
    expect(draft.payee).toBe('Whole Foods');
  });
});

describe('expenseAdapter.detect', () => {
  const draft = {
    date: '2026-06-29', payee: 'Whole Foods', status: 'none' as const, note: '',
    postings: [
      { account: 'Expenses:Groceries', amount: '42.50', currency: 'USD' },
      { account: 'Assets:Checking', amount: '-42.50', currency: 'USD' },
    ],
  };
  it('recognizes a clean asset->expense pair', () => {
    expect(expenseAdapter.detect(draft)).toEqual({
      date: '2026-06-29', payee: 'Whole Foods', status: 'none', note: '', uid: undefined,
      amount: '42.50', currency: 'USD', paidFrom: 'Assets:Checking', spentOn: 'Expenses:Groceries',
    });
  });
  it('round-trips compile -> detect', () => {
    const fields: ExpenseFields = { ...header, uid: undefined, amount: '12.00', currency: 'USD', paidFrom: 'Assets:Cash', spentOn: 'Expenses:Coffee' };
    expect(expenseAdapter.detect(expenseAdapter.compile(fields, ctx))).toEqual(fields);
  });
  it('rejects a 3-posting split', () => {
    expect(expenseAdapter.detect({ ...draft, postings: [...draft.postings, { account: 'Expenses:Tax', amount: '0', currency: 'USD' }] })).toBeNull();
  });
  it('rejects an asset->asset transfer', () => {
    expect(expenseAdapter.detect({ ...draft, postings: [
      { account: 'Assets:Savings', amount: '500', currency: 'USD' },
      { account: 'Assets:Checking', amount: '-500', currency: 'USD' },
    ] })).toBeNull();
  });
  it('rejects a cost-bearing posting', () => {
    expect(expenseAdapter.detect({ ...draft, postings: [
      { account: 'Expenses:Groceries', amount: '42.50', currency: 'USD', cost: { amount: '1', currency: 'EUR' } },
      { account: 'Assets:Checking', amount: '-42.50', currency: 'USD' },
    ] })).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run features/transactions/entry/types/expense.test.ts`
Expected: FAIL — cannot resolve `./expense`.

- [ ] **Step 3: Implement the adapter**

```ts
// features/transactions/entry/types/expense.ts
import type { DraftState } from '../draftReducer';
import {
  type HeaderFields,
  type TransactionTypeAdapter,
  type TypeContext,
  headerOf,
  draftFromHeader,
} from './adapter';
import { classifyAccount } from './accountRole';
import { absAmount, negateAmount } from './amount';

export type ExpenseFields = HeaderFields & {
  amount: string;
  currency: string;
  paidFrom: string;
  spentOn: string;
};

export const expenseAdapter: TransactionTypeAdapter<ExpenseFields> = {
  id: 'expense',
  label: 'Expense',
  icon: '🛒',
  emptyFields: (ctx: TypeContext): ExpenseFields => ({
    date: '',
    payee: '',
    status: 'none',
    note: '',
    amount: '',
    currency: ctx.defaultCurrency,
    paidFrom: '',
    spentOn: '',
  }),
  compile: (f, _ctx): DraftState =>
    draftFromHeader(
      { date: f.date, payee: f.payee, status: f.status, note: f.note, uid: f.uid },
      [
        { account: f.spentOn, amount: f.amount, currency: f.currency },
        { account: f.paidFrom, amount: negateAmount(f.amount), currency: f.currency },
      ]
    ),
  detect: (draft): ExpenseFields | null => {
    if (draft.postings.length !== 2) return null;
    if (draft.postings.some((p) => p.cost || p.assertion)) return null;
    const exp = draft.postings.find((p) => classifyAccount(p.account) === 'expense');
    const pay = draft.postings.find((p) => {
      const role = classifyAccount(p.account);
      return role === 'asset' || role === 'liability';
    });
    if (!exp || !pay || exp === pay) return null;
    if (exp.amount === '' || pay.amount === '') return null;
    if (exp.currency !== pay.currency) return null;
    if (!(Number(exp.amount) > 0)) return null;
    if (Math.abs(Number(exp.amount) + Number(pay.amount)) > 1e-9) return null;
    return {
      ...headerOf(draft),
      amount: absAmount(exp.amount),
      currency: exp.currency,
      paidFrom: pay.account,
      spentOn: exp.account,
    };
  },
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run features/transactions/entry/types/expense.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add features/transactions/entry/types/expense.ts features/transactions/entry/types/expense.test.ts
git commit -m "feat(transactions): expense type adapter"
```

---

## Task 8: Income adapter

**Files:**
- Create: `features/transactions/entry/types/income.ts`
- Test: `features/transactions/entry/types/income.test.ts`

**Interfaces:**
- Consumes: same as Task 7.
- Produces:
  - `type IncomeFields = HeaderFields & { amount: string; currency: string; receivedInto: string; from: string }`
  - `const incomeAdapter: TransactionTypeAdapter<IncomeFields>`

Compile rule: `receivedInto` (asset) gets `+amount`; `from` (income) gets `-amount`.
Detect rule: 2 postings, no cost/assertion, one role `asset` (positive amount) and one role `income` (negative amount), same currency, balanced.

- [ ] **Step 1: Write failing tests**

```ts
// features/transactions/entry/types/income.test.ts
import { describe, it, expect } from 'vitest';
import { incomeAdapter, type IncomeFields } from './income';

const ctx = { defaultCurrency: 'USD' };
const header = { date: '2026-06-29', payee: 'Acme Corp', status: 'none' as const, note: '' };

describe('incomeAdapter.compile', () => {
  it('builds a +asset / -income pair', () => {
    const draft = incomeAdapter.compile(
      { ...header, amount: '3000', currency: 'USD', receivedInto: 'Assets:Checking', from: 'Income:Salary' },
      ctx
    );
    expect(draft.postings).toEqual([
      { account: 'Assets:Checking', amount: '3000', currency: 'USD' },
      { account: 'Income:Salary', amount: '-3000', currency: 'USD' },
    ]);
  });
});

describe('incomeAdapter.detect', () => {
  const draft = {
    date: '2026-06-29', payee: 'Acme Corp', status: 'none' as const, note: '',
    postings: [
      { account: 'Assets:Checking', amount: '3000', currency: 'USD' },
      { account: 'Income:Salary', amount: '-3000', currency: 'USD' },
    ],
  };
  it('recognizes a clean income->asset pair', () => {
    expect(incomeAdapter.detect(draft)).toEqual({
      date: '2026-06-29', payee: 'Acme Corp', status: 'none', note: '', uid: undefined,
      amount: '3000', currency: 'USD', receivedInto: 'Assets:Checking', from: 'Income:Salary',
    });
  });
  it('round-trips compile -> detect', () => {
    const fields: IncomeFields = { ...header, uid: undefined, amount: '50', currency: 'USD', receivedInto: 'Assets:Cash', from: 'Income:Gifts' };
    expect(incomeAdapter.detect(incomeAdapter.compile(fields, ctx))).toEqual(fields);
  });
  it('rejects an expense pair', () => {
    expect(incomeAdapter.detect({ ...draft, postings: [
      { account: 'Expenses:Groceries', amount: '42.50', currency: 'USD' },
      { account: 'Assets:Checking', amount: '-42.50', currency: 'USD' },
    ] })).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run features/transactions/entry/types/income.test.ts`
Expected: FAIL — cannot resolve `./income`.

- [ ] **Step 3: Implement the adapter**

```ts
// features/transactions/entry/types/income.ts
import type { DraftState } from '../draftReducer';
import {
  type HeaderFields,
  type TransactionTypeAdapter,
  type TypeContext,
  headerOf,
  draftFromHeader,
} from './adapter';
import { classifyAccount } from './accountRole';
import { absAmount, negateAmount } from './amount';

export type IncomeFields = HeaderFields & {
  amount: string;
  currency: string;
  receivedInto: string;
  from: string;
};

export const incomeAdapter: TransactionTypeAdapter<IncomeFields> = {
  id: 'income',
  label: 'Income',
  icon: '💰',
  emptyFields: (ctx: TypeContext): IncomeFields => ({
    date: '',
    payee: '',
    status: 'none',
    note: '',
    amount: '',
    currency: ctx.defaultCurrency,
    receivedInto: '',
    from: '',
  }),
  compile: (f, _ctx): DraftState =>
    draftFromHeader(
      { date: f.date, payee: f.payee, status: f.status, note: f.note, uid: f.uid },
      [
        { account: f.receivedInto, amount: f.amount, currency: f.currency },
        { account: f.from, amount: negateAmount(f.amount), currency: f.currency },
      ]
    ),
  detect: (draft): IncomeFields | null => {
    if (draft.postings.length !== 2) return null;
    if (draft.postings.some((p) => p.cost || p.assertion)) return null;
    const asset = draft.postings.find((p) => classifyAccount(p.account) === 'asset');
    const income = draft.postings.find((p) => classifyAccount(p.account) === 'income');
    if (!asset || !income || asset === income) return null;
    if (asset.amount === '' || income.amount === '') return null;
    if (asset.currency !== income.currency) return null;
    if (!(Number(asset.amount) > 0)) return null;
    if (Math.abs(Number(asset.amount) + Number(income.amount)) > 1e-9) return null;
    return {
      ...headerOf(draft),
      amount: absAmount(asset.amount),
      currency: asset.currency,
      receivedInto: asset.account,
      from: income.account,
    };
  },
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run features/transactions/entry/types/income.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add features/transactions/entry/types/income.ts features/transactions/entry/types/income.test.ts
git commit -m "feat(transactions): income type adapter"
```

---

## Task 9: Transfer adapter

**Files:**
- Create: `features/transactions/entry/types/transfer.ts`
- Test: `features/transactions/entry/types/transfer.test.ts`

**Interfaces:**
- Consumes: same as Task 7.
- Produces:
  - `type TransferFields = HeaderFields & { amount: string; currency: string; from: string; to: string }`
  - `const transferAdapter: TransactionTypeAdapter<TransferFields>`

Compile rule: `to` (asset) gets `+amount`; `from` (asset) gets `-amount`; default payee `'Transfer'`.
Detect rule: 2 postings, no cost/assertion, **both** role `asset`, same currency, one positive one negative, balanced.

- [ ] **Step 1: Write failing tests**

```ts
// features/transactions/entry/types/transfer.test.ts
import { describe, it, expect } from 'vitest';
import { transferAdapter, type TransferFields } from './transfer';

const ctx = { defaultCurrency: 'USD' };
const header = { date: '2026-06-29', payee: 'Transfer', status: 'none' as const, note: '' };

describe('transferAdapter.compile', () => {
  it('builds a +to / -from asset pair', () => {
    const draft = transferAdapter.compile(
      { ...header, amount: '500', currency: 'USD', from: 'Assets:Checking', to: 'Assets:Savings' },
      ctx
    );
    expect(draft.postings).toEqual([
      { account: 'Assets:Savings', amount: '500', currency: 'USD' },
      { account: 'Assets:Checking', amount: '-500', currency: 'USD' },
    ]);
  });
  it('emptyFields defaults the payee to Transfer', () => {
    expect(transferAdapter.emptyFields(ctx).payee).toBe('Transfer');
  });
});

describe('transferAdapter.detect', () => {
  const draft = {
    date: '2026-06-29', payee: 'Transfer', status: 'none' as const, note: '',
    postings: [
      { account: 'Assets:Savings', amount: '500', currency: 'USD' },
      { account: 'Assets:Checking', amount: '-500', currency: 'USD' },
    ],
  };
  it('recognizes a clean asset->asset move', () => {
    expect(transferAdapter.detect(draft)).toEqual({
      date: '2026-06-29', payee: 'Transfer', status: 'none', note: '', uid: undefined,
      amount: '500', currency: 'USD', from: 'Assets:Checking', to: 'Assets:Savings',
    });
  });
  it('round-trips compile -> detect', () => {
    const fields: TransferFields = { ...header, uid: undefined, amount: '20', currency: 'USD', from: 'Assets:Cash', to: 'Assets:Wallet' };
    expect(transferAdapter.detect(transferAdapter.compile(fields, ctx))).toEqual(fields);
  });
  it('rejects an expense pair (one side is an expense)', () => {
    expect(transferAdapter.detect({ ...draft, postings: [
      { account: 'Expenses:Groceries', amount: '42.50', currency: 'USD' },
      { account: 'Assets:Checking', amount: '-42.50', currency: 'USD' },
    ] })).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run features/transactions/entry/types/transfer.test.ts`
Expected: FAIL — cannot resolve `./transfer`.

- [ ] **Step 3: Implement the adapter**

```ts
// features/transactions/entry/types/transfer.ts
import type { DraftState } from '../draftReducer';
import {
  type HeaderFields,
  type TransactionTypeAdapter,
  type TypeContext,
  headerOf,
  draftFromHeader,
} from './adapter';
import { classifyAccount } from './accountRole';
import { absAmount, negateAmount } from './amount';

export type TransferFields = HeaderFields & {
  amount: string;
  currency: string;
  from: string;
  to: string;
};

export const transferAdapter: TransactionTypeAdapter<TransferFields> = {
  id: 'transfer',
  label: 'Transfer',
  icon: '🔁',
  emptyFields: (ctx: TypeContext): TransferFields => ({
    date: '',
    payee: 'Transfer',
    status: 'none',
    note: '',
    amount: '',
    currency: ctx.defaultCurrency,
    from: '',
    to: '',
  }),
  compile: (f, _ctx): DraftState =>
    draftFromHeader(
      { date: f.date, payee: f.payee, status: f.status, note: f.note, uid: f.uid },
      [
        { account: f.to, amount: f.amount, currency: f.currency },
        { account: f.from, amount: negateAmount(f.amount), currency: f.currency },
      ]
    ),
  detect: (draft): TransferFields | null => {
    if (draft.postings.length !== 2) return null;
    if (draft.postings.some((p) => p.cost || p.assertion)) return null;
    if (draft.postings.some((p) => classifyAccount(p.account) !== 'asset')) return null;
    const [a, b] = draft.postings;
    if (a.amount === '' || b.amount === '') return null;
    if (a.currency !== b.currency) return null;
    if (Math.abs(Number(a.amount) + Number(b.amount)) > 1e-9) return null;
    const to = Number(a.amount) > 0 ? a : b;
    const from = Number(a.amount) > 0 ? b : a;
    if (!(Number(to.amount) > 0)) return null;
    return {
      ...headerOf(draft),
      amount: absAmount(to.amount),
      currency: to.currency,
      from: from.account,
      to: to.account,
    };
  },
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run features/transactions/entry/types/transfer.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add features/transactions/entry/types/transfer.ts features/transactions/entry/types/transfer.test.ts
git commit -m "feat(transactions): transfer type adapter"
```

---

## Task 10: Exchange adapter

**Files:**
- Create: `features/transactions/entry/types/exchange.ts`
- Test: `features/transactions/entry/types/exchange.test.ts`

**Interfaces:**
- Consumes: same as Task 7.
- Produces:
  - `type ExchangeFields = HeaderFields & { gaveAmount: string; gaveCurrency: string; gaveFrom: string; gotAmount: string; gotCurrency: string; gotInto: string }`
  - `const exchangeAdapter: TransactionTypeAdapter<ExchangeFields>`

Compile rule: `gotInto` gets `+gotAmount gotCurrency` with `cost = { amount: gaveAmount, currency: gaveCurrency }`; `gaveFrom` gets `-gaveAmount gaveCurrency`; default payee `'Currency exchange'`.
Detect rule: 2 postings, no assertion, exactly one has a `cost`; the cost posting's amount is positive and its `cost.currency` matches the other posting's currency; the other posting's amount is negative and `abs` equals `cost.amount`.

- [ ] **Step 1: Write failing tests**

```ts
// features/transactions/entry/types/exchange.test.ts
import { describe, it, expect } from 'vitest';
import { exchangeAdapter, type ExchangeFields } from './exchange';

const ctx = { defaultCurrency: 'USD' };
const header = { date: '2026-06-29', payee: 'Currency exchange', status: 'none' as const, note: '' };

describe('exchangeAdapter.compile', () => {
  it('builds a cost-annotated got posting plus a negative gave posting', () => {
    const draft = exchangeAdapter.compile(
      { ...header, gaveAmount: '100', gaveCurrency: 'USD', gaveFrom: 'Assets:Checking', gotAmount: '92', gotCurrency: 'EUR', gotInto: 'Assets:EUR-Wallet' },
      ctx
    );
    expect(draft.postings).toEqual([
      { account: 'Assets:EUR-Wallet', amount: '92', currency: 'EUR', cost: { amount: '100', currency: 'USD' } },
      { account: 'Assets:Checking', amount: '-100', currency: 'USD' },
    ]);
  });
});

describe('exchangeAdapter.detect', () => {
  const draft = {
    date: '2026-06-29', payee: 'Currency exchange', status: 'none' as const, note: '',
    postings: [
      { account: 'Assets:EUR-Wallet', amount: '92', currency: 'EUR', cost: { amount: '100', currency: 'USD' } },
      { account: 'Assets:Checking', amount: '-100', currency: 'USD' },
    ],
  };
  it('recognizes a cost-annotated exchange', () => {
    expect(exchangeAdapter.detect(draft)).toEqual({
      date: '2026-06-29', payee: 'Currency exchange', status: 'none', note: '', uid: undefined,
      gaveAmount: '100', gaveCurrency: 'USD', gaveFrom: 'Assets:Checking',
      gotAmount: '92', gotCurrency: 'EUR', gotInto: 'Assets:EUR-Wallet',
    });
  });
  it('round-trips compile -> detect', () => {
    const fields: ExchangeFields = { ...header, uid: undefined, gaveAmount: '50', gaveCurrency: 'USD', gaveFrom: 'Assets:Cash', gotAmount: '46', gotCurrency: 'EUR', gotInto: 'Assets:EUR' };
    expect(exchangeAdapter.detect(exchangeAdapter.compile(fields, ctx))).toEqual(fields);
  });
  it('rejects a plain expense pair (no cost)', () => {
    expect(exchangeAdapter.detect({ ...draft, postings: [
      { account: 'Expenses:Groceries', amount: '42.50', currency: 'USD' },
      { account: 'Assets:Checking', amount: '-42.50', currency: 'USD' },
    ] })).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run features/transactions/entry/types/exchange.test.ts`
Expected: FAIL — cannot resolve `./exchange`.

- [ ] **Step 3: Implement the adapter**

```ts
// features/transactions/entry/types/exchange.ts
import type { DraftState } from '../draftReducer';
import {
  type HeaderFields,
  type TransactionTypeAdapter,
  type TypeContext,
  headerOf,
  draftFromHeader,
} from './adapter';
import { absAmount } from './amount';

export type ExchangeFields = HeaderFields & {
  gaveAmount: string;
  gaveCurrency: string;
  gaveFrom: string;
  gotAmount: string;
  gotCurrency: string;
  gotInto: string;
};

export const exchangeAdapter: TransactionTypeAdapter<ExchangeFields> = {
  id: 'exchange',
  label: 'Exchange',
  icon: '💱',
  emptyFields: (ctx: TypeContext): ExchangeFields => ({
    date: '',
    payee: 'Currency exchange',
    status: 'none',
    note: '',
    gaveAmount: '',
    gaveCurrency: ctx.defaultCurrency,
    gaveFrom: '',
    gotAmount: '',
    gotCurrency: '',
    gotInto: '',
  }),
  compile: (f, _ctx): DraftState =>
    draftFromHeader(
      { date: f.date, payee: f.payee, status: f.status, note: f.note, uid: f.uid },
      [
        {
          account: f.gotInto,
          amount: f.gotAmount,
          currency: f.gotCurrency,
          cost: { amount: f.gaveAmount, currency: f.gaveCurrency },
        },
        { account: f.gaveFrom, amount: `-${absAmount(f.gaveAmount)}`, currency: f.gaveCurrency },
      ]
    ),
  detect: (draft): ExchangeFields | null => {
    if (draft.postings.length !== 2) return null;
    if (draft.postings.some((p) => p.assertion)) return null;
    const got = draft.postings.find((p) => p.cost);
    const gave = draft.postings.find((p) => !p.cost);
    if (!got || !gave || got === gave || !got.cost) return null;
    if (got.amount === '' || gave.amount === '') return null;
    if (!(Number(got.amount) > 0) || !(Number(gave.amount) < 0)) return null;
    if (gave.currency !== got.cost.currency) return null;
    if (Math.abs(Number(gave.amount) + Number(got.cost.amount)) > 1e-9) return null;
    return {
      ...headerOf(draft),
      gaveAmount: got.cost.amount,
      gaveCurrency: got.cost.currency,
      gaveFrom: gave.account,
      gotAmount: absAmount(got.amount),
      gotCurrency: got.currency,
      gotInto: got.account,
    };
  },
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run features/transactions/entry/types/exchange.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add features/transactions/entry/types/exchange.ts features/transactions/entry/types/exchange.test.ts
git commit -m "feat(transactions): exchange type adapter"
```

---

## Task 11: Fix-balance adapter

**Files:**
- Create: `features/transactions/entry/types/fixBalance.ts`
- Test: `features/transactions/entry/types/fixBalance.test.ts`

**Interfaces:**
- Consumes: same as Task 7 (no `negateAmount`/`absAmount` needed).
- Produces:
  - `type FixBalanceFields = HeaderFields & { account: string; targetAmount: string; targetCurrency: string }`
  - `const fixBalanceAdapter: TransactionTypeAdapter<FixBalanceFields>`
  - `const ADJUSTMENTS_ACCOUNT = 'Equity:Adjustments'`

Compile rule: posting 1 = `{ account, amount: '', currency: '', assertion: { amount: targetAmount, currency: targetCurrency } }`; posting 2 = `{ account: 'Equity:Adjustments', amount: '', currency: '' }`; default payee `'Balance adjustment'`.
Detect rule: 2 postings; exactly one has an `assertion` and a blank amount; the other is exactly `Equity:Adjustments` with a blank amount, no cost, no assertion.

- [ ] **Step 1: Write failing tests**

```ts
// features/transactions/entry/types/fixBalance.test.ts
import { describe, it, expect } from 'vitest';
import { fixBalanceAdapter, type FixBalanceFields } from './fixBalance';

const ctx = { defaultCurrency: 'USD' };
const header = { date: '2026-06-29', payee: 'Balance adjustment', status: 'none' as const, note: '' };

describe('fixBalanceAdapter.compile', () => {
  it('builds an assertion posting plus a blank Equity:Adjustments posting', () => {
    const draft = fixBalanceAdapter.compile(
      { ...header, account: 'Assets:Checking', targetAmount: '1234.56', targetCurrency: 'USD' },
      ctx
    );
    expect(draft.postings).toEqual([
      { account: 'Assets:Checking', amount: '', currency: '', assertion: { amount: '1234.56', currency: 'USD' } },
      { account: 'Equity:Adjustments', amount: '', currency: '' },
    ]);
  });
});

describe('fixBalanceAdapter.detect', () => {
  const draft = {
    date: '2026-06-29', payee: 'Balance adjustment', status: 'none' as const, note: '',
    postings: [
      { account: 'Assets:Checking', amount: '', currency: '', assertion: { amount: '1234.56', currency: 'USD' } },
      { account: 'Equity:Adjustments', amount: '', currency: '' },
    ],
  };
  it('recognizes an assertion + adjustments pair', () => {
    expect(fixBalanceAdapter.detect(draft)).toEqual({
      date: '2026-06-29', payee: 'Balance adjustment', status: 'none', note: '', uid: undefined,
      account: 'Assets:Checking', targetAmount: '1234.56', targetCurrency: 'USD',
    });
  });
  it('round-trips compile -> detect', () => {
    const fields: FixBalanceFields = { ...header, uid: undefined, account: 'Assets:Savings', targetAmount: '500', targetCurrency: 'USD' };
    expect(fixBalanceAdapter.detect(fixBalanceAdapter.compile(fields, ctx))).toEqual(fields);
  });
  it('rejects a plain expense pair', () => {
    expect(fixBalanceAdapter.detect({ ...draft, postings: [
      { account: 'Expenses:Groceries', amount: '42.50', currency: 'USD' },
      { account: 'Assets:Checking', amount: '-42.50', currency: 'USD' },
    ] })).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run features/transactions/entry/types/fixBalance.test.ts`
Expected: FAIL — cannot resolve `./fixBalance`.

- [ ] **Step 3: Implement the adapter**

```ts
// features/transactions/entry/types/fixBalance.ts
import type { DraftState } from '../draftReducer';
import {
  type HeaderFields,
  type TransactionTypeAdapter,
  type TypeContext,
  headerOf,
  draftFromHeader,
} from './adapter';

export const ADJUSTMENTS_ACCOUNT = 'Equity:Adjustments';

export type FixBalanceFields = HeaderFields & {
  account: string;
  targetAmount: string;
  targetCurrency: string;
};

export const fixBalanceAdapter: TransactionTypeAdapter<FixBalanceFields> = {
  id: 'fix-balance',
  label: 'Fix balance',
  icon: '⚖️',
  emptyFields: (ctx: TypeContext): FixBalanceFields => ({
    date: '',
    payee: 'Balance adjustment',
    status: 'none',
    note: '',
    account: '',
    targetAmount: '',
    targetCurrency: ctx.defaultCurrency,
  }),
  compile: (f, _ctx): DraftState =>
    draftFromHeader(
      { date: f.date, payee: f.payee, status: f.status, note: f.note, uid: f.uid },
      [
        {
          account: f.account,
          amount: '',
          currency: '',
          assertion: { amount: f.targetAmount, currency: f.targetCurrency },
        },
        { account: ADJUSTMENTS_ACCOUNT, amount: '', currency: '' },
      ]
    ),
  detect: (draft): FixBalanceFields | null => {
    if (draft.postings.length !== 2) return null;
    const asserted = draft.postings.find((p) => p.assertion && p.amount === '');
    const adjust = draft.postings.find(
      (p) => p.account === ADJUSTMENTS_ACCOUNT && p.amount === '' && !p.assertion && !p.cost
    );
    if (!asserted || !adjust || asserted === adjust || !asserted.assertion) return null;
    return {
      ...headerOf(draft),
      account: asserted.account,
      targetAmount: asserted.assertion.amount,
      targetCurrency: asserted.assertion.currency,
    };
  },
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run features/transactions/entry/types/fixBalance.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add features/transactions/entry/types/fixBalance.ts features/transactions/entry/types/fixBalance.test.ts
git commit -m "feat(transactions): fix-balance type adapter"
```

---

## Task 12: Registry and `detectType` dispatcher

**Files:**
- Create: `features/transactions/entry/types/registry.ts`
- Test: `features/transactions/entry/types/registry.test.ts`

**Interfaces:**
- Consumes: all five adapters (Tasks 7–11); `DraftState` (Task 2).
- Produces:
  - `const TYPE_ADAPTERS: readonly TransactionTypeAdapter<unknown>[]` — ordered `[expense, income, transfer, exchange, fixBalance]`.
  - `detectType(draft: DraftState): { id: string; fields: unknown } | null` — returns the first adapter whose `detect` matches, or `null`.

- [ ] **Step 1: Write failing tests**

```ts
// features/transactions/entry/types/registry.test.ts
import { describe, it, expect } from 'vitest';
import { TYPE_ADAPTERS, detectType } from './registry';

const draft = (postings: object[]) => ({
  date: '2026-06-29', payee: 'X', status: 'none' as const, note: '', postings,
}) as never;

describe('TYPE_ADAPTERS', () => {
  it('lists the five adapters in spec order', () => {
    expect(TYPE_ADAPTERS.map((a) => a.id)).toEqual([
      'expense', 'income', 'transfer', 'exchange', 'fix-balance',
    ]);
  });
});

describe('detectType', () => {
  it('routes a clean expense to the expense adapter', () => {
    expect(detectType(draft([
      { account: 'Expenses:Groceries', amount: '42.50', currency: 'USD' },
      { account: 'Assets:Checking', amount: '-42.50', currency: 'USD' },
    ]))?.id).toBe('expense');
  });
  it('routes an exchange to the exchange adapter', () => {
    expect(detectType(draft([
      { account: 'Assets:EUR', amount: '92', currency: 'EUR', cost: { amount: '100', currency: 'USD' } },
      { account: 'Assets:Checking', amount: '-100', currency: 'USD' },
    ]))?.id).toBe('exchange');
  });
  it('routes a fix-balance to the fix-balance adapter', () => {
    expect(detectType(draft([
      { account: 'Assets:Checking', amount: '', currency: '', assertion: { amount: '1234.56', currency: 'USD' } },
      { account: 'Equity:Adjustments', amount: '', currency: '' },
    ]))?.id).toBe('fix-balance');
  });
  it('returns null for a 3-posting split (falls back to Form)', () => {
    expect(detectType(draft([
      { account: 'Expenses:A', amount: '10', currency: 'USD' },
      { account: 'Expenses:B', amount: '10', currency: 'USD' },
      { account: 'Assets:Checking', amount: '-20', currency: 'USD' },
    ]))).toBeNull();
  });
  it('returns null for a non-standard-root journal', () => {
    expect(detectType(draft([
      { account: 'Funny:Money', amount: '10', currency: 'USD' },
      { account: 'Other:Thing', amount: '-10', currency: 'USD' },
    ]))).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run features/transactions/entry/types/registry.test.ts`
Expected: FAIL — cannot resolve `./registry`.

- [ ] **Step 3: Implement the registry**

```ts
// features/transactions/entry/types/registry.ts
import type { DraftState } from '../draftReducer';
import type { TransactionTypeAdapter } from './adapter';
import { expenseAdapter } from './expense';
import { incomeAdapter } from './income';
import { transferAdapter } from './transfer';
import { exchangeAdapter } from './exchange';
import { fixBalanceAdapter } from './fixBalance';

export const TYPE_ADAPTERS: readonly TransactionTypeAdapter<unknown>[] = [
  expenseAdapter,
  incomeAdapter,
  transferAdapter,
  exchangeAdapter,
  fixBalanceAdapter,
] as TransactionTypeAdapter<unknown>[];

export const detectType = (
  draft: DraftState
): { id: string; fields: unknown } | null => {
  for (const adapter of TYPE_ADAPTERS) {
    const fields = adapter.detect(draft);
    if (fields) return { id: adapter.id, fields };
  }
  return null;
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run features/transactions/entry/types/registry.test.ts`
Expected: PASS.

- [ ] **Step 5: Type-check**

Run: `pnpm type-check`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add features/transactions/entry/types/registry.ts features/transactions/entry/types/registry.test.ts
git commit -m "feat(transactions): type adapter registry and detectType dispatcher"
```

---

## Task 13: Full-suite gate and end-to-end ledger verification

**Files:** none (verification only).

- [ ] **Step 1: Full test suite + type-check + lint**

Run: `pnpm test`
Expected: PASS — all suites green (existing + the ~9 new test files).
Run: `pnpm type-check`
Expected: PASS.
Run: `pnpm lint`
Expected: PASS (no new lint errors in the created/modified files).

- [ ] **Step 2: End-to-end save of an Exchange via the Raw lens**

Run: `pnpm dev`, open `http://localhost:3000/transactions/new`, switch to the **Raw** tab, and enter:

```
2026-06-29 Currency exchange
    Assets:EUR-Wallet   EUR 92 @@ USD 100
    Assets:Checking    -USD 100
```

Confirm the Raw lens shows it as valid (no parse error, balance indicator balanced) and save it. Then verify the saved journal file contains the `@@` line verbatim and `ledger -f <journal> bal` runs clean. This exercises the full model-extension path (parser → draft → serialize → schema → formatTransaction → file).

- [ ] **Step 3: End-to-end save of a Fix balance via the Raw lens**

In the Raw tab, enter:

```
2026-06-29 Balance adjustment
    Assets:Checking   = USD 1234.56
    Equity:Adjustments
```

Confirm it parses as valid (balance indicator shows auto-balance) and saves; verify `ledger -f <journal> reg Equity:Adjustments` shows the booked difference and the assertion holds (no `ledger` assertion error on `ledger -f <journal> bal`).

- [ ] **Step 4: Record the result**

If all pass, Phase 3 is complete and the type engine is ready for Phase 4 to render. If anything regressed, fix under TDD before closing the phase. No commit needed for a clean verification.

---

## Self-Review

- **Spec/roadmap coverage (Phase 3 scope):**
  - `accountRole.ts` (classifyAccount + accountsForRole, standard five roots + `unknown` fallback) → Task 5.
  - Adapter interface (`id`/`label`/`icon`/`fields`/`compile`/`detect`) → Task 6.
  - Five adapters with the spec's compile rules (Exchange `@@` total-cost; Fix balance assertion + auto-balanced `Equity:Adjustments`) → Tasks 7–11.
  - Ordered registry → Task 12.
  - `detect()` ambiguity pinned (clean 2-posting → type; splits/unclassifiable → `null`) → detect tests in Tasks 7–12.
  - Round-trip `detect(compile(fields)) ≈ fields` → explicit round-trip test in each of Tasks 7–11.
  - **Model-expressiveness prerequisite** (the roadmap assumed `@@`/`=` but the draft model couldn't carry them) → Tasks 1–4 extend parser, draft model+serializer, validation+formatter, and balance; the user chose to do this in the same PR.
  - Fix balance's current-balance *display* lookup correctly deferred to Phase 4 (compile stays pure, emits assertion + blank equity) — verified against real `ledger` in Task 13.
- **Placeholder scan:** none — every code step shows complete code; modify-steps cite exact symbols/line ranges and give full replacement bodies.
- **Type consistency:** `DraftPosting.cost`/`assertion` (Task 2) match `ParsedPosting` (Task 1) and `postingSchema` (Task 3) field shapes (`{ amount, currency }`); `HeaderFields`/`TypeContext`/`TransactionTypeAdapter<F>` defined in Task 6 are consumed unchanged in Tasks 7–12; `headerOf`/`draftFromHeader`/`negateAmount`/`absAmount`/`classifyAccount` signatures are fixed in Tasks 5–6 and called consistently; `detectType` return shape `{ id, fields }` (Task 12) matches the per-adapter `detect` returns.
- **No-UI invariant honored:** every new file is plain `.ts` unit-tested logic; no tab is registered and no component is created — Phase 4 owns rendering.
- **Form-lens note:** the Form lens does not yet render `cost`/`assertion` inputs (Phase 4); it preserves them across edits to other fields (the reducer's `setPosting` spreads the prior posting) but they are not visible/editable there. Acceptable for this pure-engine phase; revisited in Phase 4.
