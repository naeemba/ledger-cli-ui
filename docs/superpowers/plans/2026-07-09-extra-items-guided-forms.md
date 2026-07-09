# Extra Items in Guided Transaction Forms — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user append an arbitrary number of extra postings (fees, tips, shipping, deductions) inside the Expense, Income, Transfer, and Exchange guided type forms.

**Architecture:** Each affected adapter gains an `extraItems: ExtraItem[]` field. A shared helper (`extraItems.ts`) turns those rows into postings and computes the per-currency balancing postings for the form's absorbing account. `compile` appends the extras; `detect` recovers them by partitioning postings by account role. A shared `ExtraItemsField` component renders the dynamic row list in all four forms.

**Tech Stack:** TypeScript, React (client components), Vitest, `renderToStaticMarkup` for component tests, existing `Combobox` / `AmountInput` / `CurrencyCombobox` widgets.

## Global Constraints

- Spell identifiers out in full — no abbreviations (project naming rule). Use `extraItems`, not `extras` in public field/type names (local variables named `extras` are acceptable).
- Never mention AI tooling in code, comments, commits.
- `MAX_POSTINGS = 50`, `MIN_POSTINGS = 2` (from `lib/transactions/schema.ts`) — the total posting count stays bounded by 50.
- **Regression guarantee:** when `extraItems` is empty, every adapter's `compile` MUST produce byte-identical postings to today (same strings, same order). This is enforced by keeping the existing two-posting code path for the empty case.
- FixBalance form is out of scope — do not touch `fixBalance.ts` or `FixBalanceForm.tsx`.
- Computed absorbing postings use normalized numeric formatting (trailing zeros trimmed). Base and extra-item postings preserve the user's raw amount strings verbatim.

---

### Task 1: Shared extra-items helper

**Files:**
- Create: `features/transactions/entry/types/extraItems.ts`
- Test: `features/transactions/entry/types/extraItems.test.ts`

**Interfaces:**
- Produces:
  - `type ExtraItem = { account: string; amount: string; currency: string }`
  - `formatAmount(n: number): string`
  - `residualByCurrency(postings: readonly Posting[]): Map<string, number>`
  - `balancingPostings(account: string, others: readonly Posting[]): Posting[]`
  - `extraItemPostings(items: readonly ExtraItem[]): Posting[]`
  - `toExtraItems(postings: readonly Posting[]): ExtraItem[]`
  - `singleAccount(postings: readonly Posting[]): string | null`

- [ ] **Step 1: Write the failing test**

```ts
// features/transactions/entry/types/extraItems.test.ts
import { describe, it, expect } from 'vitest';
import {
  formatAmount,
  residualByCurrency,
  balancingPostings,
  extraItemPostings,
  toExtraItems,
  singleAccount,
} from './extraItems';

describe('formatAmount', () => {
  it('trims float noise and negative zero', () => {
    expect(formatAmount(120)).toBe('120');
    expect(formatAmount(-42.5)).toBe('-42.5');
    expect(formatAmount(0.1 + 0.2)).toBe('0.3');
    expect(formatAmount(-0)).toBe('0');
  });
});

describe('residualByCurrency', () => {
  it('sums plain postings per currency in first-seen order', () => {
    const net = residualByCurrency([
      { account: 'Expenses:Dining', amount: '100', currency: 'USD' },
      { account: 'Expenses:Tips', amount: '20', currency: 'USD' },
      { account: 'Expenses:Fees', amount: '2', currency: 'EUR' },
    ]);
    expect([...net]).toEqual([
      ['USD', 120],
      ['EUR', 2],
    ]);
  });

  it('honors @@ cost annotations', () => {
    const net = residualByCurrency([
      {
        account: 'Assets:BTC',
        amount: '1',
        currency: 'BTC',
        cost: { amount: '100', currency: 'USD' },
      },
    ]);
    expect(net.get('USD')).toBe(100);
    expect(net.has('BTC')).toBe(false);
  });
});

describe('balancingPostings', () => {
  it('emits one negated posting per nonzero currency', () => {
    const out = balancingPostings('Assets:Checking', [
      { account: 'Expenses:Dining', amount: '100', currency: 'USD' },
      { account: 'Expenses:Tips', amount: '20', currency: 'USD' },
      { account: 'Expenses:Fees', amount: '2', currency: 'EUR' },
    ]);
    expect(out).toEqual([
      { account: 'Assets:Checking', amount: '-120', currency: 'USD' },
      { account: 'Assets:Checking', amount: '-2', currency: 'EUR' },
    ]);
  });

  it('drops currencies that already net to zero', () => {
    const out = balancingPostings('Assets:Checking', [
      { account: 'A', amount: '5', currency: 'USD' },
      { account: 'B', amount: '-5', currency: 'USD' },
    ]);
    expect(out).toEqual([]);
  });
});

describe('extraItemPostings', () => {
  it('maps rows to postings and drops fully-blank rows', () => {
    expect(
      extraItemPostings([
        { account: 'Expenses:Tips', amount: '20', currency: 'USD' },
        { account: '', amount: '', currency: 'USD' },
      ])
    ).toEqual([{ account: 'Expenses:Tips', amount: '20', currency: 'USD' }]);
  });
});

describe('toExtraItems', () => {
  it('projects postings to plain item rows', () => {
    expect(
      toExtraItems([
        { account: 'Expenses:Tips', amount: '20', currency: 'USD' },
      ])
    ).toEqual([{ account: 'Expenses:Tips', amount: '20', currency: 'USD' }]);
  });
});

describe('singleAccount', () => {
  it('returns the account when all postings share one', () => {
    expect(
      singleAccount([
        { account: 'Assets:Checking', amount: '-120', currency: 'USD' },
        { account: 'Assets:Checking', amount: '-2', currency: 'EUR' },
      ])
    ).toBe('Assets:Checking');
  });
  it('returns null for zero or multiple distinct accounts', () => {
    expect(singleAccount([])).toBeNull();
    expect(
      singleAccount([
        { account: 'Assets:A', amount: '1', currency: 'USD' },
        { account: 'Assets:B', amount: '-1', currency: 'USD' },
      ])
    ).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run features/transactions/entry/types/extraItems.test.ts`
Expected: FAIL — cannot resolve `./extraItems`.

- [ ] **Step 3: Write minimal implementation**

```ts
// features/transactions/entry/types/extraItems.ts
import type { Posting } from '@/lib/transactions/posting';

export type ExtraItem = { account: string; amount: string; currency: string };

/** Format a computed numeric amount to a compact string (trailing zeros trimmed, no -0). */
export const formatAmount = (n: number): string => {
  if (!Number.isFinite(n)) return '0';
  const fixed = Number(n.toFixed(10));
  return (Object.is(fixed, -0) ? 0 : fixed).toString();
};

/**
 * Net amount per currency across postings, honoring `@@` cost annotations
 * (a cost-bearing posting contributes its signed cost to the cost currency,
 * exactly like {@link computeBalance}). Insertion order = first-seen currency.
 */
export const residualByCurrency = (
  postings: readonly Posting[]
): Map<string, number> => {
  const net = new Map<string, number>();
  for (const posting of postings) {
    if (posting.cost) {
      const amount = Number(posting.amount);
      const cost = Number(posting.cost.amount);
      if (!Number.isFinite(amount) || !Number.isFinite(cost)) continue;
      const sign = amount < 0 ? -1 : 1;
      net.set(
        posting.cost.currency,
        (net.get(posting.cost.currency) ?? 0) + sign * cost
      );
    } else {
      const value = Number(posting.amount);
      if (!Number.isFinite(value)) continue;
      net.set(posting.currency, (net.get(posting.currency) ?? 0) + value);
    }
  }
  return net;
};

/** Postings for `account` that zero the residual of `others`, one per nonzero currency. */
export const balancingPostings = (
  account: string,
  others: readonly Posting[]
): Posting[] => {
  const net = residualByCurrency(others);
  const out: Posting[] = [];
  for (const [currency, total] of net) {
    if (Math.abs(total) <= 1e-9) continue;
    out.push({ account, amount: formatAmount(-total), currency });
  }
  return out;
};

/** Map extra-item rows to postings, dropping fully-blank rows. */
export const extraItemPostings = (items: readonly ExtraItem[]): Posting[] =>
  items
    .filter((item) => item.account.trim() !== '' || item.amount.trim() !== '')
    .map((item) => ({
      account: item.account,
      amount: item.amount,
      currency: item.currency,
    }));

/** Project postings back to plain extra-item rows. */
export const toExtraItems = (postings: readonly Posting[]): ExtraItem[] =>
  postings.map((posting) => ({
    account: posting.account,
    amount: posting.amount,
    currency: posting.currency,
  }));

/** The one account shared by every posting, or null if none / more than one. */
export const singleAccount = (postings: readonly Posting[]): string | null => {
  const accounts = new Set(postings.map((posting) => posting.account));
  if (accounts.size !== 1) return null;
  return [...accounts][0] ?? null;
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run features/transactions/entry/types/extraItems.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add features/transactions/entry/types/extraItems.ts features/transactions/entry/types/extraItems.test.ts
git commit -m "feat(entry): add extra-items posting helpers"
```

---

### Task 2: Expense adapter extra items

**Files:**
- Modify: `features/transactions/entry/types/expense.ts`
- Test: `features/transactions/entry/types/expense.test.ts` (update + extend)

**Interfaces:**
- Consumes: `ExtraItem`, `extraItemPostings`, `balancingPostings`, `toExtraItems`, `singleAccount` from Task 1; `computeBalance` from `@/lib/transactions/balance`.
- Produces: `ExpenseFields` now includes `extraItems: ExtraItem[]`.

- [ ] **Step 1: Update existing tests to expect `extraItems` and add extras coverage**

Replace the whole body of `features/transactions/entry/types/expense.test.ts` with:

```ts
import { describe, it, expect } from 'vitest';
import { expenseAdapter, type ExpenseFields } from './expense';
import { Transaction } from '@/lib/transactions/model';

const ctx = { defaultCurrency: 'USD' };
const header = {
  date: '2026-06-29',
  payee: 'Whole Foods',
  status: 'none' as const,
  note: '',
};

describe('expenseAdapter.compile', () => {
  it('builds a +expense / -asset pair with no extras', () => {
    const draft = expenseAdapter.compile(
      {
        ...header,
        amount: '42.50',
        currency: 'USD',
        paidFrom: 'Assets:Checking',
        spentOn: 'Expenses:Groceries',
        extraItems: [],
      },
      ctx
    );
    expect(draft.postings).toEqual([
      { account: 'Expenses:Groceries', amount: '42.50', currency: 'USD' },
      { account: 'Assets:Checking', amount: '-42.50', currency: 'USD' },
    ]);
    expect(draft.payee).toBe('Whole Foods');
  });

  it('appends extra items and folds them into the paying posting', () => {
    const draft = expenseAdapter.compile(
      {
        ...header,
        amount: '100',
        currency: 'USD',
        paidFrom: 'Assets:Checking',
        spentOn: 'Expenses:Dining',
        extraItems: [
          { account: 'Expenses:Tips', amount: '20', currency: 'USD' },
          { account: 'Expenses:Fees', amount: '2', currency: 'EUR' },
        ],
      },
      ctx
    );
    expect(draft.postings).toEqual([
      { account: 'Expenses:Dining', amount: '100', currency: 'USD' },
      { account: 'Expenses:Tips', amount: '20', currency: 'USD' },
      { account: 'Expenses:Fees', amount: '2', currency: 'EUR' },
      { account: 'Assets:Checking', amount: '-120', currency: 'USD' },
      { account: 'Assets:Checking', amount: '-2', currency: 'EUR' },
    ]);
  });
});

describe('expenseAdapter.detect', () => {
  const clean = Transaction.of('2026-06-29', 'Whole Foods', 'none', '', [
    { account: 'Expenses:Groceries', amount: '42.50', currency: 'USD' },
    { account: 'Assets:Checking', amount: '-42.50', currency: 'USD' },
  ]);

  it('recognizes a clean asset->expense pair with empty extras', () => {
    expect(expenseAdapter.detect(clean)).toEqual({
      date: '2026-06-29',
      payee: 'Whole Foods',
      status: 'none',
      note: '',
      uid: undefined,
      amount: '42.50',
      currency: 'USD',
      paidFrom: 'Assets:Checking',
      spentOn: 'Expenses:Groceries',
      extraItems: [],
    });
  });

  it('recovers extra items from a 3-posting split', () => {
    const draft = Transaction.of('2026-06-29', 'Whole Foods', 'none', '', [
      { account: 'Expenses:Groceries', amount: '42.50', currency: 'USD' },
      { account: 'Expenses:Tax', amount: '3', currency: 'USD' },
      { account: 'Assets:Checking', amount: '-45.50', currency: 'USD' },
    ]);
    expect(expenseAdapter.detect(draft)).toMatchObject({
      amount: '42.50',
      paidFrom: 'Assets:Checking',
      spentOn: 'Expenses:Groceries',
      extraItems: [{ account: 'Expenses:Tax', amount: '3', currency: 'USD' }],
    });
  });

  it('round-trips compile -> detect with extras', () => {
    const fields: ExpenseFields = {
      ...header,
      uid: undefined,
      amount: '100',
      currency: 'USD',
      paidFrom: 'Assets:Cash',
      spentOn: 'Expenses:Coffee',
      extraItems: [{ account: 'Expenses:Tips', amount: '5', currency: 'USD' }],
    };
    expect(expenseAdapter.detect(expenseAdapter.compile(fields, ctx))).toEqual(
      fields
    );
  });

  it('rejects two distinct paying accounts', () => {
    expect(
      expenseAdapter.detect(
        Transaction.of('2026-06-29', 'x', 'none', '', [
          { account: 'Expenses:Groceries', amount: '42.50', currency: 'USD' },
          { account: 'Assets:Checking', amount: '-20', currency: 'USD' },
          { account: 'Assets:Cash', amount: '-22.50', currency: 'USD' },
        ])
      )
    ).toBeNull();
  });

  it('rejects an unbalanced draft', () => {
    expect(
      expenseAdapter.detect(
        Transaction.of('2026-06-29', 'x', 'none', '', [
          { account: 'Expenses:Groceries', amount: '42.50', currency: 'USD' },
          { account: 'Assets:Checking', amount: '-40', currency: 'USD' },
        ])
      )
    ).toBeNull();
  });

  it('rejects a cost-bearing posting', () => {
    expect(
      expenseAdapter.detect(
        Transaction.of('2026-06-29', 'x', 'none', '', [
          {
            account: 'Expenses:Groceries',
            amount: '42.50',
            currency: 'USD',
            cost: { amount: '1', currency: 'EUR' },
          },
          { account: 'Assets:Checking', amount: '-42.50', currency: 'USD' },
        ])
      )
    ).toBeNull();
  });

  it('rejects an asset->asset transfer (no expense posting)', () => {
    expect(
      expenseAdapter.detect(
        Transaction.of('2026-06-29', 'x', 'none', '', [
          { account: 'Assets:Savings', amount: '500', currency: 'USD' },
          { account: 'Assets:Checking', amount: '-500', currency: 'USD' },
        ])
      )
    ).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run features/transactions/entry/types/expense.test.ts`
Expected: FAIL — `extraItems` missing from type / compile ignores extras.

- [ ] **Step 3: Rewrite the adapter**

Replace the whole body of `features/transactions/entry/types/expense.ts` with:

```ts
import type { DraftState } from '../draftReducer';
import { classifyAccount } from './accountRole';
import {
  type HeaderFields,
  type TransactionTypeAdapter,
  type TypeContext,
  headerOf,
} from './adapter';
import { absAmount, negateAmount } from './amount';
import {
  type ExtraItem,
  balancingPostings,
  extraItemPostings,
  singleAccount,
  toExtraItems,
} from './extraItems';
import { computeBalance } from '@/lib/transactions/balance';
import { Transaction } from '@/lib/transactions/model';

export type ExpenseFields = HeaderFields & {
  amount: string;
  currency: string;
  paidFrom: string;
  spentOn: string;
  extraItems: ExtraItem[];
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
    extraItems: [],
  }),
  compile: (f, _ctx): DraftState => {
    const header = {
      date: f.date,
      payee: f.payee,
      status: f.status,
      note: f.note,
      uid: f.uid,
    };
    const base = { account: f.spentOn, amount: f.amount, currency: f.currency };
    const extras = extraItemPostings(f.extraItems);
    if (extras.length === 0) {
      return Transaction.fromHeader(header, [
        base,
        {
          account: f.paidFrom,
          amount: negateAmount(f.amount),
          currency: f.currency,
        },
      ]);
    }
    const items = [base, ...extras];
    return Transaction.fromHeader(header, [
      ...items,
      ...balancingPostings(f.paidFrom, items),
    ]);
  },
  detect: (draft): ExpenseFields | null => {
    const postings = draft.postings;
    if (postings.length < 2) return null;
    if (postings.some((p) => p.cost || p.assertion)) return null;
    const expensePostings = postings.filter(
      (p) => classifyAccount(p.account) === 'expense'
    );
    const payingPostings = postings.filter((p) => {
      const role = classifyAccount(p.account);
      return role === 'asset' || role === 'liability';
    });
    if (expensePostings.length + payingPostings.length !== postings.length)
      return null;
    if (expensePostings.length < 1 || payingPostings.length < 1) return null;
    const paidFrom = singleAccount(payingPostings);
    if (!paidFrom) return null;
    if (computeBalance(postings).kind !== 'balanced') return null;
    const base = expensePostings[0];
    if (base.amount === '' || !(Number(base.amount) > 0)) return null;
    return {
      ...headerOf(draft),
      amount: absAmount(base.amount),
      currency: base.currency,
      paidFrom,
      spentOn: base.account,
      extraItems: toExtraItems(expensePostings.slice(1)),
    };
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run features/transactions/entry/types/expense.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add features/transactions/entry/types/expense.ts features/transactions/entry/types/expense.test.ts
git commit -m "feat(entry): support extra items in the expense adapter"
```

---

### Task 3: Income adapter extra items

**Files:**
- Modify: `features/transactions/entry/types/income.ts`
- Test: `features/transactions/entry/types/income.test.ts` (update + extend)

**Interfaces:**
- Consumes: Task 1 helpers, `computeBalance`.
- Produces: `IncomeFields` now includes `extraItems: ExtraItem[]`. Absorbing account is `receivedInto`; the income source posting (`from`, negative) is the base.

- [ ] **Step 1: Update tests**

Replace the whole body of `features/transactions/entry/types/income.test.ts` with:

```ts
import { describe, it, expect } from 'vitest';
import { incomeAdapter, type IncomeFields } from './income';
import { Transaction } from '@/lib/transactions/model';

const ctx = { defaultCurrency: 'USD' };
const header = {
  date: '2026-06-29',
  payee: 'Employer',
  status: 'none' as const,
  note: '',
};

describe('incomeAdapter.compile', () => {
  it('builds a +asset / -income pair with no extras', () => {
    const draft = incomeAdapter.compile(
      {
        ...header,
        amount: '1000',
        currency: 'USD',
        receivedInto: 'Assets:Checking',
        from: 'Income:Salary',
        extraItems: [],
      },
      ctx
    );
    expect(draft.postings).toEqual([
      { account: 'Assets:Checking', amount: '1000', currency: 'USD' },
      { account: 'Income:Salary', amount: '-1000', currency: 'USD' },
    ]);
  });

  it('subtracts fee extras from the net received', () => {
    const draft = incomeAdapter.compile(
      {
        ...header,
        amount: '1000',
        currency: 'USD',
        receivedInto: 'Assets:Checking',
        from: 'Income:Salary',
        extraItems: [
          { account: 'Expenses:Fees', amount: '30', currency: 'USD' },
        ],
      },
      ctx
    );
    expect(draft.postings).toEqual([
      { account: 'Assets:Checking', amount: '970', currency: 'USD' },
      { account: 'Income:Salary', amount: '-1000', currency: 'USD' },
      { account: 'Expenses:Fees', amount: '30', currency: 'USD' },
    ]);
  });
});

describe('incomeAdapter.detect', () => {
  it('recognizes a clean income pair with empty extras', () => {
    const draft = Transaction.of('2026-06-29', 'Employer', 'none', '', [
      { account: 'Assets:Checking', amount: '1000', currency: 'USD' },
      { account: 'Income:Salary', amount: '-1000', currency: 'USD' },
    ]);
    expect(incomeAdapter.detect(draft)).toEqual({
      date: '2026-06-29',
      payee: 'Employer',
      status: 'none',
      note: '',
      uid: undefined,
      amount: '1000',
      currency: 'USD',
      receivedInto: 'Assets:Checking',
      from: 'Income:Salary',
      extraItems: [],
    });
  });

  it('round-trips compile -> detect with extras', () => {
    const fields: IncomeFields = {
      ...header,
      uid: undefined,
      amount: '1000',
      currency: 'USD',
      receivedInto: 'Assets:Checking',
      from: 'Income:Salary',
      extraItems: [
        { account: 'Expenses:Fees', amount: '30', currency: 'USD' },
      ],
    };
    expect(incomeAdapter.detect(incomeAdapter.compile(fields, ctx))).toEqual(
      fields
    );
  });

  it('rejects a draft with two income sources', () => {
    expect(
      incomeAdapter.detect(
        Transaction.of('2026-06-29', 'x', 'none', '', [
          { account: 'Assets:Checking', amount: '1000', currency: 'USD' },
          { account: 'Income:Salary', amount: '-600', currency: 'USD' },
          { account: 'Income:Bonus', amount: '-400', currency: 'USD' },
        ])
      )
    ).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run features/transactions/entry/types/income.test.ts`
Expected: FAIL.

- [ ] **Step 3: Rewrite the adapter**

Replace the whole body of `features/transactions/entry/types/income.ts` with:

```ts
import type { DraftState } from '../draftReducer';
import { classifyAccount } from './accountRole';
import {
  type HeaderFields,
  type TransactionTypeAdapter,
  type TypeContext,
  headerOf,
} from './adapter';
import { absAmount, negateAmount } from './amount';
import {
  type ExtraItem,
  balancingPostings,
  extraItemPostings,
  singleAccount,
  toExtraItems,
} from './extraItems';
import { computeBalance } from '@/lib/transactions/balance';
import { Transaction } from '@/lib/transactions/model';

export type IncomeFields = HeaderFields & {
  amount: string;
  currency: string;
  receivedInto: string;
  from: string;
  extraItems: ExtraItem[];
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
    extraItems: [],
  }),
  compile: (f, _ctx): DraftState => {
    const header = {
      date: f.date,
      payee: f.payee,
      status: f.status,
      note: f.note,
      uid: f.uid,
    };
    const source = {
      account: f.from,
      amount: negateAmount(f.amount),
      currency: f.currency,
    };
    const extras = extraItemPostings(f.extraItems);
    if (extras.length === 0) {
      return Transaction.fromHeader(header, [
        { account: f.receivedInto, amount: f.amount, currency: f.currency },
        source,
      ]);
    }
    const items = [source, ...extras];
    return Transaction.fromHeader(header, [
      ...balancingPostings(f.receivedInto, items),
      ...items,
    ]);
  },
  detect: (draft): IncomeFields | null => {
    const postings = draft.postings;
    if (postings.length < 2) return null;
    if (postings.some((p) => p.cost || p.assertion)) return null;
    const incomePostings = postings.filter(
      (p) => classifyAccount(p.account) === 'income'
    );
    const assetPostings = postings.filter((p) => {
      const role = classifyAccount(p.account);
      return role === 'asset' || role === 'liability';
    });
    const expensePostings = postings.filter(
      (p) => classifyAccount(p.account) === 'expense'
    );
    if (
      incomePostings.length + assetPostings.length + expensePostings.length !==
      postings.length
    )
      return null;
    if (incomePostings.length !== 1 || assetPostings.length < 1) return null;
    const receivedInto = singleAccount(assetPostings);
    if (!receivedInto) return null;
    if (computeBalance(postings).kind !== 'balanced') return null;
    const base = incomePostings[0];
    if (base.amount === '' || !(Number(base.amount) < 0)) return null;
    return {
      ...headerOf(draft),
      amount: absAmount(base.amount),
      currency: base.currency,
      receivedInto,
      from: base.account,
      extraItems: toExtraItems(expensePostings),
    };
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run features/transactions/entry/types/income.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add features/transactions/entry/types/income.ts features/transactions/entry/types/income.test.ts
git commit -m "feat(entry): support extra items in the income adapter"
```

---

### Task 4: Transfer adapter extra items

**Files:**
- Modify: `features/transactions/entry/types/transfer.ts`
- Test: `features/transactions/entry/types/transfer.test.ts` (update + extend)

**Interfaces:**
- Consumes: Task 1 helpers, `computeBalance`.
- Produces: `TransferFields` now includes `extraItems: ExtraItem[]`. Destination `to` (positive asset) is the base; `from` absorbs. Extra items are expense-role postings.

- [ ] **Step 1: Update tests**

Replace the whole body of `features/transactions/entry/types/transfer.test.ts` with:

```ts
import { describe, it, expect } from 'vitest';
import { transferAdapter, type TransferFields } from './transfer';
import { Transaction } from '@/lib/transactions/model';

const ctx = { defaultCurrency: 'USD' };
const header = {
  date: '2026-06-29',
  payee: 'Transfer',
  status: 'none' as const,
  note: '',
};

describe('transferAdapter.compile', () => {
  it('builds a to/from pair with no extras', () => {
    const draft = transferAdapter.compile(
      {
        ...header,
        amount: '500',
        currency: 'USD',
        from: 'Assets:Checking',
        to: 'Assets:Savings',
        extraItems: [],
      },
      ctx
    );
    expect(draft.postings).toEqual([
      { account: 'Assets:Savings', amount: '500', currency: 'USD' },
      { account: 'Assets:Checking', amount: '-500', currency: 'USD' },
    ]);
  });

  it('adds a transfer fee to the source outflow', () => {
    const draft = transferAdapter.compile(
      {
        ...header,
        amount: '500',
        currency: 'USD',
        from: 'Assets:Checking',
        to: 'Assets:Savings',
        extraItems: [
          { account: 'Expenses:WireFee', amount: '15', currency: 'USD' },
        ],
      },
      ctx
    );
    expect(draft.postings).toEqual([
      { account: 'Assets:Savings', amount: '500', currency: 'USD' },
      { account: 'Expenses:WireFee', amount: '15', currency: 'USD' },
      { account: 'Assets:Checking', amount: '-515', currency: 'USD' },
    ]);
  });
});

describe('transferAdapter.detect', () => {
  it('recognizes a clean transfer with empty extras', () => {
    const draft = Transaction.of('2026-06-29', 'Transfer', 'none', '', [
      { account: 'Assets:Savings', amount: '500', currency: 'USD' },
      { account: 'Assets:Checking', amount: '-500', currency: 'USD' },
    ]);
    expect(transferAdapter.detect(draft)).toEqual({
      date: '2026-06-29',
      payee: 'Transfer',
      status: 'none',
      note: '',
      uid: undefined,
      amount: '500',
      currency: 'USD',
      from: 'Assets:Checking',
      to: 'Assets:Savings',
      extraItems: [],
    });
  });

  it('round-trips compile -> detect with a fee', () => {
    const fields: TransferFields = {
      ...header,
      uid: undefined,
      amount: '500',
      currency: 'USD',
      from: 'Assets:Checking',
      to: 'Assets:Savings',
      extraItems: [
        { account: 'Expenses:WireFee', amount: '15', currency: 'USD' },
      ],
    };
    expect(transferAdapter.detect(transferAdapter.compile(fields, ctx))).toEqual(
      fields
    );
  });

  it('rejects two positive destinations', () => {
    expect(
      transferAdapter.detect(
        Transaction.of('2026-06-29', 'x', 'none', '', [
          { account: 'Assets:Savings', amount: '300', currency: 'USD' },
          { account: 'Assets:Brokerage', amount: '200', currency: 'USD' },
          { account: 'Assets:Checking', amount: '-500', currency: 'USD' },
        ])
      )
    ).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run features/transactions/entry/types/transfer.test.ts`
Expected: FAIL.

- [ ] **Step 3: Rewrite the adapter**

Replace the whole body of `features/transactions/entry/types/transfer.ts` with:

```ts
import type { DraftState } from '../draftReducer';
import { classifyAccount } from './accountRole';
import {
  type HeaderFields,
  type TransactionTypeAdapter,
  type TypeContext,
  headerOf,
} from './adapter';
import { absAmount, negateAmount } from './amount';
import {
  type ExtraItem,
  balancingPostings,
  extraItemPostings,
  singleAccount,
  toExtraItems,
} from './extraItems';
import { computeBalance } from '@/lib/transactions/balance';
import { Transaction } from '@/lib/transactions/model';

export type TransferFields = HeaderFields & {
  amount: string;
  currency: string;
  from: string;
  to: string;
  extraItems: ExtraItem[];
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
    extraItems: [],
  }),
  compile: (f, _ctx): DraftState => {
    const header = {
      date: f.date,
      payee: f.payee,
      status: f.status,
      note: f.note,
      uid: f.uid,
    };
    const to = { account: f.to, amount: f.amount, currency: f.currency };
    const extras = extraItemPostings(f.extraItems);
    if (extras.length === 0) {
      return Transaction.fromHeader(header, [
        to,
        {
          account: f.from,
          amount: negateAmount(f.amount),
          currency: f.currency,
        },
      ]);
    }
    const items = [to, ...extras];
    return Transaction.fromHeader(header, [
      ...items,
      ...balancingPostings(f.from, items),
    ]);
  },
  detect: (draft): TransferFields | null => {
    const postings = draft.postings;
    if (postings.length < 2) return null;
    if (postings.some((p) => p.cost || p.assertion)) return null;
    const assetPostings = postings.filter((p) => {
      const role = classifyAccount(p.account);
      return role === 'asset' || role === 'liability';
    });
    const expensePostings = postings.filter(
      (p) => classifyAccount(p.account) === 'expense'
    );
    if (assetPostings.length + expensePostings.length !== postings.length)
      return null;
    if (assetPostings.length < 2) return null;
    if (computeBalance(postings).kind !== 'balanced') return null;
    const positives = assetPostings.filter((p) => Number(p.amount) > 0);
    const negatives = assetPostings.filter((p) => Number(p.amount) < 0);
    if (positives.length !== 1) return null;
    const to = positives[0];
    const from = singleAccount(negatives);
    if (!from || from === to.account) return null;
    return {
      ...headerOf(draft),
      amount: absAmount(to.amount),
      currency: to.currency,
      from,
      to: to.account,
      extraItems: toExtraItems(expensePostings),
    };
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run features/transactions/entry/types/transfer.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add features/transactions/entry/types/transfer.ts features/transactions/entry/types/transfer.test.ts
git commit -m "feat(entry): support extra items in the transfer adapter"
```

---

### Task 5: Exchange adapter extra items

**Files:**
- Modify: `features/transactions/entry/types/exchange.ts`
- Test: `features/transactions/entry/types/exchange.test.ts` (update + extend)

**Interfaces:**
- Consumes: Task 1 helpers, `computeBalance`.
- Produces: `ExchangeFields` now includes `extraItems: ExtraItem[]`. The cost-bearing `got` posting is the base; `gaveFrom` absorbs (per currency). Extra items are expense-role postings (broker fee, etc.).

- [ ] **Step 1: Read the current test to preserve its non-extras cases**

Run: `cat features/transactions/entry/types/exchange.test.ts`

Keep every existing case, adding `extraItems: []` to each expected `detect` result and each `compile` input's fields. Then append the two new cases below.

New `compile` case:

```ts
it('routes a broker fee through the paying account', () => {
  const draft = exchangeAdapter.compile(
    {
      ...header,
      gaveAmount: '100',
      gaveCurrency: 'USD',
      gaveFrom: 'Assets:Bank',
      gotAmount: '1',
      gotCurrency: 'BTC',
      gotInto: 'Assets:BTC',
      extraItems: [
        { account: 'Expenses:BrokerFee', amount: '2', currency: 'USD' },
      ],
    },
    ctx
  );
  expect(draft.postings).toEqual([
    {
      account: 'Assets:BTC',
      amount: '1',
      currency: 'BTC',
      cost: { amount: '100', currency: 'USD' },
    },
    { account: 'Expenses:BrokerFee', amount: '2', currency: 'USD' },
    { account: 'Assets:Bank', amount: '-102', currency: 'USD' },
  ]);
});
```

New round-trip case:

```ts
it('round-trips compile -> detect with a broker fee', () => {
  const fields: ExchangeFields = {
    ...header,
    uid: undefined,
    gaveAmount: '100',
    gaveCurrency: 'USD',
    gaveFrom: 'Assets:Bank',
    gotAmount: '1',
    gotCurrency: 'BTC',
    gotInto: 'Assets:BTC',
    extraItems: [
      { account: 'Expenses:BrokerFee', amount: '2', currency: 'USD' },
    ],
  };
  expect(exchangeAdapter.detect(exchangeAdapter.compile(fields, ctx))).toEqual(
    fields
  );
});
```

Ensure the test file imports `type ExchangeFields`:

```ts
import { exchangeAdapter, type ExchangeFields } from './exchange';
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run features/transactions/entry/types/exchange.test.ts`
Expected: FAIL.

- [ ] **Step 3: Rewrite the adapter**

Replace the whole body of `features/transactions/entry/types/exchange.ts` with:

```ts
// features/transactions/entry/types/exchange.ts
import type { DraftState } from '../draftReducer';
import { classifyAccount } from './accountRole';
import {
  type HeaderFields,
  type TransactionTypeAdapter,
  type TypeContext,
  headerOf,
} from './adapter';
import { absAmount } from './amount';
import {
  type ExtraItem,
  balancingPostings,
  extraItemPostings,
  singleAccount,
  toExtraItems,
} from './extraItems';
import { computeBalance } from '@/lib/transactions/balance';
import { Transaction } from '@/lib/transactions/model';

export type ExchangeFields = HeaderFields & {
  gaveAmount: string;
  gaveCurrency: string;
  gaveFrom: string;
  gotAmount: string;
  gotCurrency: string;
  gotInto: string;
  extraItems: ExtraItem[];
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
    extraItems: [],
  }),
  compile: (f, _ctx): DraftState => {
    const header = {
      date: f.date,
      payee: f.payee,
      status: f.status,
      note: f.note,
      uid: f.uid,
    };
    const got = {
      account: f.gotInto,
      amount: f.gotAmount,
      currency: f.gotCurrency,
      cost: { amount: f.gaveAmount, currency: f.gaveCurrency },
    };
    const extras = extraItemPostings(f.extraItems);
    if (extras.length === 0) {
      return Transaction.fromHeader(header, [
        got,
        {
          account: f.gaveFrom,
          amount: `-${absAmount(f.gaveAmount)}`,
          currency: f.gaveCurrency,
        },
      ]);
    }
    const items = [got, ...extras];
    return Transaction.fromHeader(header, [
      ...items,
      ...balancingPostings(f.gaveFrom, items),
    ]);
  },
  detect: (draft): ExchangeFields | null => {
    const postings = draft.postings;
    if (postings.length < 2) return null;
    if (postings.some((p) => p.assertion)) return null;
    const costPostings = postings.filter((p) => p.cost);
    if (costPostings.length !== 1) return null;
    const got = costPostings[0];
    const cost = got.cost;
    if (!cost) return null;
    const rest = postings.filter((p) => p !== got);
    const expensePostings = rest.filter(
      (p) => classifyAccount(p.account) === 'expense'
    );
    const gavePostings = rest.filter((p) => {
      const role = classifyAccount(p.account);
      return role === 'asset' || role === 'liability';
    });
    if (expensePostings.length + gavePostings.length !== rest.length)
      return null;
    if (gavePostings.length < 1) return null;
    const gaveFrom = singleAccount(gavePostings);
    if (!gaveFrom) return null;
    if (got.amount === '' || !(Number(got.amount) > 0)) return null;
    if (computeBalance(postings).kind !== 'balanced') return null;
    return {
      ...headerOf(draft),
      gaveAmount: cost.amount,
      gaveCurrency: cost.currency,
      gaveFrom,
      gotAmount: absAmount(got.amount),
      gotCurrency: got.currency,
      gotInto: got.account,
      extraItems: toExtraItems(expensePostings),
    };
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run features/transactions/entry/types/exchange.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add features/transactions/entry/types/exchange.ts features/transactions/entry/types/exchange.test.ts
git commit -m "feat(entry): support extra items in the exchange adapter"
```

---

### Task 6: Cross-type detection ordering

**Files:**
- Modify: `features/transactions/entry/types/registry.test.ts` (extend; do not weaken existing cases)

**Interfaces:**
- Consumes: `detectType` from `./registry` (unchanged).

**Context:** `TYPE_ADAPTERS` order is `[expense, income, transfer, exchange, fixBalance]` and `detectType` returns the first non-null. These tests lock in that an extras-bearing draft resolves to the intended type and is not swallowed by an earlier adapter.

- [ ] **Step 1: Read the current test file**

Run: `cat features/transactions/entry/types/registry.test.ts`

Keep all existing assertions. If any existing case asserts a full `fields` object (deep equality) for a detected type, add `extraItems: []` to that expected object so it still matches.

- [ ] **Step 2: Append cross-type ordering tests**

Add this block to `registry.test.ts` (adjust the import if the file already imports these):

```ts
import { describe, it, expect } from 'vitest';
import { detectType } from './registry';
import { Transaction } from '@/lib/transactions/model';

describe('detectType with extra items', () => {
  it('classifies an expense with a tip as expense', () => {
    const draft = Transaction.of('2026-06-29', 'Diner', 'none', '', [
      { account: 'Expenses:Dining', amount: '100', currency: 'USD' },
      { account: 'Expenses:Tips', amount: '20', currency: 'USD' },
      { account: 'Assets:Checking', amount: '-120', currency: 'USD' },
    ]);
    expect(detectType(draft)?.id).toBe('expense');
  });

  it('classifies a transfer with a wire fee as transfer, not expense', () => {
    const draft = Transaction.of('2026-06-29', 'Transfer', 'none', '', [
      { account: 'Assets:Savings', amount: '500', currency: 'USD' },
      { account: 'Expenses:WireFee', amount: '15', currency: 'USD' },
      { account: 'Assets:Checking', amount: '-515', currency: 'USD' },
    ]);
    expect(detectType(draft)?.id).toBe('transfer');
  });

  it('classifies income with a processor fee as income, not expense', () => {
    const draft = Transaction.of('2026-06-29', 'Employer', 'none', '', [
      { account: 'Assets:Checking', amount: '970', currency: 'USD' },
      { account: 'Income:Salary', amount: '-1000', currency: 'USD' },
      { account: 'Expenses:Fees', amount: '30', currency: 'USD' },
    ]);
    expect(detectType(draft)?.id).toBe('income');
  });

  it('classifies an exchange with a broker fee as exchange', () => {
    const draft = Transaction.of('2026-06-29', 'Currency exchange', 'none', '', [
      {
        account: 'Assets:BTC',
        amount: '1',
        currency: 'BTC',
        cost: { amount: '100', currency: 'USD' },
      },
      { account: 'Expenses:BrokerFee', amount: '2', currency: 'USD' },
      { account: 'Assets:Bank', amount: '-102', currency: 'USD' },
    ]);
    expect(detectType(draft)?.id).toBe('exchange');
  });
});
```

- [ ] **Step 3: Run test to verify it passes**

Run: `pnpm exec vitest run features/transactions/entry/types/registry.test.ts`
Expected: PASS. If the transfer or income case resolves to `expense`, the corresponding adapter's `detect` guard is wrong — fix the adapter, not the test.

- [ ] **Step 4: Commit**

```bash
git add features/transactions/entry/types/registry.test.ts
git commit -m "test(entry): lock in type detection for drafts with extra items"
```

---

### Task 7: ExtraItemsField component

**Files:**
- Create: `features/transactions/entry/typeForms/ExtraItemsField.tsx`
- Test: `features/transactions/entry/typeForms/ExtraItemsField.test.tsx`

**Interfaces:**
- Consumes: `ExtraItem` (Task 1); existing `Combobox` (`@/components/Combobox`), `AmountInput` (`../../AmountInput`), `Button` (`@/components/ui/button`), `SectionLabel` + `CurrencyCombobox` (`./fields`).
- Produces:
  ```ts
  function ExtraItemsField(props: {
    items: ExtraItem[];
    accounts: string[];
    defaultCurrency: string;
    baseCount: number;
    onChange: (items: ExtraItem[]) => void;
  }): React.JSX.Element
  ```

- [ ] **Step 1: Write the failing test**

```tsx
// features/transactions/entry/typeForms/ExtraItemsField.test.tsx
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { ExtraItemsField } from './ExtraItemsField';

const html = (node: React.ReactNode) => renderToStaticMarkup(node);

describe('ExtraItemsField', () => {
  it('renders one row per item with its account and amount', () => {
    const out = html(
      <ExtraItemsField
        items={[
          { account: 'Expenses:Tips', amount: '20', currency: 'USD' },
          { account: 'Expenses:Fees', amount: '2', currency: 'EUR' },
        ]}
        accounts={['Expenses:Tips', 'Expenses:Fees']}
        defaultCurrency="USD"
        baseCount={2}
        onChange={() => {}}
      />
    );
    expect(out).toContain('Extra items');
    expect(out).toContain('Expenses:Tips');
    expect(out).toContain('20');
    expect(out).toContain('Expenses:Fees');
  });

  it('renders only the add button when empty', () => {
    const out = html(
      <ExtraItemsField
        items={[]}
        accounts={[]}
        defaultCurrency="USD"
        baseCount={2}
        onChange={() => {}}
      />
    );
    expect(out).toContain('Add item');
  });

  it('disables adding when the posting cap is reached', () => {
    const items = Array.from({ length: 48 }, () => ({
      account: 'Expenses:Fees',
      amount: '1',
      currency: 'USD',
    }));
    const out = html(
      <ExtraItemsField
        items={items}
        accounts={['Expenses:Fees']}
        defaultCurrency="USD"
        baseCount={2}
        onChange={() => {}}
      />
    );
    expect(out).toContain('disabled');
    expect(out).toContain('limit');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run features/transactions/entry/typeForms/ExtraItemsField.test.tsx`
Expected: FAIL — cannot resolve `./ExtraItemsField`.

- [ ] **Step 3: Write the component**

First confirm the `Button` import path and prop names:

Run: `sed -n '1,60p' components/ui/button.tsx`

Adjust the `variant`/`size` values below to ones the component actually defines (the block below assumes shadcn defaults `variant="outline" | "ghost"`, `size="sm" | "icon"`). Then create:

```tsx
// features/transactions/entry/typeForms/ExtraItemsField.tsx
'use client';

import React from 'react';
import AmountInput from '../../AmountInput';
import { CurrencyCombobox, SectionLabel } from './fields';
import type { ExtraItem } from '../types/extraItems';
import Combobox from '@/components/Combobox';
import { Button } from '@/components/ui/button';

const MAX_POSTINGS = 50;

export function ExtraItemsField({
  items,
  accounts,
  defaultCurrency,
  baseCount,
  onChange,
}: {
  items: ExtraItem[];
  accounts: string[];
  defaultCurrency: string;
  baseCount: number;
  onChange: (items: ExtraItem[]) => void;
}): React.JSX.Element {
  const atCap = baseCount + items.length >= MAX_POSTINGS;

  const setItem = (index: number, patch: Partial<ExtraItem>) =>
    onChange(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  const addItem = () =>
    onChange([...items, { account: '', amount: '', currency: defaultCurrency }]);
  const removeItem = (index: number) =>
    onChange(items.filter((_, i) => i !== index));

  return (
    <section className="flex flex-col gap-3">
      <SectionLabel>Extra items (fees, tips…)</SectionLabel>

      {items.map((item, index) => (
        <div key={index} className="flex items-center gap-2">
          <Combobox
            value={item.account}
            onChange={(account) => setItem(index, { account })}
            options={accounts}
            placeholder="Account, e.g. Expenses:Fees"
          />
          <AmountInput
            value={item.amount}
            onChange={(amount) => setItem(index, { amount })}
            placeholder="Amount"
            className="w-28 text-right tabular-nums"
          />
          <CurrencyCombobox
            value={item.currency}
            onChange={(currency) => setItem(index, { currency })}
            className="w-24"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Remove item"
            onClick={() => removeItem(index)}
          >
            ×
          </Button>
        </div>
      ))}

      <div className="flex flex-col gap-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          disabled={atCap}
          onClick={addItem}
        >
          + Add item
        </Button>
        {atCap && (
          <span className="text-xs text-muted-foreground">
            Posting limit reached ({MAX_POSTINGS}).
          </span>
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run features/transactions/entry/typeForms/ExtraItemsField.test.tsx`
Expected: PASS. If the empty-state or cap markup differs, adjust the assertion strings to the real rendered text (do not weaken the intent).

- [ ] **Step 5: Commit**

```bash
git add features/transactions/entry/typeForms/ExtraItemsField.tsx features/transactions/entry/typeForms/ExtraItemsField.test.tsx
git commit -m "feat(entry): add ExtraItemsField dynamic row component"
```

---

### Task 8: Wire ExtraItemsField into the four forms

**Files:**
- Modify: `features/transactions/entry/typeForms/ExpenseForm.tsx`
- Modify: `features/transactions/entry/typeForms/IncomeForm.tsx`
- Modify: `features/transactions/entry/typeForms/TransferForm.tsx`
- Modify: `features/transactions/entry/typeForms/ExchangeForm.tsx`
- Test: `features/transactions/entry/typeForms/ExpenseForm.test.tsx` (extend)

**Interfaces:**
- Consumes: `ExtraItemsField` (Task 7). Each form already holds its adapter `fields` in `useState` and calls `update(next)` which re-runs `adapter.compile`. `fields.extraItems` now exists on all four.

**Context:** Each form's `update(next)` both `setFields(next)` and dispatches `replaceAll` with the recompiled draft, so passing a new `extraItems` array through `update` is all that is needed — no reducer changes.

- [ ] **Step 1: Extend the ExpenseForm test**

Add this case to `features/transactions/entry/typeForms/ExpenseForm.test.tsx`:

```ts
it('renders the extra-items section and seeds a fee from a 3-posting draft', () => {
  const draft = initDraft(
    {
      date: '2026-06-29',
      payee: 'Diner',
      postings: [
        { account: 'Expenses:Dining', amount: '100', currency: 'USD' },
        { account: 'Expenses:Tips', amount: '20', currency: 'USD' },
        { account: 'Assets:Checking', amount: '-120', currency: 'USD' },
      ],
    },
    'USD'
  );
  const out = html(
    <ExpenseForm
      draft={draft}
      dispatch={() => {}}
      accounts={['Assets:Checking', 'Expenses:Dining', 'Expenses:Tips']}
      payees={['Diner']}
      defaultCurrency="USD"
    />
  );
  expect(out).toContain('Extra items');
  expect(out).toContain('Expenses:Tips');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run features/transactions/entry/typeForms/ExpenseForm.test.tsx`
Expected: FAIL — output does not contain "Extra items".

- [ ] **Step 3: Add the field to ExpenseForm**

In `features/transactions/entry/typeForms/ExpenseForm.tsx`, add the import:

```tsx
import { ExtraItemsField } from './ExtraItemsField';
```

Then, inside the `<section>`, immediately after the "Spent on" `<AccountField>` block, add:

```tsx
<ExtraItemsField
  items={fields.extraItems}
  accounts={accounts}
  defaultCurrency={fields.currency || defaultCurrency}
  baseCount={2}
  onChange={(extraItems) => update({ ...fields, extraItems })}
/>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run features/transactions/entry/typeForms/ExpenseForm.test.tsx`
Expected: PASS.

- [ ] **Step 5: Add the field to the other three forms**

Apply the same import and the same `<ExtraItemsField>` block, placed after the last account field inside each form's `<section>`:

- `IncomeForm.tsx` — after the "From" (`from`) account field. Use `defaultCurrency={fields.currency || defaultCurrency}`.
- `TransferForm.tsx` — after the "To" (`to`) account field. Use `defaultCurrency={fields.currency || defaultCurrency}`.
- `ExchangeForm.tsx` — after the "Into" (`gotInto`) account field. Use `defaultCurrency={fields.gaveCurrency || defaultCurrency}` (fees default to the currency the user is paying with).

Each form already destructures `accounts` and `defaultCurrency` from `TypeFormProps` and defines `update`, so the block compiles as-is once imported. If a form does not currently destructure `defaultCurrency`, add it to the props destructure.

- [ ] **Step 6: Run the full entry test suite and type-check**

Run: `pnpm exec vitest run features/transactions/entry && pnpm exec tsc --noEmit`
Expected: PASS with no type errors.

- [ ] **Step 7: Commit**

```bash
git add features/transactions/entry/typeForms/ExpenseForm.tsx features/transactions/entry/typeForms/IncomeForm.tsx features/transactions/entry/typeForms/TransferForm.tsx features/transactions/entry/typeForms/ExchangeForm.tsx features/transactions/entry/typeForms/ExpenseForm.test.tsx
git commit -m "feat(entry): expose extra items in the guided type forms"
```

---

## Final verification

- [ ] Run the whole suite: `pnpm exec vitest run`
- [ ] Type-check: `pnpm exec tsc --noEmit`
- [ ] Lint the touched files: `pnpm lint`
- [ ] Manual smoke: start the app, open transaction entry → Types tab → Expense, add two extra items in different currencies, confirm the Raw lens shows the expected balancing postings and the balance indicator reads "balanced".

## Notes on design decisions (for the implementer)

- **Why keep a separate empty-extras branch in every `compile`?** The regression guarantee. `balancingPostings` normalizes amounts through `Number`, which would turn `"-42.50"` into `"-42.5"` and rewrite every existing user's ledger output. The empty branch preserves the exact current strings; the arithmetic path only runs when the user actually added an extra item.
- **Why does `detect` pick `expensePostings[0]` as the base?** In an Expense/Income, the base and the extras share the same account role, so position is the only signal. `compile` always emits the base first, so `compile → detect` round-trips. A hand-built draft with a different order picks a different base — acceptable and deterministic.
- **Determinism guard:** every `detect` returns `null` unless the whole draft balances (`computeBalance(...).kind === 'balanced'`), the absorbing account is a single account (`singleAccount`), and no posting carries an unexpected role. A draft that is unrecognized today is never mis-recognized; it still falls back to the Form/Raw lens.
