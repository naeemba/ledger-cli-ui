# Phase 4.1 — Edit / Delete Transaction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every transaction in the user's journal editable and deletable through the UI, backed by a UID-addressed parser/writer pair with a content-fingerprint safety check.

**Architecture:** A new `lib/journal/` module owns parsing, UID backfill, and mutation. The parser produces typed `Transaction[]` (round-trippable with source coordinates); `writeJournal` performs file-scoped edit/delete inside a per-user mutex with atomic tmpfile+rename writes. The list view (`/transactions`) reads the parser; the edit page reuses `TransactionForm`; the delete action runs through `<ConfirmDialog>`.

**Tech Stack:** TypeScript / Next.js 16 App Router · Zod · ULID · vitest (new in this phase) · existing shadcn primitives (`AlertDialog`, `Combobox`, `Alert`, `ToggleGroup`, `Input`).

**Reference spec:** `docs/superpowers/specs/2026-05-18-phase-4-1-edit-delete-design.md`.

---

## File Map

**Created:**

- `lib/journal/uid.ts` — ULID generator + UID-line regex + indent-preserving insertion helper.
- `lib/journal/parser.ts` — `parseHeader`, `parsePostingLine`, `parseBlock`, `resolveIncludes`, `parseJournal`.
- `lib/journal/backfill.ts` — `backfillUids(userId)`.
- `lib/journal/fingerprint.ts` — `fingerprintTransaction(draft)` → sha256.
- `lib/journal/mutex.ts` — per-user async mutex.
- `lib/journal/write.ts` — `writeJournal(userId, input)` (edit + delete).
- `lib/journal/__fixtures__/*` — hand-crafted journals for tests.
- `lib/journal/*.test.ts` — vitest suites paired with each module above.
- `app/transactions/page.tsx` — list view (server component).
- `app/transactions/TransactionTable.tsx` — table client component.
- `app/transactions/Filters.tsx` — filter bar client component.
- `app/transactions/actions.ts` — `deleteTransactionAction`.
- `app/transactions/loading.tsx` — page skeleton.
- `app/transactions/[uid]/edit/page.tsx` — edit page.
- `app/transactions/[uid]/edit/actions.ts` — `updateTransactionAction`.
- `vitest.config.ts` — vitest setup.

**Modified:**

- `lib/transactions/schema.ts` — add optional `uid` to `TransactionDraft`; `formatTransaction` emits UID line.
- `lib/journals.ts` — `addTransaction` stamps ULID; `replaceJournalFromSingleFile` and `replaceJournalFromZip` call `backfillUids` as last step.
- `app/transactions/new/TransactionForm.tsx` — split form to a reusable component with `mode: 'create' | 'edit'`, accept `initialDraft`, `uid`, `expectedFingerprint`, `submitAction`.
- `app/transactions/new/actions.ts` — unchanged signature; reused as-is by the create form.
- `components/nav/config.ts` — add `Transactions` entry under Activity section.
- `features/dashboard/Dashboard.tsx` — "View all →" link under recent transactions.
- `package.json` — vitest scripts, ulid + vitest devDependencies.

---

## Task 1 — Install vitest and ulid

**Files:**

- Modify: `package.json`
- Create: `vitest.config.ts`

- [ ] **Step 1: Install dependencies**

Run:

```bash
pnpm add ulid
pnpm add -D vitest @vitest/coverage-v8
```

Expected: both packages added to `package.json`.

- [ ] **Step 2: Add vitest scripts**

Edit `package.json`, add to the `scripts` block:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 3: Create vitest config**

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  test: {
    environment: 'node',
    include: ['**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['lib/journal/**/*.ts'],
      exclude: ['lib/journal/**/*.test.ts', 'lib/journal/__fixtures__/**'],
      thresholds: { lines: 95, functions: 95, branches: 90 },
    },
  },
});
```

- [ ] **Step 4: Smoke test**

Create `lib/journal/__smoke__.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
describe('vitest smoke', () => {
  it('runs', () => expect(1 + 1).toBe(2));
});
```

Run: `pnpm test`
Expected: 1 test passed.

- [ ] **Step 5: Delete the smoke test and commit**

```bash
rm lib/journal/__smoke__.test.ts
git add package.json pnpm-lock.yaml vitest.config.ts
git commit -m "chore: add vitest and ulid dependencies"
```

---

## Task 2 — UID helpers (`lib/journal/uid.ts`)

**Files:**

- Create: `lib/journal/uid.ts`
- Test: `lib/journal/uid.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/journal/uid.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  UID_LINE_REGEX,
  generateUid,
  findUidInBlock,
  detectFirstPostingIndent,
  insertUidLine,
} from './uid';

describe('UID helpers', () => {
  it('UID_LINE_REGEX matches a canonical metadata line', () => {
    expect(UID_LINE_REGEX.test('    ; :uid: 01HZX5G5KJDS9HQRYK8E5T0DJC')).toBe(true);
    expect(UID_LINE_REGEX.test('\t; :uid: 01HZX5G5KJDS9HQRYK8E5T0DJC')).toBe(true);
  });

  it('UID_LINE_REGEX rejects non-UID comment lines', () => {
    expect(UID_LINE_REGEX.test('    ; just a note')).toBe(false);
    expect(UID_LINE_REGEX.test('    ; :tag: value')).toBe(false);
  });

  it('generateUid returns a 26-char Crockford ULID', () => {
    const uid = generateUid();
    expect(uid).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });

  it('findUidInBlock returns the embedded UID', () => {
    const block = [
      '2024-09-01 lunch',
      '    ; :uid: 01HZX5G5KJDS9HQRYK8E5T0DJC',
      '    Expenses:Restaurant  10',
      '    Assets:Cash',
    ].join('\n');
    expect(findUidInBlock(block)).toBe('01HZX5G5KJDS9HQRYK8E5T0DJC');
  });

  it('findUidInBlock returns null when no UID is present', () => {
    const block = '2024-09-01 lunch\n    Expenses:Restaurant 10\n    Assets:Cash';
    expect(findUidInBlock(block)).toBeNull();
  });

  it('detectFirstPostingIndent returns the first non-comment indented line indent', () => {
    const lines = ['2024-09-01 lunch', '    ; note', '\tExpenses:Restaurant 10', '\tAssets:Cash'];
    expect(detectFirstPostingIndent(lines)).toBe('\t');
  });

  it('detectFirstPostingIndent falls back to 4 spaces when no posting found', () => {
    const lines = ['2024-09-01 lunch'];
    expect(detectFirstPostingIndent(lines)).toBe('    ');
  });

  it('insertUidLine inserts a UID line right after the header using the detected indent', () => {
    const block = '2024-09-01 lunch\n\tExpenses:Restaurant\t10\n\tAssets:Cash';
    const result = insertUidLine(block, '01HZX5G5KJDS9HQRYK8E5T0DJC');
    expect(result).toBe(
      '2024-09-01 lunch\n\t; :uid: 01HZX5G5KJDS9HQRYK8E5T0DJC\n\tExpenses:Restaurant\t10\n\tAssets:Cash'
    );
  });
});
```

- [ ] **Step 2: Run the test, expect failure**

Run: `pnpm test lib/journal/uid.test.ts`
Expected: All tests fail with "Cannot find module './uid'".

- [ ] **Step 3: Implement `lib/journal/uid.ts`**

```ts
import { ulid } from 'ulid';

export const UID_LINE_REGEX = /^\s*;\s*:uid:\s*([0-9A-HJKMNP-TV-Z]{26})\s*$/;

const FALLBACK_INDENT = '    ';

export const generateUid = (): string => ulid();

export const findUidInBlock = (block: string): string | null => {
  for (const line of block.split('\n')) {
    const match = line.match(UID_LINE_REGEX);
    if (match) return match[1];
  }
  return null;
};

export const detectFirstPostingIndent = (lines: string[]): string => {
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const indentMatch = line.match(/^(\s+)([^;\s])/);
    if (indentMatch) return indentMatch[1];
  }
  return FALLBACK_INDENT;
};

export const insertUidLine = (block: string, uid: string): string => {
  const lines = block.split('\n');
  const indent = detectFirstPostingIndent(lines);
  const uidLine = `${indent}; :uid: ${uid}`;
  return [lines[0], uidLine, ...lines.slice(1)].join('\n');
};
```

- [ ] **Step 4: Run tests, expect pass**

Run: `pnpm test lib/journal/uid.test.ts`
Expected: 8 tests passed.

- [ ] **Step 5: Commit**

```bash
git add lib/journal/uid.ts lib/journal/uid.test.ts
git commit -m "feat(journal): add UID helpers"
```

---

## Task 3 — Parser: `parseHeader`

**Files:**

- Create: `lib/journal/parser.ts` (incremental — header only this task)
- Test: `lib/journal/parser.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/journal/parser.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseHeader } from './parser';

describe('parseHeader', () => {
  it('parses YYYY-MM-DD with no status', () => {
    expect(parseHeader('2024-09-01 lunch')).toEqual({
      date: '2024-09-01',
      status: 'none',
      payee: 'lunch',
    });
  });

  it('parses YYYY/MM/DD and normalizes to YYYY-MM-DD', () => {
    expect(parseHeader('2024/09/01 lunch')).toEqual({
      date: '2024-09-01',
      status: 'none',
      payee: 'lunch',
    });
  });

  it('parses cleared marker', () => {
    expect(parseHeader('2024-09-01 * Trader Joe\'s')).toEqual({
      date: '2024-09-01',
      status: 'cleared',
      payee: "Trader Joe's",
    });
  });

  it('parses pending marker', () => {
    expect(parseHeader('2024-09-01 ! rent')).toEqual({
      date: '2024-09-01',
      status: 'pending',
      payee: 'rent',
    });
  });

  it('trims payee whitespace', () => {
    expect(parseHeader('2024-09-01    lunch with darya   ')).toEqual({
      date: '2024-09-01',
      status: 'none',
      payee: 'lunch with darya',
    });
  });

  it('returns null for non-header lines', () => {
    expect(parseHeader('    Expenses:Food  10')).toBeNull();
    expect(parseHeader('; a comment')).toBeNull();
    expect(parseHeader('')).toBeNull();
  });

  it('returns null for missing payee', () => {
    expect(parseHeader('2024-09-01')).toBeNull();
    expect(parseHeader('2024-09-01 *')).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test, expect failure**

Run: `pnpm test lib/journal/parser.test.ts`
Expected: Failure — module not found.

- [ ] **Step 3: Implement `parseHeader`**

Create `lib/journal/parser.ts`:

```ts
export type ParsedHeader = {
  date: string;
  status: 'cleared' | 'pending' | 'none';
  payee: string;
};

const HEADER_REGEX = /^(\d{4})[-/](\d{2})[-/](\d{2})\s+([*!]\s+)?(.+?)\s*$/;

export const parseHeader = (line: string): ParsedHeader | null => {
  const m = line.match(HEADER_REGEX);
  if (!m) return null;
  const [, y, mo, d, marker, payeeRaw] = m;
  const payee = payeeRaw.trim();
  if (!payee) return null;
  const status =
    marker?.trim() === '*' ? 'cleared' : marker?.trim() === '!' ? 'pending' : 'none';
  return { date: `${y}-${mo}-${d}`, status, payee };
};
```

- [ ] **Step 4: Run tests, expect pass**

Run: `pnpm test lib/journal/parser.test.ts`
Expected: 7 tests passed.

- [ ] **Step 5: Commit**

```bash
git add lib/journal/parser.ts lib/journal/parser.test.ts
git commit -m "feat(journal): parser parseHeader"
```

---

## Task 4 — Parser: `parsePostingLine`

**Files:**

- Modify: `lib/journal/parser.ts`
- Modify: `lib/journal/parser.test.ts`

- [ ] **Step 1: Append the failing tests**

Append to `lib/journal/parser.test.ts`:

```ts
import { parsePostingLine } from './parser';

describe('parsePostingLine', () => {
  it('parses currency-before amount with space indent', () => {
    expect(parsePostingLine('    Expenses:Food  USD 10')).toEqual({
      account: 'Expenses:Food',
      amount: '10',
      currency: 'USD',
    });
  });

  it('parses currency-after amount with tab indent', () => {
    expect(parsePostingLine('\tExpenses:Family\t322 Kirt')).toEqual({
      account: 'Expenses:Family',
      amount: '322',
      currency: 'Kirt',
    });
  });

  it('strips comma thousands separators', () => {
    expect(parsePostingLine('\tAssets:Bank\t-1,000 Kirt')).toEqual({
      account: 'Assets:Bank',
      amount: '-1000',
      currency: 'Kirt',
    });
  });

  it('parses negative amount', () => {
    expect(parsePostingLine('    Assets:Cash  USD -42.50')).toEqual({
      account: 'Assets:Cash',
      amount: '-42.50',
      currency: 'USD',
    });
  });

  it('returns blank amount for bare-account auto-balance', () => {
    expect(parsePostingLine('    Assets:Bank:Blubank')).toEqual({
      account: 'Assets:Bank:Blubank',
      amount: '',
      currency: '',
    });
  });

  it('handles decimal amounts', () => {
    expect(parsePostingLine('\tAssets:Bank\t65.14 Kirt')).toEqual({
      account: 'Assets:Bank',
      amount: '65.14',
      currency: 'Kirt',
    });
  });

  it('returns null for non-posting lines', () => {
    expect(parsePostingLine('2024-09-01 lunch')).toBeNull();
    expect(parsePostingLine('    ; note')).toBeNull();
    expect(parsePostingLine('')).toBeNull();
  });
});
```

- [ ] **Step 2: Run, expect failures for the new tests**

Run: `pnpm test lib/journal/parser.test.ts`
Expected: 7 failing tests (`parsePostingLine` not exported).

- [ ] **Step 3: Implement `parsePostingLine`**

Append to `lib/journal/parser.ts`:

```ts
export type ParsedPosting = {
  account: string;
  amount: string;
  currency: string;
};

const POSTING_BARE_REGEX = /^\s+([^;\s][^\t]*?)\s*$/;
const POSTING_AMOUNT_REGEX =
  /^\s+([^\t;]+?)(?:\s{2,}|\t+)([^\s;]+\s+[-\d.,]+|[-\d.,]+\s+[^\s;]+)\s*$/;

const stripCommas = (s: string): string => s.replace(/,/g, '');
const isAmount = (s: string): boolean => /^-?\d[\d,]*(?:\.\d+)?$/.test(s);

export const parsePostingLine = (line: string): ParsedPosting | null => {
  const amountMatch = line.match(POSTING_AMOUNT_REGEX);
  if (amountMatch) {
    const [, account, valueRaw] = amountMatch;
    const parts = valueRaw.trim().split(/\s+/);
    if (parts.length !== 2) return null;
    const [first, second] = parts;
    let amount: string, currency: string;
    if (isAmount(first) && !isAmount(second)) {
      amount = stripCommas(first);
      currency = second;
    } else if (!isAmount(first) && isAmount(second)) {
      amount = stripCommas(second);
      currency = first;
    } else {
      return null;
    }
    return { account: account.trim(), amount, currency };
  }
  const bareMatch = line.match(POSTING_BARE_REGEX);
  if (bareMatch) {
    return { account: bareMatch[1].trim(), amount: '', currency: '' };
  }
  return null;
};
```

- [ ] **Step 4: Run tests, expect pass**

Run: `pnpm test lib/journal/parser.test.ts`
Expected: 14 tests passed (7 header + 7 posting).

- [ ] **Step 5: Commit**

```bash
git add lib/journal/parser.ts lib/journal/parser.test.ts
git commit -m "feat(journal): parser parsePostingLine"
```

---

## Task 5 — Parser: `parseBlock`

**Files:**

- Modify: `lib/journal/parser.ts`
- Modify: `lib/journal/parser.test.ts`

- [ ] **Step 1: Append the failing tests**

```ts
import { parseBlock } from './parser';

describe('parseBlock', () => {
  it('parses a basic transaction', () => {
    const block = [
      '2024-09-01 lunch',
      '    Expenses:Food  USD 10',
      '    Assets:Cash',
    ].join('\n');
    const result = parseBlock(block);
    expect(result).not.toBeNull();
    expect(result!.date).toBe('2024-09-01');
    expect(result!.payee).toBe('lunch');
    expect(result!.uid).toBeNull();
    expect(result!.note).toBeNull();
    expect(result!.postings).toEqual([
      { account: 'Expenses:Food', amount: '10', currency: 'USD' },
      { account: 'Assets:Cash', amount: '', currency: '' },
    ]);
  });

  it('extracts UID from a metadata comment line', () => {
    const block = [
      '2024-09-01 lunch',
      '    ; :uid: 01HZX5G5KJDS9HQRYK8E5T0DJC',
      '    Expenses:Food  USD 10',
      '    Assets:Cash',
    ].join('\n');
    const result = parseBlock(block);
    expect(result!.uid).toBe('01HZX5G5KJDS9HQRYK8E5T0DJC');
    expect(result!.note).toBeNull();
  });

  it('collects non-UID comments into note', () => {
    const block = [
      '2024-09-01 lunch',
      '    ; with darya',
      '    ; split the bill',
      '    Expenses:Food  USD 10',
      '    Assets:Cash',
    ].join('\n');
    const result = parseBlock(block);
    expect(result!.note).toBe('with darya\nsplit the bill');
  });

  it('separates UID from note when both present', () => {
    const block = [
      '2024-09-01 lunch',
      '    ; :uid: 01HZX5G5KJDS9HQRYK8E5T0DJC',
      '    ; with darya',
      '    Expenses:Food  USD 10',
      '    Assets:Cash',
    ].join('\n');
    const result = parseBlock(block);
    expect(result!.uid).toBe('01HZX5G5KJDS9HQRYK8E5T0DJC');
    expect(result!.note).toBe('with darya');
  });

  it('returns null when first line is not a header', () => {
    expect(parseBlock('    Expenses:Food  USD 10')).toBeNull();
    expect(parseBlock('')).toBeNull();
  });
});
```

- [ ] **Step 2: Run, expect failures**

Run: `pnpm test lib/journal/parser.test.ts`
Expected: 5 failing tests for `parseBlock`.

- [ ] **Step 3: Implement `parseBlock`**

Append to `lib/journal/parser.ts`:

```ts
import { UID_LINE_REGEX } from './uid';

export type ParsedBlock = {
  uid: string | null;
  date: string;
  status: 'cleared' | 'pending' | 'none';
  payee: string;
  note: string | null;
  postings: ParsedPosting[];
};

const COMMENT_LINE_REGEX = /^\s*;\s?(.*)$/;

export const parseBlock = (block: string): ParsedBlock | null => {
  const lines = block.split('\n');
  if (lines.length === 0) return null;
  const header = parseHeader(lines[0]);
  if (!header) return null;

  let uid: string | null = null;
  const noteLines: string[] = [];
  const postings: ParsedPosting[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '') continue;
    const uidMatch = line.match(UID_LINE_REGEX);
    if (uidMatch) {
      uid = uidMatch[1];
      continue;
    }
    const commentMatch = line.match(COMMENT_LINE_REGEX);
    if (commentMatch) {
      noteLines.push(commentMatch[1].trim());
      continue;
    }
    const posting = parsePostingLine(line);
    if (posting) {
      postings.push(posting);
    }
  }

  return {
    uid,
    date: header.date,
    status: header.status,
    payee: header.payee,
    note: noteLines.length > 0 ? noteLines.join('\n') : null,
    postings,
  };
};
```

- [ ] **Step 4: Run tests, expect pass**

Run: `pnpm test lib/journal/parser.test.ts`
Expected: 19 tests passed.

- [ ] **Step 5: Commit**

```bash
git add lib/journal/parser.ts lib/journal/parser.test.ts
git commit -m "feat(journal): parser parseBlock"
```

---

## Task 6 — Parser: `resolveIncludes`

**Files:**

- Modify: `lib/journal/parser.ts`
- Modify: `lib/journal/parser.test.ts`
- Create: `lib/journal/__fixtures__/includes-basic/main.ledger`
- Create: `lib/journal/__fixtures__/includes-basic/sub.ledger`
- Create: `lib/journal/__fixtures__/includes-cycle/main.ledger`
- Create: `lib/journal/__fixtures__/includes-cycle/other.ledger`

- [ ] **Step 1: Create fixtures**

Create `lib/journal/__fixtures__/includes-basic/main.ledger`:

```
include ./sub.ledger

2024-09-01 main file payee
    Expenses:Food  USD 5
    Assets:Cash
```

Create `lib/journal/__fixtures__/includes-basic/sub.ledger`:

```
2024-09-02 sub file payee
    Expenses:Food  USD 6
    Assets:Cash
```

Create `lib/journal/__fixtures__/includes-cycle/main.ledger`:

```
include ./other.ledger
```

Create `lib/journal/__fixtures__/includes-cycle/other.ledger`:

```
include ./main.ledger
```

- [ ] **Step 2: Append the failing tests**

```ts
import path from 'path';
import { resolveIncludes } from './parser';

const fixturePath = (...parts: string[]) =>
  path.resolve(__dirname, '__fixtures__', ...parts);

describe('resolveIncludes', () => {
  it('returns the main file when there are no includes', async () => {
    const main = fixturePath('includes-basic', 'sub.ledger');
    expect(await resolveIncludes(main)).toEqual([main]);
  });

  it('resolves a single include relative to its host file', async () => {
    const main = fixturePath('includes-basic', 'main.ledger');
    const sub = fixturePath('includes-basic', 'sub.ledger');
    expect(await resolveIncludes(main)).toEqual([main, sub]);
  });

  it('throws on include cycles', async () => {
    const main = fixturePath('includes-cycle', 'main.ledger');
    await expect(resolveIncludes(main)).rejects.toThrow(/cycle/i);
  });
});
```

- [ ] **Step 3: Run, expect failures**

Run: `pnpm test lib/journal/parser.test.ts`
Expected: 3 failing tests for `resolveIncludes`.

- [ ] **Step 4: Implement `resolveIncludes`**

Append to `lib/journal/parser.ts`:

```ts
import { promises as fs } from 'fs';
import path from 'path';

const INCLUDE_LINE_REGEX = /^\s*include\s+(\S.*?)\s*$/;

export const resolveIncludes = async (mainPath: string): Promise<string[]> => {
  const seen = new Set<string>();
  const order: string[] = [];

  const visit = async (filePath: string, stack: string[]): Promise<void> => {
    const abs = path.resolve(filePath);
    if (stack.includes(abs)) {
      throw new Error(`Include cycle detected: ${[...stack, abs].join(' -> ')}`);
    }
    if (seen.has(abs)) return;
    seen.add(abs);
    order.push(abs);
    const text = await fs.readFile(abs, 'utf-8');
    for (const line of text.split('\n')) {
      const m = line.match(INCLUDE_LINE_REGEX);
      if (m) {
        const target = path.resolve(path.dirname(abs), m[1]);
        await visit(target, [...stack, abs]);
      }
    }
  };

  await visit(mainPath, []);
  return order;
};
```

- [ ] **Step 5: Run tests, expect pass**

Run: `pnpm test lib/journal/parser.test.ts`
Expected: 22 tests passed.

- [ ] **Step 6: Commit**

```bash
git add lib/journal/parser.ts lib/journal/parser.test.ts lib/journal/__fixtures__
git commit -m "feat(journal): parser resolveIncludes"
```

---

## Task 7 — Parser: `parseJournal`

**Files:**

- Modify: `lib/journal/parser.ts`
- Modify: `lib/journal/parser.test.ts`
- Create: `lib/journal/__fixtures__/realistic/main.ledger`
- Create: `lib/journal/__fixtures__/realistic/q1.ledger`

- [ ] **Step 1: Create fixture mirroring the user's data style**

Create `lib/journal/__fixtures__/realistic/main.ledger`:

```
include ./q1.ledger

2024/09/01 lunch - darya
	Expenses:Restaurant
	Assets:Credited:Hooman                              168 Kirt
	Expenses:Family                                     275 Kirt
	Assets:Bank:Blubank                              -1,000 Kirt

2024-09-02 * Trader Joe's
    ; :uid: 01HZX5G5KJDS9HQRYK8E5T0DJC
    ; weekly groceries
    Expenses:Food_Groceries  USD 42.50
    Assets:Cash
```

Create `lib/journal/__fixtures__/realistic/q1.ledger`:

```
2024-01-15 rent
	Expenses:Rent\t1500 USD
	Assets:Bank
```

Note: the `\t1500 USD` above is for documentation; in the actual file write a real tab character before `1500`.

- [ ] **Step 2: Append the failing tests**

```ts
import { parseJournal } from './parser';

describe('parseJournal', () => {
  it('parses multi-file journals with includes', async () => {
    const main = fixturePath('realistic', 'main.ledger');
    const result = await parseJournal(main);
    expect(result.transactions).toHaveLength(3);
    expect(result.files.map((f) => path.basename(f.path))).toEqual([
      'main.ledger',
      'q1.ledger',
    ]);
  });

  it('normalizes slash dates to dashes', async () => {
    const main = fixturePath('realistic', 'main.ledger');
    const { transactions } = await parseJournal(main);
    const lunch = transactions.find((t) => t.payee === 'lunch - darya');
    expect(lunch?.date).toBe('2024-09-01');
  });

  it('strips comma thousands in amounts', async () => {
    const main = fixturePath('realistic', 'main.ledger');
    const { transactions } = await parseJournal(main);
    const lunch = transactions.find((t) => t.payee === 'lunch - darya')!;
    const bank = lunch.postings.find((p) => p.account === 'Assets:Bank:Blubank');
    expect(bank?.amount).toBe('-1000');
  });

  it('preserves UID from source', async () => {
    const main = fixturePath('realistic', 'main.ledger');
    const { transactions } = await parseJournal(main);
    const tj = transactions.find((t) => t.payee === "Trader Joe's");
    expect(tj?.uid).toBe('01HZX5G5KJDS9HQRYK8E5T0DJC');
  });

  it('attaches source coordinates', async () => {
    const main = fixturePath('realistic', 'main.ledger');
    const { transactions } = await parseJournal(main);
    for (const tx of transactions) {
      expect(tx.startLine).toBeGreaterThan(0);
      expect(tx.endLine).toBeGreaterThanOrEqual(tx.startLine);
      expect(tx.rawBlock.length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 3: Run, expect failures**

Run: `pnpm test lib/journal/parser.test.ts`
Expected: 5 failing tests for `parseJournal`.

- [ ] **Step 4: Implement `parseJournal`**

Append to `lib/journal/parser.ts`:

```ts
export type Transaction = {
  uid: string | null;
  file: string;
  startLine: number;
  endLine: number;
  date: string;
  payee: string;
  status: 'cleared' | 'pending' | 'none';
  note: string | null;
  postings: ParsedPosting[];
  rawBlock: string;
};

export type ParsedJournal = {
  files: Array<{ path: string; mtimeMs: number }>;
  transactions: Transaction[];
};

const HEADER_START_REGEX = /^\d{4}[-/]\d{2}[-/]\d{2}/;

export const parseJournalFile = (
  filePath: string,
  text: string
): Transaction[] => {
  const lines = text.split('\n');
  const transactions: Transaction[] = [];
  let blockStart: number | null = null;
  let blockLines: string[] = [];

  const flush = (endLine: number) => {
    if (blockStart === null) return;
    const block = parseBlock(blockLines.join('\n'));
    if (block) {
      transactions.push({
        uid: block.uid,
        file: filePath,
        startLine: blockStart + 1,
        endLine: endLine + 1,
        date: block.date,
        payee: block.payee,
        status: block.status,
        note: block.note,
        postings: block.postings,
        rawBlock: blockLines.join('\n'),
      });
    }
    blockStart = null;
    blockLines = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (blockStart === null) {
      if (HEADER_START_REGEX.test(line)) {
        blockStart = i;
        blockLines = [line];
      }
      continue;
    }
    if (line.trim() === '') {
      flush(i - 1);
      continue;
    }
    blockLines.push(line);
  }
  flush(lines.length - 1);
  return transactions;
};

export const parseJournal = async (mainPath: string): Promise<ParsedJournal> => {
  const filePaths = await resolveIncludes(mainPath);
  const files: Array<{ path: string; mtimeMs: number }> = [];
  const transactions: Transaction[] = [];
  for (const filePath of filePaths) {
    const [stat, text] = await Promise.all([
      fs.stat(filePath),
      fs.readFile(filePath, 'utf-8'),
    ]);
    files.push({ path: filePath, mtimeMs: stat.mtimeMs });
    transactions.push(...parseJournalFile(filePath, text));
  }
  return { files, transactions };
};
```

- [ ] **Step 5: Run tests, expect pass**

Run: `pnpm test lib/journal/parser.test.ts`
Expected: 27 tests passed.

- [ ] **Step 6: Commit**

```bash
git add lib/journal/parser.ts lib/journal/parser.test.ts lib/journal/__fixtures__/realistic
git commit -m "feat(journal): parseJournal end-to-end"
```

---

## Task 8 — Backfill module (`lib/journal/backfill.ts`)

**Files:**

- Create: `lib/journal/backfill.ts`
- Test: `lib/journal/backfill.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { backfillJournalFile } from './backfill';
import { findUidInBlock } from './uid';
import { parseJournalFile } from './parser';

const tmpdir = async () => fs.mkdtemp(path.join(os.tmpdir(), 'backfill-'));

describe('backfillJournalFile', () => {
  it('inserts UID into every block lacking one', async () => {
    const dir = await tmpdir();
    const file = path.join(dir, 'a.ledger');
    await fs.writeFile(
      file,
      [
        '2024-09-01 lunch',
        '    Expenses:Food  USD 10',
        '    Assets:Cash',
        '',
        '2024-09-02 coffee',
        '    Expenses:Coffee  USD 4',
        '    Assets:Cash',
        '',
      ].join('\n')
    );
    const result = await backfillJournalFile(file);
    expect(result.uidsAdded).toBe(2);
    const text = await fs.readFile(file, 'utf-8');
    const txs = parseJournalFile(file, text);
    expect(txs.every((t) => t.uid !== null)).toBe(true);
  });

  it('is idempotent on a fully migrated file', async () => {
    const dir = await tmpdir();
    const file = path.join(dir, 'a.ledger');
    await fs.writeFile(
      file,
      [
        '2024-09-01 lunch',
        '    ; :uid: 01HZX5G5KJDS9HQRYK8E5T0DJC',
        '    Expenses:Food  USD 10',
        '    Assets:Cash',
        '',
      ].join('\n')
    );
    const result = await backfillJournalFile(file);
    expect(result.uidsAdded).toBe(0);
    expect(result.fileTouched).toBe(false);
  });

  it('preserves byte-for-byte content outside the UID insertion', async () => {
    const dir = await tmpdir();
    const file = path.join(dir, 'a.ledger');
    const original = '2024/09/01 lunch\n\tExpenses:Food\t10 USD\n\tAssets:Cash\n';
    await fs.writeFile(file, original);
    await backfillJournalFile(file);
    const text = await fs.readFile(file, 'utf-8');
    const uid = findUidInBlock(text);
    expect(uid).not.toBeNull();
    const lines = text.split('\n');
    expect(lines[0]).toBe('2024/09/01 lunch');
    expect(lines[2]).toBe('\tExpenses:Food\t10 USD');
    expect(lines[3]).toBe('\tAssets:Cash');
    expect(lines[1]).toBe(`\t; :uid: ${uid}`);
  });

  it('matches first-posting indent (4-space)', async () => {
    const dir = await tmpdir();
    const file = path.join(dir, 'a.ledger');
    await fs.writeFile(
      file,
      '2024-09-01 lunch\n    Expenses:Food  USD 10\n    Assets:Cash\n'
    );
    await backfillJournalFile(file);
    const text = await fs.readFile(file, 'utf-8');
    const lines = text.split('\n');
    expect(lines[1]).toMatch(/^    ; :uid: /);
  });
});
```

- [ ] **Step 2: Run, expect failures**

Run: `pnpm test lib/journal/backfill.test.ts`
Expected: module not found.

- [ ] **Step 3: Implement backfill**

Create `lib/journal/backfill.ts`:

```ts
import { promises as fs } from 'fs';
import path from 'path';
import 'server-only';
import { resolveUserJournal } from '@/lib/journals';
import {
  detectFirstPostingIndent,
  findUidInBlock,
  generateUid,
} from './uid';
import { resolveIncludes } from './parser';

const HEADER_START_REGEX = /^\d{4}[-/]\d{2}[-/]\d{2}/;

export type BackfillFileResult = {
  uidsAdded: number;
  fileTouched: boolean;
};

export const backfillJournalFile = async (
  filePath: string
): Promise<BackfillFileResult> => {
  const original = await fs.readFile(filePath, 'utf-8');
  const lines = original.split('\n');
  const output: string[] = [];
  let inBlock = false;
  let blockBuf: string[] = [];
  let uidsAdded = 0;

  const flushBlock = () => {
    if (blockBuf.length === 0) return;
    const blockText = blockBuf.join('\n');
    if (findUidInBlock(blockText) === null) {
      const indent = detectFirstPostingIndent(blockBuf);
      const uidLine = `${indent}; :uid: ${generateUid()}`;
      output.push(blockBuf[0], uidLine, ...blockBuf.slice(1));
      uidsAdded++;
    } else {
      output.push(...blockBuf);
    }
    blockBuf = [];
    inBlock = false;
  };

  for (const line of lines) {
    if (!inBlock) {
      if (HEADER_START_REGEX.test(line)) {
        inBlock = true;
        blockBuf = [line];
      } else {
        output.push(line);
      }
      continue;
    }
    if (line.trim() === '') {
      flushBlock();
      output.push(line);
      continue;
    }
    blockBuf.push(line);
  }
  flushBlock();

  const next = output.join('\n');
  if (next === original) {
    return { uidsAdded: 0, fileTouched: false };
  }
  const tmp = filePath + '.tmp';
  await fs.writeFile(tmp, next, 'utf-8');
  await fs.rename(tmp, filePath);
  return { uidsAdded, fileTouched: true };
};

export type BackfillResult = {
  filesTouched: number;
  uidsAdded: number;
};

export const backfillUids = async (userId: string): Promise<BackfillResult> => {
  const { mainPath } = await resolveUserJournal(userId);
  const files = await resolveIncludes(mainPath);
  let filesTouched = 0;
  let uidsAdded = 0;
  for (const file of files) {
    const result = await backfillJournalFile(file);
    if (result.fileTouched) filesTouched++;
    uidsAdded += result.uidsAdded;
  }
  return { filesTouched, uidsAdded };
};
```

- [ ] **Step 4: Run tests, expect pass**

Run: `pnpm test lib/journal/backfill.test.ts`
Expected: 4 tests passed.

- [ ] **Step 5: Commit**

```bash
git add lib/journal/backfill.ts lib/journal/backfill.test.ts
git commit -m "feat(journal): UID backfill module"
```

---

## Task 9 — Wire backfill into `/import`

**Files:**

- Modify: `lib/journals.ts`

- [ ] **Step 1: Read the current import functions**

Open `lib/journals.ts`, find `replaceJournalFromSingleFile` and `replaceJournalFromZip`. Both end with `await setJournalMain(...)`.

- [ ] **Step 2: Import backfill**

At the top of `lib/journals.ts` (with the other imports):

```ts
import { backfillUids } from '@/lib/journal/backfill';
```

- [ ] **Step 3: Call backfill at the end of `replaceJournalFromSingleFile`**

Modify the function to return `BackfillResult` info:

```ts
export const replaceJournalFromSingleFile = async (
  userId: string,
  content: Buffer
): Promise<{ uidsAdded: number }> => {
  const dir = getJournalDir(userId);
  await emptyDir(dir);
  await fs.writeFile(path.join(dir, DEFAULT_MAIN), content);
  await setJournalMain(userId, DEFAULT_MAIN);
  const backfill = await backfillUids(userId);
  return { uidsAdded: backfill.uidsAdded };
};
```

- [ ] **Step 4: Call backfill in `replaceJournalFromZip`**

Modify the return shape:

```ts
export const replaceJournalFromZip = async (
  userId: string,
  buffer: Buffer
): Promise<{ mainFile: string; fileCount: number; uidsAdded: number }> => {
  // ... existing body unchanged ...
  const mainFile = detectMain(entries.map((e) => ({ name: e.entryName })));
  await setJournalMain(userId, mainFile);
  const backfill = await backfillUids(userId);
  return { mainFile, fileCount: entries.length, uidsAdded: backfill.uidsAdded };
};
```

- [ ] **Step 5: Update the upload API to surface the count**

In `app/api/upload/route.ts`, update both response builders. Replace the archive branch:

```ts
if (ext === ZIP_EXT) {
  const result = await replaceJournalFromZip(user.id, buffer);
  revalidatePath('/', 'layout');
  return NextResponse.json({
    ok: true,
    mode: 'archive',
    mainFile: result.mainFile,
    fileCount: result.fileCount,
    uidsAdded: result.uidsAdded,
    bytes: buffer.length,
  });
}
```

And the single-file branch:

```ts
if (ALLOWED_SINGLE_EXTS.has(ext)) {
  const result = await replaceJournalFromSingleFile(user.id, buffer);
  revalidatePath('/', 'layout');
  return NextResponse.json({
    ok: true,
    mode: 'single',
    uidsAdded: result.uidsAdded,
    bytes: buffer.length,
  });
}
```

- [ ] **Step 6: Update the /import page success toast**

In `app/import/page.tsx`, extend the `UploadResult` type and the `description` builder:

```ts
type UploadResult = {
  ok: boolean;
  mode?: 'single' | 'archive';
  mainFile?: string;
  fileCount?: number;
  uidsAdded?: number;
  bytes?: number;
  error?: string;
};
```

```ts
const tagged =
  result.uidsAdded && result.uidsAdded > 0
    ? `, ${result.uidsAdded} transaction${result.uidsAdded === 1 ? '' : 's'} tagged`
    : '';
const description =
  result.mode === 'archive'
    ? `Imported ${result.fileCount} file${result.fileCount === 1 ? '' : 's'}${tagged}. Main file: ${result.mainFile}.`
    : `Imported ${(result.bytes ?? 0).toLocaleString()} bytes${tagged}. Reports refresh on next view.`;
setMessage(description);
toast.success('Journal imported', { description });
```

- [ ] **Step 7: Type-check**

Run: `pnpm type-check`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add lib/journals.ts app/api/upload/route.ts app/import/page.tsx
git commit -m "feat(import): backfill UIDs after journal import"
```

---

## Task 10 — Add `uid` to `TransactionDraft` schema and `formatTransaction`

**Files:**

- Modify: `lib/transactions/schema.ts`
- Create: `lib/transactions/schema.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/transactions/schema.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { formatTransaction, transactionDraftSchema } from './schema';

describe('transactionDraftSchema with uid', () => {
  it('accepts a valid ULID', () => {
    const result = transactionDraftSchema.safeParse({
      date: '2024-09-01',
      payee: 'lunch',
      status: 'none',
      uid: '01HZX5G5KJDS9HQRYK8E5T0DJC',
      postings: [
        { account: 'Expenses:Food', amount: '10', currency: 'USD' },
        { account: 'Assets:Cash', amount: '-10', currency: 'USD' },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid uid format', () => {
    const result = transactionDraftSchema.safeParse({
      date: '2024-09-01',
      payee: 'lunch',
      status: 'none',
      uid: 'not-a-ulid',
      postings: [
        { account: 'Expenses:Food', amount: '10', currency: 'USD' },
        { account: 'Assets:Cash', amount: '-10', currency: 'USD' },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('uid is optional', () => {
    const result = transactionDraftSchema.safeParse({
      date: '2024-09-01',
      payee: 'lunch',
      status: 'none',
      postings: [
        { account: 'Expenses:Food', amount: '10', currency: 'USD' },
        { account: 'Assets:Cash', amount: '-10', currency: 'USD' },
      ],
    });
    expect(result.success).toBe(true);
  });
});

describe('formatTransaction with uid', () => {
  it('emits UID metadata line after the header', () => {
    const output = formatTransaction({
      date: '2024-09-01',
      payee: 'lunch',
      status: 'none',
      uid: '01HZX5G5KJDS9HQRYK8E5T0DJC',
      postings: [
        { account: 'Expenses:Food', amount: '10', currency: 'USD' },
        { account: 'Assets:Cash', amount: '-10', currency: 'USD' },
      ],
    });
    const lines = output.split('\n');
    expect(lines[0]).toBe('2024-09-01 lunch');
    expect(lines[1]).toBe('    ; :uid: 01HZX5G5KJDS9HQRYK8E5T0DJC');
  });

  it('emits no UID line when uid is absent', () => {
    const output = formatTransaction({
      date: '2024-09-01',
      payee: 'lunch',
      status: 'none',
      postings: [
        { account: 'Expenses:Food', amount: '10', currency: 'USD' },
        { account: 'Assets:Cash', amount: '-10', currency: 'USD' },
      ],
    });
    expect(output.split('\n').some((l) => l.includes(':uid:'))).toBe(false);
  });
});
```

- [ ] **Step 2: Run, expect failures**

Run: `pnpm test lib/transactions/schema.test.ts`

- [ ] **Step 3: Modify schema to accept `uid`**

In `lib/transactions/schema.ts`, add a uid schema after the existing `currencySchema`:

```ts
const uidSchema = z
  .string()
  .regex(/^[0-9A-HJKMNP-TV-Z]{26}$/, 'uid must be a 26-character Crockford ULID')
  .optional();
```

Modify `transactionDraftSchema` to include `uid: uidSchema`:

```ts
export const transactionDraftSchema = z
  .object({
    date: dateSchema,
    payee: payeeSchema,
    status: z.enum(['cleared', 'pending', 'none']).default('none'),
    note: noteSchema,
    uid: uidSchema,
    postings: z
      .array(postingSchema)
      .min(MIN_POSTINGS, `At least ${MIN_POSTINGS} postings are required`)
      .max(MAX_POSTINGS, `At most ${MAX_POSTINGS} postings are allowed`),
  })
  .superRefine(/* existing body unchanged */);
```

- [ ] **Step 4: Update `formatTransaction` to emit the UID line**

Replace the function with:

```ts
export const formatTransaction = (draft: TransactionDraft): string => {
  const header = `${draft.date}${statusMarker(draft.status)} ${draft.payee}`;
  const uidLines = draft.uid ? [`    ; :uid: ${draft.uid}`] : [];
  const noteLines = (draft.note ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `    ; ${line}`);
  const postings = draft.postings.map(formatPosting);
  return [header, ...uidLines, ...noteLines, ...postings].join('\n');
};
```

- [ ] **Step 5: Run tests, expect pass**

Run: `pnpm test lib/transactions/schema.test.ts`
Expected: 5 tests passed.

- [ ] **Step 6: Commit**

```bash
git add lib/transactions/schema.ts lib/transactions/schema.test.ts
git commit -m "feat(schema): support uid on TransactionDraft"
```

---

## Task 11 — `addTransaction` stamps UIDs on new blocks

**Files:**

- Modify: `lib/journals.ts`
- Create: `lib/journals.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/journals.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { findUidInBlock } from '@/lib/journal/uid';

describe('addTransaction', () => {
  it('stamps a ULID on the new block', async () => {
    // Set DATA_DIR before importing modules that read it
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'journals-'));
    process.env.DATA_DIR = tmp;
    process.env.BETTER_AUTH_SECRET = 'x'.repeat(32);
    const { addTransaction, getJournalDir } = await import('@/lib/journals');
    const userId = 'test-user';
    await fs.mkdir(getJournalDir(userId), { recursive: true });

    const result = await addTransaction(userId, {
      date: '2024-09-01',
      payee: 'lunch',
      status: 'none',
      postings: [
        { account: 'Expenses:Food', amount: '10', currency: 'USD' },
        { account: 'Assets:Cash', amount: '-10', currency: 'USD' },
      ],
    });
    expect(result.ok).toBe(true);
    const text = await fs.readFile(
      path.join(getJournalDir(userId), 'main.ledger'),
      'utf-8'
    );
    expect(findUidInBlock(text)).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run, expect failure**

Run: `pnpm test lib/journals.test.ts`

- [ ] **Step 3: Modify `addTransaction` to stamp a UID**

In `lib/journals.ts`, change the `addTransaction` function body (just the part after the Zod parse):

```ts
const draft: TransactionDraft = { ...parsed.data, uid: generateUid() };
const { mainPath } = await ensureJournal(userId);
```

Add the import:

```ts
import { generateUid } from '@/lib/journal/uid';
```

The rest of the function is unchanged — `formatTransaction(draft)` will now emit the UID line.

- [ ] **Step 4: Run test, expect pass**

Run: `pnpm test lib/journals.test.ts`
Expected: 1 test passed.

- [ ] **Step 5: Commit**

```bash
git add lib/journals.ts lib/journals.test.ts
git commit -m "feat(journal): stamp ULID when appending new transactions"
```

---

## Task 12 — Per-user mutex (`lib/journal/mutex.ts`)

**Files:**

- Create: `lib/journal/mutex.ts`
- Test: `lib/journal/mutex.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { withUserLock } from './mutex';

describe('withUserLock', () => {
  it('serializes overlapping calls for the same userId', async () => {
    const order: string[] = [];
    const slow = withUserLock('alice', async () => {
      order.push('slow-start');
      await new Promise((r) => setTimeout(r, 25));
      order.push('slow-end');
      return 1;
    });
    const fast = withUserLock('alice', async () => {
      order.push('fast-start');
      order.push('fast-end');
      return 2;
    });
    expect(await Promise.all([slow, fast])).toEqual([1, 2]);
    expect(order).toEqual(['slow-start', 'slow-end', 'fast-start', 'fast-end']);
  });

  it('runs different userIds in parallel', async () => {
    const order: string[] = [];
    const alice = withUserLock('alice', async () => {
      order.push('alice-start');
      await new Promise((r) => setTimeout(r, 25));
      order.push('alice-end');
    });
    const bob = withUserLock('bob', async () => {
      order.push('bob-start');
      order.push('bob-end');
    });
    await Promise.all([alice, bob]);
    expect(order[0]).toBe('alice-start');
    expect(order[1]).toBe('bob-start');
  });
});
```

- [ ] **Step 2: Run, expect failure**

Run: `pnpm test lib/journal/mutex.test.ts`

- [ ] **Step 3: Implement the mutex**

Create `lib/journal/mutex.ts`:

```ts
const tails: Map<string, Promise<unknown>> = new Map();

export const withUserLock = async <T>(
  userId: string,
  fn: () => Promise<T>
): Promise<T> => {
  const prev = tails.get(userId) ?? Promise.resolve();
  const run = prev.then(fn, fn);
  tails.set(
    userId,
    run.catch(() => undefined)
  );
  return run;
};
```

- [ ] **Step 4: Run tests, expect pass**

Run: `pnpm test lib/journal/mutex.test.ts`
Expected: 2 tests passed.

- [ ] **Step 5: Commit**

```bash
git add lib/journal/mutex.ts lib/journal/mutex.test.ts
git commit -m "feat(journal): per-user async mutex"
```

---

## Task 13 — Fingerprint (`lib/journal/fingerprint.ts`)

**Files:**

- Create: `lib/journal/fingerprint.ts`
- Test: `lib/journal/fingerprint.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { fingerprintDraft } from './fingerprint';

describe('fingerprintDraft', () => {
  const base = {
    date: '2024-09-01',
    payee: 'lunch',
    status: 'none' as const,
    uid: '01HZX5G5KJDS9HQRYK8E5T0DJC',
    postings: [
      { account: 'Expenses:Food', amount: '10', currency: 'USD' },
      { account: 'Assets:Cash', amount: '-10', currency: 'USD' },
    ],
  };

  it('returns a 64-char hex string', () => {
    const fp = fingerprintDraft(base);
    expect(fp).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is stable across identical drafts', () => {
    expect(fingerprintDraft(base)).toBe(fingerprintDraft(base));
  });

  it('changes when any field changes', () => {
    const baseFp = fingerprintDraft(base);
    expect(fingerprintDraft({ ...base, payee: 'dinner' })).not.toBe(baseFp);
    expect(
      fingerprintDraft({
        ...base,
        postings: [...base.postings.slice(0, 1), { ...base.postings[1], amount: '-11' }],
      })
    ).not.toBe(baseFp);
  });
});
```

- [ ] **Step 2: Run, expect failure**

Run: `pnpm test lib/journal/fingerprint.test.ts`

- [ ] **Step 3: Implement fingerprint**

Create `lib/journal/fingerprint.ts`:

```ts
import { createHash } from 'crypto';
import { formatTransaction } from '@/lib/transactions/schema';
import type { TransactionDraft } from '@/lib/transactions/schema';

export const fingerprintDraft = (draft: TransactionDraft): string =>
  createHash('sha256').update(formatTransaction(draft)).digest('hex');
```

- [ ] **Step 4: Run tests, expect pass**

Run: `pnpm test lib/journal/fingerprint.test.ts`
Expected: 3 tests passed.

- [ ] **Step 5: Commit**

```bash
git add lib/journal/fingerprint.ts lib/journal/fingerprint.test.ts
git commit -m "feat(journal): transaction fingerprint helper"
```

---

## Task 14 — `writeJournal`: edit path

**Files:**

- Create: `lib/journal/write.ts`
- Test: `lib/journal/write.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

describe('writeJournal — edit', () => {
  it('rewrites only the target block; rest byte-exact', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'write-'));
    process.env.DATA_DIR = tmp;
    process.env.BETTER_AUTH_SECRET = 'x'.repeat(32);
    const { getJournalDir } = await import('@/lib/journals');
    const userId = 'test-user';
    const dir = getJournalDir(userId);
    await fs.mkdir(dir, { recursive: true });
    const before =
      '; header comment\n\n' +
      '2024-09-01 lunch\n' +
      '    ; :uid: 01HZX5G5KJDS9HQRYK8E5T0DJC\n' +
      '    Expenses:Food                            USD 10\n' +
      '    Assets:Cash                              USD -10\n' +
      '\n' +
      '2024-09-02 coffee\n' +
      '    ; :uid: 01HZX5G5KJDS9HQRYK8E5T0DKZ\n' +
      '    Expenses:Coffee                          USD 4\n' +
      '    Assets:Cash                              USD -4\n';
    await fs.writeFile(path.join(dir, 'main.ledger'), before);

    const { writeJournal } = await import('./write');
    const { fingerprintDraft } = await import('./fingerprint');
    const draftBefore = {
      date: '2024-09-01',
      payee: 'lunch',
      status: 'none' as const,
      uid: '01HZX5G5KJDS9HQRYK8E5T0DJC',
      postings: [
        { account: 'Expenses:Food', amount: '10', currency: 'USD' },
        { account: 'Assets:Cash', amount: '-10', currency: 'USD' },
      ],
    };
    const fp = fingerprintDraft(draftBefore);

    const result = await writeJournal(userId, {
      kind: 'edit',
      uid: '01HZX5G5KJDS9HQRYK8E5T0DJC',
      expectedFingerprint: fp,
      draft: {
        ...draftBefore,
        postings: [
          { account: 'Expenses:Food', amount: '12', currency: 'USD' },
          { account: 'Assets:Cash', amount: '-12', currency: 'USD' },
        ],
      },
    });
    expect(result.ok).toBe(true);

    const after = await fs.readFile(path.join(dir, 'main.ledger'), 'utf-8');
    expect(after).toContain('USD 12');
    expect(after).toContain('USD -12');
    expect(after).toContain('2024-09-02 coffee');
    expect(after).toContain('USD 4');
    // Header comment and trailing block untouched
    expect(after.startsWith('; header comment\n\n')).toBe(true);
  });

  it('returns stale when fingerprint does not match', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'write-'));
    process.env.DATA_DIR = tmp;
    process.env.BETTER_AUTH_SECRET = 'x'.repeat(32);
    const { getJournalDir } = await import('@/lib/journals');
    const userId = 'test-user';
    const dir = getJournalDir(userId);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, 'main.ledger'),
      '2024-09-01 lunch\n    ; :uid: 01HZX5G5KJDS9HQRYK8E5T0DJC\n    Expenses:Food  USD 10\n    Assets:Cash\n'
    );
    const { writeJournal } = await import('./write');
    const result = await writeJournal(userId, {
      kind: 'edit',
      uid: '01HZX5G5KJDS9HQRYK8E5T0DJC',
      expectedFingerprint: 'deadbeef'.repeat(8),
      draft: {
        date: '2024-09-01',
        payee: 'lunch',
        status: 'none',
        uid: '01HZX5G5KJDS9HQRYK8E5T0DJC',
        postings: [
          { account: 'Expenses:Food', amount: '12', currency: 'USD' },
          { account: 'Assets:Cash', amount: '-12', currency: 'USD' },
        ],
      },
    });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe('stale');
  });

  it('returns not-found for unknown uid', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'write-'));
    process.env.DATA_DIR = tmp;
    process.env.BETTER_AUTH_SECRET = 'x'.repeat(32);
    const { getJournalDir } = await import('@/lib/journals');
    const userId = 'test-user';
    await fs.mkdir(getJournalDir(userId), { recursive: true });
    await fs.writeFile(
      path.join(getJournalDir(userId), 'main.ledger'),
      '2024-09-01 lunch\n    Expenses:Food  USD 10\n    Assets:Cash\n'
    );
    const { writeJournal } = await import('./write');
    const result = await writeJournal(userId, {
      kind: 'edit',
      uid: '01HZX5G5KJDS9HQRYK8E5T0XXX',
      expectedFingerprint: 'deadbeef'.repeat(8),
      draft: {
        date: '2024-09-01',
        payee: 'lunch',
        status: 'none',
        uid: '01HZX5G5KJDS9HQRYK8E5T0XXX',
        postings: [
          { account: 'Expenses:Food', amount: '10', currency: 'USD' },
          { account: 'Assets:Cash', amount: '-10', currency: 'USD' },
        ],
      },
    });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe('not-found');
  });
});
```

- [ ] **Step 2: Run, expect failures**

Run: `pnpm test lib/journal/write.test.ts`

- [ ] **Step 3: Implement `writeJournal` (edit path only this task)**

Create `lib/journal/write.ts`:

```ts
import { promises as fs } from 'fs';
import 'server-only';
import { revalidatePath, updateTag } from 'next/cache';
import { getJournalCacheTag, resolveUserJournal } from '@/lib/journals';
import {
  formatTransaction,
  transactionDraftSchema,
  type TransactionDraft,
} from '@/lib/transactions/schema';
import { fingerprintDraft } from './fingerprint';
import { withUserLock } from './mutex';
import { parseJournal, parseJournalFile } from './parser';

export type WriteEditInput = {
  kind: 'edit';
  uid: string;
  expectedFingerprint: string;
  draft: TransactionDraft;
};

export type WriteDeleteInput = {
  kind: 'delete';
  uid: string;
  expectedFingerprint: string;
};

export type WriteInput = WriteEditInput | WriteDeleteInput;

export type WriteResult =
  | { ok: true }
  | {
      ok: false;
      reason: 'not-found' | 'stale' | 'invalid';
      message: string;
      fieldErrors?: Record<string, string>;
    };

const writeFileAtomic = async (filePath: string, content: string) => {
  const tmp = filePath + '.tmp';
  await fs.writeFile(tmp, content, 'utf-8');
  await fs.rename(tmp, filePath);
};

const performEdit = async (
  userId: string,
  input: WriteEditInput
): Promise<WriteResult> => {
  if (input.uid !== input.draft.uid) {
    return {
      ok: false,
      reason: 'invalid',
      message: 'Submitted uid does not match the transaction being edited.',
    };
  }
  const parsedDraft = transactionDraftSchema.safeParse(input.draft);
  if (!parsedDraft.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsedDraft.error.issues) {
      const key = issue.path.join('.') || 'form';
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return {
      ok: false,
      reason: 'invalid',
      message: 'Validation failed.',
      fieldErrors,
    };
  }

  const { mainPath } = await resolveUserJournal(userId);
  const journal = await parseJournal(mainPath);
  const tx = journal.transactions.find((t) => t.uid === input.uid);
  if (!tx) {
    return { ok: false, reason: 'not-found', message: 'Transaction not found.' };
  }

  const text = await fs.readFile(tx.file, 'utf-8');
  const fileTxs = parseJournalFile(tx.file, text);
  const current = fileTxs.find((t) => t.uid === input.uid);
  if (!current) {
    return { ok: false, reason: 'not-found', message: 'Transaction not found.' };
  }

  const currentFingerprint = fingerprintDraft({
    date: current.date,
    payee: current.payee,
    status: current.status,
    note: current.note ?? undefined,
    uid: current.uid ?? undefined,
    postings: current.postings,
  });
  if (currentFingerprint !== input.expectedFingerprint) {
    return {
      ok: false,
      reason: 'stale',
      message: 'This transaction was modified somewhere else.',
    };
  }

  const newBlock = formatTransaction(parsedDraft.data);
  const lines = text.split('\n');
  const before = lines.slice(0, current.startLine - 1).join('\n');
  const after = lines.slice(current.endLine).join('\n');
  const next =
    (before ? before + '\n' : '') + newBlock + (after ? '\n' + after : '');
  await writeFileAtomic(tx.file, next);

  updateTag(getJournalCacheTag(userId));
  revalidatePath('/', 'layout');
  return { ok: true };
};

export const writeJournal = async (
  userId: string,
  input: WriteInput
): Promise<WriteResult> =>
  withUserLock(userId, async () => {
    if (input.kind === 'edit') return performEdit(userId, input);
    throw new Error('delete not yet implemented');
  });
```

- [ ] **Step 4: Run tests, expect pass**

Run: `pnpm test lib/journal/write.test.ts`
Expected: 3 tests passed.

- [ ] **Step 5: Commit**

```bash
git add lib/journal/write.ts lib/journal/write.test.ts
git commit -m "feat(journal): writeJournal edit path"
```

---

## Task 15 — `writeJournal`: delete path

**Files:**

- Modify: `lib/journal/write.ts`
- Modify: `lib/journal/write.test.ts`

- [ ] **Step 1: Append failing tests**

```ts
describe('writeJournal — delete', () => {
  const setup = async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'write-del-'));
    process.env.DATA_DIR = tmp;
    process.env.BETTER_AUTH_SECRET = 'x'.repeat(32);
    const { getJournalDir } = await import('@/lib/journals');
    const userId = 'test-user';
    const dir = getJournalDir(userId);
    await fs.mkdir(dir, { recursive: true });
    return { userId, dir };
  };

  it('removes the block plus the trailing blank line', async () => {
    const { userId, dir } = await setup();
    const before =
      '2024-09-01 lunch\n' +
      '    ; :uid: 01HZX5G5KJDS9HQRYK8E5T0DJC\n' +
      '    Expenses:Food  USD 10\n' +
      '    Assets:Cash\n' +
      '\n' +
      '2024-09-02 coffee\n' +
      '    Expenses:Coffee  USD 4\n' +
      '    Assets:Cash\n';
    await fs.writeFile(path.join(dir, 'main.ledger'), before);

    const { writeJournal } = await import('./write');
    const { fingerprintDraft } = await import('./fingerprint');
    const draft = {
      date: '2024-09-01',
      payee: 'lunch',
      status: 'none' as const,
      uid: '01HZX5G5KJDS9HQRYK8E5T0DJC',
      postings: [
        { account: 'Expenses:Food', amount: '10', currency: 'USD' },
        { account: 'Assets:Cash', amount: '', currency: '' },
      ],
    };
    const result = await writeJournal(userId, {
      kind: 'delete',
      uid: '01HZX5G5KJDS9HQRYK8E5T0DJC',
      expectedFingerprint: fingerprintDraft(draft),
    });
    expect(result.ok).toBe(true);
    const after = await fs.readFile(path.join(dir, 'main.ledger'), 'utf-8');
    expect(after).toBe(
      '2024-09-02 coffee\n    Expenses:Coffee  USD 4\n    Assets:Cash\n'
    );
  });

  it('removes the leading blank line when block is last in file', async () => {
    const { userId, dir } = await setup();
    const before =
      '2024-09-02 coffee\n' +
      '    Expenses:Coffee  USD 4\n' +
      '    Assets:Cash\n' +
      '\n' +
      '2024-09-01 lunch\n' +
      '    ; :uid: 01HZX5G5KJDS9HQRYK8E5T0DJC\n' +
      '    Expenses:Food  USD 10\n' +
      '    Assets:Cash\n';
    await fs.writeFile(path.join(dir, 'main.ledger'), before);

    const { writeJournal } = await import('./write');
    const { fingerprintDraft } = await import('./fingerprint');
    const draft = {
      date: '2024-09-01',
      payee: 'lunch',
      status: 'none' as const,
      uid: '01HZX5G5KJDS9HQRYK8E5T0DJC',
      postings: [
        { account: 'Expenses:Food', amount: '10', currency: 'USD' },
        { account: 'Assets:Cash', amount: '', currency: '' },
      ],
    };
    const result = await writeJournal(userId, {
      kind: 'delete',
      uid: '01HZX5G5KJDS9HQRYK8E5T0DJC',
      expectedFingerprint: fingerprintDraft(draft),
    });
    expect(result.ok).toBe(true);
    const after = await fs.readFile(path.join(dir, 'main.ledger'), 'utf-8');
    expect(after).toBe(
      '2024-09-02 coffee\n    Expenses:Coffee  USD 4\n    Assets:Cash\n'
    );
  });
});
```

- [ ] **Step 2: Run, expect failures**

Run: `pnpm test lib/journal/write.test.ts`

- [ ] **Step 3: Implement the delete path**

In `lib/journal/write.ts`, add a helper and replace the `throw` in `writeJournal`:

```ts
const performDelete = async (
  userId: string,
  input: WriteDeleteInput
): Promise<WriteResult> => {
  const { mainPath } = await resolveUserJournal(userId);
  const journal = await parseJournal(mainPath);
  const tx = journal.transactions.find((t) => t.uid === input.uid);
  if (!tx) {
    return { ok: false, reason: 'not-found', message: 'Transaction not found.' };
  }

  const text = await fs.readFile(tx.file, 'utf-8');
  const fileTxs = parseJournalFile(tx.file, text);
  const current = fileTxs.find((t) => t.uid === input.uid);
  if (!current) {
    return { ok: false, reason: 'not-found', message: 'Transaction not found.' };
  }

  const fp = fingerprintDraft({
    date: current.date,
    payee: current.payee,
    status: current.status,
    note: current.note ?? undefined,
    uid: current.uid ?? undefined,
    postings: current.postings,
  });
  if (fp !== input.expectedFingerprint) {
    return {
      ok: false,
      reason: 'stale',
      message: 'This transaction was modified somewhere else.',
    };
  }

  const lines = text.split('\n');
  let removeStart = current.startLine - 1; // inclusive
  let removeEnd = current.endLine - 1; // inclusive
  // Trailing blank line if present
  if (lines[removeEnd + 1] === '') {
    removeEnd++;
  } else if (lines[removeStart - 1] === '') {
    // Otherwise the leading blank line (last-block case)
    removeStart--;
  }
  const next = [...lines.slice(0, removeStart), ...lines.slice(removeEnd + 1)].join(
    '\n'
  );
  await writeFileAtomic(tx.file, next);

  updateTag(getJournalCacheTag(userId));
  revalidatePath('/', 'layout');
  return { ok: true };
};
```

And update `writeJournal` to dispatch:

```ts
export const writeJournal = async (
  userId: string,
  input: WriteInput
): Promise<WriteResult> =>
  withUserLock(userId, async () => {
    if (input.kind === 'edit') return performEdit(userId, input);
    return performDelete(userId, input);
  });
```

- [ ] **Step 4: Run tests, expect pass**

Run: `pnpm test lib/journal/write.test.ts`
Expected: 5 tests passed.

- [ ] **Step 5: Commit**

```bash
git add lib/journal/write.ts lib/journal/write.test.ts
git commit -m "feat(journal): writeJournal delete path"
```

---

## Task 16 — `/transactions` server route + parser plumbing

**Files:**

- Create: `app/transactions/page.tsx`
- Create: `app/transactions/loading.tsx`

- [ ] **Step 1: Create the loading skeleton**

Create `app/transactions/loading.tsx`:

```tsx
import PageSkeleton from '@/components/PageSkeleton';

export default function Loading() {
  return <PageSkeleton rows={12} />;
}
```

(`PageSkeleton` accepts `rows` and `showChart` — see `components/PageSkeleton/PageSkeleton.tsx`.)

- [ ] **Step 2: Create the route**

Create `app/transactions/page.tsx`:

```tsx
import 'server-only';
import { unstable_cache } from 'next/cache';
import { requireUser } from '@/lib/auth/require-user';
import { resolveUserJournal, getJournalCacheTag } from '@/lib/journals';
import { parseJournal, type Transaction } from '@/lib/journal/parser';
import TransactionTable from './TransactionTable';
import Filters from './Filters';
import Help from '@/components/Help';

type SearchParams = {
  start?: string;
  end?: string;
  account?: string;
  payee?: string;
  q?: string;
};

const buildLoader = (tag: string) =>
  unstable_cache(
    async (userId: string): Promise<Transaction[]> => {
      const { mainPath } = await resolveUserJournal(userId);
      const journal = await parseJournal(mainPath);
      return journal.transactions;
    },
    ['journal-transactions', tag],
    { revalidate: 60, tags: [tag] }
  );

const loadTransactions = (userId: string) =>
  buildLoader(getJournalCacheTag(userId))(userId);

const applyFilters = (txs: Transaction[], params: SearchParams) => {
  const start = params.start ? Date.parse(params.start) : null;
  const end = params.end ? Date.parse(params.end) : null;
  const account = params.account?.toLowerCase().trim();
  const payee = params.payee?.toLowerCase().trim();
  const q = params.q?.toLowerCase().trim();
  return txs.filter((t) => {
    const ts = Date.parse(t.date);
    if (start !== null && ts < start) return false;
    if (end !== null && ts > end) return false;
    if (payee && t.payee.toLowerCase() !== payee) return false;
    if (account && !t.postings.some((p) => p.account.toLowerCase().includes(account)))
      return false;
    if (q) {
      const hay = [t.payee, t.note ?? '', ...t.postings.map((p) => p.account)]
        .join(' ')
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
};

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const all = await loadTransactions(user.id);
  const filtered = applyFilters(all, params).sort((a, b) =>
    b.date.localeCompare(a.date)
  );
  const payees = [...new Set(all.map((t) => t.payee))].sort();
  const accounts = [
    ...new Set(all.flatMap((t) => t.postings.map((p) => p.account))),
  ].sort();

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center gap-2">
        <h1 className="text-2xl font-semibold">Transactions</h1>
        <Help label="All edits and deletes from this list rewrite the source file in place." />
      </header>
      <Filters payees={payees} accounts={accounts} />
      <TransactionTable transactions={filtered} />
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

Run: `pnpm type-check`
Expected: errors mention missing `TransactionTable` and `Filters` — those are next tasks. Continue.

- [ ] **Step 4: Commit (compiles after Tasks 17 + 18)**

Defer the commit until tasks 17 and 18 are in. Move on.

---

## Task 17 — `TransactionTable` client component

**Files:**

- Create: `app/transactions/TransactionTable.tsx`

- [ ] **Step 1: Build the table**

```tsx
'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ConfirmDialog from '@/components/ConfirmDialog';
import formatDate from '@/utils/formatDate';
import formatAmount from '@/utils/formatAmount';
import type { Transaction } from '@/lib/journal/parser';
import { deleteTransactionAction } from './actions';

type Props = { transactions: Transaction[] };

const statusBadge = (status: Transaction['status']) => {
  if (status === 'cleared') return <span className="text-positive">✓</span>;
  if (status === 'pending') return <span className="text-warning">!</span>;
  return null;
};

const magnitudeByCurrency = (t: Transaction) => {
  const sums = new Map<string, number>();
  for (const p of t.postings) {
    const v = Number(p.amount);
    if (!Number.isFinite(v) || v <= 0) continue;
    sums.set(p.currency, (sums.get(p.currency) ?? 0) + v);
  }
  return [...sums.entries()];
};

const TransactionTable = ({ transactions }: Props) => {
  const router = useRouter();
  if (transactions.length === 0) {
    return (
      <div className="rounded-md border border-border p-8 text-center text-sm text-muted-foreground">
        No matches. Try clearing the filters.
      </div>
    );
  }

  const onDelete = async (uid: string, expectedFingerprint: string) => {
    const res = await deleteTransactionAction(uid, expectedFingerprint);
    if (!res.ok) {
      toast.error(res.message);
    } else {
      toast.success('Transaction deleted');
    }
    router.refresh();
  };

  return (
    <table className="w-full text-left text-sm">
      <thead className="text-xs uppercase tracking-wide text-muted-foreground">
        <tr>
          <th className="py-2">Date</th>
          <th className="py-2 w-6"></th>
          <th className="py-2">Payee</th>
          <th className="py-2">Accounts</th>
          <th className="py-2 text-right">Amount</th>
          <th className="py-2 w-24"></th>
        </tr>
      </thead>
      <tbody>
        {transactions.map((t) => (
          <tr key={t.uid ?? `${t.file}:${t.startLine}`} className="border-t border-border">
            <td className="py-2 tabular-nums">{formatDate(t.date)}</td>
            <td className="py-2">{statusBadge(t.status)}</td>
            <td className="py-2">
              <Link href={`/transactions/${t.uid}/edit`} className="hover:underline">
                {t.payee}
              </Link>
            </td>
            <td className="py-2 text-muted-foreground">
              {t.postings.slice(0, 2).map((p) => p.account).join(' → ')}
              {t.postings.length > 2 ? ' …' : ''}
            </td>
            <td className="py-2 text-right tabular-nums">
              {magnitudeByCurrency(t).map(([ccy, amt]) => (
                <div key={ccy}>{formatAmount(`${ccy} ${amt}`, true)}</div>
              ))}
            </td>
            <td className="py-2 text-right">
              <div className="flex justify-end gap-1">
                <Button asChild variant="ghost" size="icon-sm">
                  <Link href={`/transactions/${t.uid}/edit`}>
                    <Pencil className="h-4 w-4" />
                  </Link>
                </Button>
                <ConfirmDialog
                  title="Delete transaction?"
                  description="This will permanently remove the transaction from the journal."
                  confirmLabel="Delete"
                  variant="destructive"
                  onConfirm={() => onDelete(t.uid ?? '', t.fingerprint ?? '')}
                >
                  <Button variant="ghost" size="icon-sm">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </ConfirmDialog>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

export default TransactionTable;
```

- [ ] **Step 2: Update the `Transaction` type** to carry `fingerprint`

In `lib/journal/parser.ts`, extend `Transaction`:

```ts
export type Transaction = {
  // ... existing fields ...
  fingerprint: string;
};
```

In `parseJournalFile`, compute the fingerprint inline using the same helper:

```ts
import { fingerprintDraft } from './fingerprint';
// ...
const fingerprint = fingerprintDraft({
  date: block.date,
  payee: block.payee,
  status: block.status,
  note: block.note ?? undefined,
  uid: block.uid ?? undefined,
  postings: block.postings,
});
transactions.push({ /* existing fields */, fingerprint });
```

- [ ] **Step 3: Type-check**

Run: `pnpm type-check`
Expected: now passes once `Filters.tsx` and `actions.ts` (next tasks) are in. Defer the commit again until 18 and 19 land.

---

## Task 18 — Filters bar + delete action

**Files:**

- Create: `app/transactions/Filters.tsx`
- Create: `app/transactions/actions.ts`

- [ ] **Step 1: Filters component**

```tsx
'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import DateFilter from '@/components/DateFilter';
import Combobox from '@/components/Combobox';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

type Props = { payees: string[]; accounts: string[] };

const Filters = ({ payees, accounts }: Props) => {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const [account, setAccount] = useState(params.get('account') ?? '');
  const [payee, setPayee] = useState(params.get('payee') ?? '');

  const apply = (next: Partial<Record<'q' | 'account' | 'payee', string>>) => {
    const u = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v) u.set(k, v);
      else u.delete(k);
    }
    router.push('/transactions?' + u.toString());
  };

  return (
    <div className="flex flex-wrap gap-3 items-end">
      <DateFilter />
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground">Account</label>
        <Combobox
          value={account}
          onChange={(v) => {
            setAccount(v);
            apply({ account: v });
          }}
          options={accounts}
          placeholder="Any account"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-muted-foreground">Payee</label>
        <Combobox
          value={payee}
          onChange={(v) => {
            setPayee(v);
            apply({ payee: v });
          }}
          options={payees}
          placeholder="Any payee"
        />
      </div>
      <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
        <label className="text-xs text-muted-foreground">Search</label>
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onBlur={() => apply({ q })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') apply({ q });
          }}
          placeholder="payee, note, account…"
        />
      </div>
      {(q || account || payee || params.get('start') || params.get('end')) && (
        <Button
          variant="ghost"
          onClick={() => {
            setQ('');
            setAccount('');
            setPayee('');
            router.push('/transactions');
          }}
        >
          Clear
        </Button>
      )}
    </div>
  );
};

export default Filters;
```

- [ ] **Step 2: Delete action**

Create `app/transactions/actions.ts`:

```ts
'use server';

import { requireUser } from '@/lib/auth/require-user';
import { writeJournal } from '@/lib/journal/write';

export type DeleteResult =
  | { ok: true }
  | { ok: false; message: string };

export async function deleteTransactionAction(
  uid: string,
  expectedFingerprint: string
): Promise<DeleteResult> {
  const user = await requireUser();
  const result = await writeJournal(user.id, {
    kind: 'delete',
    uid,
    expectedFingerprint,
  });
  if (!result.ok) return { ok: false, message: result.message };
  return { ok: true };
}
```

- [ ] **Step 3: Type-check + smoke run**

Run: `pnpm type-check && pnpm build`
Expected: no errors.

- [ ] **Step 4: Commit Tasks 16–18 together**

```bash
git add app/transactions/page.tsx app/transactions/loading.tsx app/transactions/TransactionTable.tsx app/transactions/Filters.tsx app/transactions/actions.ts lib/journal/parser.ts
git commit -m "feat(transactions): list view with filters and delete action"
```

---

## Task 19 — Nav entry + Dashboard link

**Files:**

- Modify: `components/nav/config.ts`
- Modify: `features/dashboard/Dashboard.tsx`

- [ ] **Step 1: Read current nav config**

```bash
grep -n "Activity" components/nav/config.ts
```

- [ ] **Step 2: Add `Transactions` entry under Activity**

Add to the Activity section's items:

```ts
{
  title: 'Transactions',
  href: '/transactions',
  description: 'Edit or delete posted transactions.',
  icon: 'ListChecks',
  match: 'prefix',
  keywords: ['edit', 'delete', 'list', 'history'],
},
```

(Use whichever lucide icon name matches your existing nav entries; `ListChecks` works.)

- [ ] **Step 3: Dashboard link**

In `features/dashboard/Dashboard.tsx`, find the recent-transactions card. Append after the list:

```tsx
<div className="mt-3 text-right">
  <Link
    href="/transactions"
    className={buttonVariants({ variant: 'link', size: 'sm' })}
  >
    View all →
  </Link>
</div>
```

- [ ] **Step 4: Build + commit**

Run: `pnpm build`
Expected: success.

```bash
git add components/nav/config.ts features/dashboard/Dashboard.tsx
git commit -m "feat(nav): expose Transactions list in sidebar and Dashboard"
```

---

## Task 20 — Edit page route

**Files:**

- Create: `app/transactions/[uid]/edit/page.tsx`

- [ ] **Step 1: Build the edit page**

```tsx
import 'server-only';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth/require-user';
import { resolveUserJournal } from '@/lib/journals';
import { parseJournal } from '@/lib/journal/parser';
import { fingerprintDraft } from '@/lib/journal/fingerprint';
import {
  getAccountSuggestions,
  getPayeeSuggestions,
} from '@/lib/transactions/suggestions';
import getDefaultCurrency from '@/utils/getDefaultCurrency';
import TransactionForm from '@/app/transactions/new/TransactionForm';
import { updateTransactionAction } from './actions';

export const dynamic = 'force-dynamic';

export default async function EditTransactionPage({
  params,
}: {
  params: Promise<{ uid: string }>;
}) {
  const user = await requireUser();
  const { uid } = await params;
  const { mainPath } = await resolveUserJournal(user.id);
  const journal = await parseJournal(mainPath);
  const tx = journal.transactions.find((t) => t.uid === uid);
  if (!tx) notFound();

  const defaultCurrency = getDefaultCurrency() ?? 'USD';
  const initialDraft = {
    date: tx.date,
    payee: tx.payee,
    status: tx.status,
    note: tx.note ?? undefined,
    uid: tx.uid ?? undefined,
    postings: tx.postings.map((p) => ({
      account: p.account,
      amount: p.amount,
      currency: p.currency || defaultCurrency,
    })),
  };
  const expectedFingerprint = fingerprintDraft(initialDraft);
  const [accounts, payees] = await Promise.all([
    getAccountSuggestions(),
    getPayeeSuggestions(),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Edit transaction</h1>
      <TransactionForm
        mode="edit"
        initialDraft={initialDraft}
        uid={uid}
        expectedFingerprint={expectedFingerprint}
        submitAction={updateTransactionAction}
        accounts={accounts}
        payees={payees}
        defaultCurrency={defaultCurrency}
      />
    </div>
  );
}
```

- [ ] **Step 2: Type-check (will fail on TransactionForm props until Task 21)**

Skip the commit; proceed to Task 21.

---

## Task 21 — `TransactionForm` refactored for both modes

**Files:**

- Modify: `app/transactions/new/TransactionForm.tsx`

- [ ] **Step 1: Update props and bindings**

Replace the top of `TransactionForm.tsx` (props and state init) with a version that accepts the new props. Concretely:

```tsx
'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { type TransactionActionState } from './actions';
import Combobox from '@/components/Combobox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useRouter } from 'next/navigation';
import type { TransactionDraft } from '@/lib/transactions/schema';

type Status = 'cleared' | 'pending' | 'none';
type Posting = { account: string; amount: string; currency: string };

type SubmitAction = (
  prev: TransactionActionState | null,
  formData: FormData
) => Promise<TransactionActionState>;

type Props = {
  accounts: string[];
  payees: string[];
  defaultCurrency: string;
  mode?: 'create' | 'edit';
  initialDraft?: TransactionDraft;
  uid?: string;
  expectedFingerprint?: string;
  submitAction: SubmitAction;
};

const todayISO = (): string => {
  const d = new Date();
  const tzOffset = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - tzOffset).toISOString().slice(0, 10);
};

const initialState: TransactionActionState = { ok: false };
const fieldError = (state: TransactionActionState | null, key: string) =>
  state?.fieldErrors?.[key];

const TransactionForm = ({
  accounts,
  payees,
  defaultCurrency,
  mode = 'create',
  initialDraft,
  uid,
  expectedFingerprint,
  submitAction,
}: Props) => {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(submitAction, initialState);

  const [date, setDate] = useState(initialDraft?.date ?? todayISO);
  const [payee, setPayee] = useState(initialDraft?.payee ?? '');
  const [status, setStatus] = useState<Status>(initialDraft?.status ?? 'none');
  const [note, setNote] = useState(initialDraft?.note ?? '');
  const [postings, setPostings] = useState<Posting[]>(
    initialDraft?.postings.map((p) => ({
      account: p.account,
      amount: p.amount,
      currency: p.currency,
    })) ?? [
      { account: '', amount: '', currency: defaultCurrency },
      { account: '', amount: '', currency: defaultCurrency },
    ]
  );
  // ... existing balance + handlers unchanged ...

  useEffect(() => {
    if (state?.ok) {
      toast.success(mode === 'edit' ? 'Transaction updated' : 'Transaction saved');
      router.push(mode === 'edit' ? '/transactions' : '/');
      router.refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, router, mode]);
```

Then in the JSX, where the hidden input is, render:

```tsx
<input type="hidden" name="draft" value={draftJson} />
{mode === 'edit' && uid && (
  <input type="hidden" name="uid" value={uid} />
)}
{mode === 'edit' && expectedFingerprint && (
  <input
    type="hidden"
    name="expectedFingerprint"
    value={expectedFingerprint}
  />
)}
```

Update the `draftJson` builder to include `uid` for edit mode:

```tsx
const draftJson = JSON.stringify({
  date,
  payee: payee.trim(),
  status,
  note: note.trim() || undefined,
  uid: mode === 'edit' ? uid : undefined,
  postings: postings.map((p) => ({
    account: p.account.trim(),
    amount: p.amount.trim(),
    currency: p.currency.trim(),
  })),
});
```

Update the submit button label:

```tsx
<Button type="submit" disabled={!canSubmit}>
  {isPending
    ? 'Saving…'
    : mode === 'edit'
      ? 'Save changes'
      : 'Add transaction'}
</Button>
```

- [ ] **Step 2: Update `app/transactions/new/page.tsx` to pass `submitAction`**

Open `app/transactions/new/page.tsx` and pass `submitAction={createTransactionAction}` to `<TransactionForm>` (importing the action at the top).

- [ ] **Step 3: Type-check**

Run: `pnpm type-check`
Expected: pass.

- [ ] **Step 4: Commit Tasks 20 and 21 together**

```bash
git add app/transactions/[uid]/edit/page.tsx app/transactions/new/TransactionForm.tsx app/transactions/new/page.tsx
git commit -m "feat(transactions): edit page and reusable TransactionForm"
```

---

## Task 22 — Update server action

**Files:**

- Create: `app/transactions/[uid]/edit/actions.ts`

- [ ] **Step 1: Write the action**

```ts
'use server';

import { requireUser } from '@/lib/auth/require-user';
import { writeJournal } from '@/lib/journal/write';
import type { TransactionActionState } from '@/app/transactions/new/actions';

export async function updateTransactionAction(
  _prev: TransactionActionState | null,
  formData: FormData
): Promise<TransactionActionState> {
  const user = await requireUser();
  const draftJson = formData.get('draft');
  const uid = formData.get('uid');
  const expectedFingerprint = formData.get('expectedFingerprint');
  if (typeof draftJson !== 'string' || typeof uid !== 'string' || typeof expectedFingerprint !== 'string') {
    return { ok: false, formError: 'Missing edit payload' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(draftJson);
  } catch {
    return { ok: false, formError: 'Edit payload is not valid JSON' };
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return { ok: false, formError: 'Edit payload is not an object' };
  }

  const result = await writeJournal(user.id, {
    kind: 'edit',
    uid,
    expectedFingerprint,
    draft: parsed as never,
  });

  if (!result.ok) {
    return {
      ok: false,
      formError: result.message,
      fieldErrors: result.fieldErrors,
    };
  }
  return { ok: true };
}
```

- [ ] **Step 2: Type-check + build**

Run: `pnpm type-check && pnpm build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add app/transactions/[uid]/edit/actions.ts
git commit -m "feat(transactions): updateTransactionAction"
```

---

## Task 23 — Stale UX in the edit form

**Files:**

- Modify: `app/transactions/new/TransactionForm.tsx`

- [ ] **Step 1: Surface stale state**

Inside `TransactionForm`, after the existing `state?.formError` Alert, add:

```tsx
{state?.formError === 'This transaction was modified somewhere else.' && (
  <Alert variant="destructive">
    <AlertDescription className="flex items-center justify-between gap-3">
      <span>{state.formError} Reload to see the latest version.</span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => router.refresh()}
      >
        Reload
      </Button>
    </AlertDescription>
  </Alert>
)}
```

(This means the stale Alert appears in addition to the generic error alert; refine the conditional if the visual stack feels noisy.)

- [ ] **Step 2: Manual smoke test**

Run `pnpm dev`; navigate to `/transactions`, edit a transaction, manually overwrite the journal file out-of-band, save the edit. Expect the stale Alert + Reload button.

- [ ] **Step 3: Commit**

```bash
git add app/transactions/new/TransactionForm.tsx
git commit -m "feat(transactions): stale-edit reload UX"
```

---

## Task 24 — Integration smoke test

**Files:**

- Create: `lib/journal/integration.test.ts`
- Create: `lib/journal/__fixtures__/integration/main.ledger`
- Create: `lib/journal/__fixtures__/integration/q1.ledger`

- [ ] **Step 1: Build the fixture**

Create `lib/journal/__fixtures__/integration/main.ledger`:

```
include ./q1.ledger

2024-09-01 lunch
    Expenses:Food  USD 10
    Assets:Cash
```

Create `lib/journal/__fixtures__/integration/q1.ledger`:

```
2024-01-15 rent
	Expenses:Rent\t1500 USD
	Assets:Bank
```

(Use a real tab character in `q1.ledger`.)

- [ ] **Step 2: Write the integration test**

```ts
import { describe, it, expect } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

describe('Phase 4.1 integration', () => {
  it('parses → backfills → edits → deletes a real fixture', async () => {
    const src = path.resolve(__dirname, '__fixtures__/integration');
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'integration-'));
    process.env.DATA_DIR = tmp;
    process.env.BETTER_AUTH_SECRET = 'x'.repeat(32);

    const { getJournalDir } = await import('@/lib/journals');
    const userId = 'integration-user';
    const dir = getJournalDir(userId);
    await fs.mkdir(dir, { recursive: true });
    for (const name of ['main.ledger', 'q1.ledger']) {
      await fs.copyFile(path.join(src, name), path.join(dir, name));
    }
    // Tell the DB about the main file - test uses default 'main.ledger', so skip
    const { backfillUids } = await import('./backfill');
    const { parseJournal } = await import('./parser');
    const { writeJournal } = await import('./write');
    const { fingerprintDraft } = await import('./fingerprint');

    const { uidsAdded } = await backfillUids(userId);
    expect(uidsAdded).toBe(2);

    const journal1 = await parseJournal(path.join(dir, 'main.ledger'));
    expect(journal1.transactions).toHaveLength(2);
    const lunch = journal1.transactions.find((t) => t.payee === 'lunch')!;
    expect(lunch.uid).not.toBeNull();

    const editResult = await writeJournal(userId, {
      kind: 'edit',
      uid: lunch.uid!,
      expectedFingerprint: lunch.fingerprint,
      draft: {
        date: lunch.date,
        payee: 'lunch v2',
        status: 'none',
        uid: lunch.uid!,
        postings: lunch.postings,
      },
    });
    expect(editResult.ok).toBe(true);

    const journal2 = await parseJournal(path.join(dir, 'main.ledger'));
    const lunchV2 = journal2.transactions.find((t) => t.payee === 'lunch v2');
    expect(lunchV2).toBeDefined();
    expect(lunchV2!.uid).toBe(lunch.uid);

    const deleteResult = await writeJournal(userId, {
      kind: 'delete',
      uid: lunchV2!.uid!,
      expectedFingerprint: lunchV2!.fingerprint,
    });
    expect(deleteResult.ok).toBe(true);

    const journal3 = await parseJournal(path.join(dir, 'main.ledger'));
    expect(journal3.transactions.find((t) => t.payee === 'lunch v2')).toBeUndefined();
  });
});
```

- [ ] **Step 3: Note about `resolveUserJournal`**

The integration test does not insert a user row, so `resolveUserJournal` falls back to `DEFAULT_MAIN = 'main.ledger'`. That matches the fixture filename intentionally.

- [ ] **Step 4: Run**

Run: `pnpm test lib/journal/integration.test.ts`
Expected: 1 test passed.

- [ ] **Step 5: Run full suite and coverage**

Run: `pnpm test`
Expected: all suites pass.

```bash
pnpm vitest run --coverage
```

Expected: `lib/journal/*` coverage at or above 95% lines/functions, 90% branches.

- [ ] **Step 6: Commit**

```bash
git add lib/journal/integration.test.ts lib/journal/__fixtures__/integration
git commit -m "test(journal): end-to-end parse → backfill → edit → delete"
```

---

## Final verification

- [ ] **Build:** `pnpm build` → success.
- [ ] **Lint:** `pnpm lint` → clean.
- [ ] **Type-check:** `pnpm type-check` → clean.
- [ ] **Tests:** `pnpm test` → all green; coverage thresholds met.
- [ ] **Manual smoke** at `/transactions`:
  - List loads.
  - Filters narrow results and update URL.
  - Edit a transaction → block in journal file is replaced; other blocks untouched.
  - Delete a transaction → block + one blank line removed; surrounding text untouched.
  - Add a new transaction via `/transactions/new` → new block carries a UID line.
  - Re-import via `/import` → toast reports `uidsAdded`; running again over the same content reports `0`.

---

## PLAN.md Updates

After all tasks are merged, in `PLAN.md` under Phase 4.1 check off:

- [x] Decide the addressing scheme (UID via `; :uid: <ulid>`).
- [x] Backfill UID tags on import.
- [x] List view at `/transactions` with pagination.  _(Pagination deferred per spec; revisit only if perf degrades.)_
- [x] Edit page reusing the add-transaction form.
- [x] Delete with confirm modal.
- [x] All mutations go through a single `writeJournal` helper.

The "pagination" item explicitly ships without pagination per the spec; that decision is documented in the design doc, not retroactively added to the plan.
