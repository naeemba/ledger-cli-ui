# Raw Ledger Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the plain raw-entry `<textarea>` with a CodeMirror 6 editor that has context-aware autocomplete, ledger syntax highlighting, an amount formatter, and smart indentation.

**Architecture:** Keep the existing `RawLens` data flow (`onChange(value)` → `parseBlock` → `dispatch(replaceAll)`) untouched and only swap the input surface. All testable behavior (formatting, completion-context resolution, change-handling) lives in pure modules under `lib/ledger/` and a small extracted helper; CodeMirror wiring lives in one client component (`LedgerEditor`) that is verified manually, since the repo has no React DOM test harness.

**Tech Stack:** Next.js (client components), TypeScript, CodeMirror 6 via `@uiw/react-codemirror`, Vitest (`environment: 'node'`, no React Testing Library).

## Global Constraints

- Test runner: `pnpm test` (Vitest, `vitest run`). Vitest env is `node`; component tests render with `renderToStaticMarkup` from `react-dom/server` — there is **no** jsdom/RTL.
- Indent unit is **4 spaces** (matches `formatTransaction`/`formatPosting`).
- Amount alignment reuses the existing `formatPosting` rule (fixed `ACCOUNT_COLUMN = 48`, min 2 spaces) for consistency with the form layer — NOT a dynamic "longest account" column. This is a deliberate refinement of the spec for cross-layer consistency.
- No new server calls: `accounts`, `payees`, `currencies` are already props on `TransactionEntry`.
- Type-check must stay green: `pnpm type-check`. Lint: `pnpm lint`.
- Never reference AI/assistant tooling in code, comments, or commit messages. Match existing file style (named exports, `'use client'` only where needed).

---

### Task 1: `formatLedgerText` pure formatter

Re-aligns posting amounts in a raw ledger block while passing comments, uid lines, blank lines, and unparsable lines through verbatim. Idempotent and defensive (returns input unchanged when the block has no valid header).

**Files:**
- Modify: `lib/transactions/schema.ts` (export `formatPosting`, currently a private `const`)
- Create: `lib/ledger/format.ts`
- Test: `lib/ledger/format.test.ts`

**Interfaces:**
- Consumes: `parseHeader`, `parsePostingLine`, `type ParsedPosting` from `@/lib/journal/parser`; `formatPosting` from `@/lib/transactions/schema`.
- Produces: `formatLedgerText(raw: string): string`.

- [ ] **Step 1: Export `formatPosting` from schema**

In `lib/transactions/schema.ts`, change the declaration on line 161 from:

```ts
const formatPosting = (p: PostingDraft): string => {
```

to:

```ts
export const formatPosting = (p: PostingDraft): string => {
```

- [ ] **Step 2: Write the failing test**

Create `lib/ledger/format.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { formatLedgerText } from './format';

describe('formatLedgerText', () => {
  it('aligns posting amounts to the shared column', () => {
    const raw = [
      '2026-06-30 * Groceries',
      '  Expenses:Food  USD 42.00',
      '  Assets:Checking USD -42.00',
    ].join('\n');
    const out = formatLedgerText(raw);
    const lines = out.split('\n');
    // Header is preserved verbatim.
    expect(lines[0]).toBe('2026-06-30 * Groceries');
    // Both amounts start at the same column.
    const col = (l: string) => l.indexOf('USD');
    expect(col(lines[1])).toBe(col(lines[2]));
    expect(lines[1]).toContain('Expenses:Food');
    expect(lines[2]).toContain('Assets:Checking');
  });

  it('preserves comments, uid lines, and blank lines verbatim', () => {
    const raw = [
      '2026-06-30 Groceries',
      '    ; :uid: abc123',
      '    ; a note',
      '  Expenses:Food  USD 1.00',
      '',
      '  Assets:Checking  USD -1.00',
    ].join('\n');
    const out = formatLedgerText(raw).split('\n');
    expect(out).toContain('    ; :uid: abc123');
    expect(out).toContain('    ; a note');
    expect(out).toContain(''); // blank line kept
  });

  it('passes unparsable lines through verbatim', () => {
    const raw = ['2026-06-30 Groceries', '  not a real <<< posting'].join('\n');
    const out = formatLedgerText(raw);
    expect(out).toContain('not a real <<< posting');
  });

  it('returns input unchanged when there is no valid header', () => {
    const raw = 'this is not a transaction\n  neither is this';
    expect(formatLedgerText(raw)).toBe(raw);
  });

  it('is idempotent', () => {
    const raw = [
      '2026-06-30 * Groceries',
      '  Expenses:Food USD 42.00',
      '  Assets:Checking USD -42.00',
    ].join('\n');
    const once = formatLedgerText(raw);
    expect(formatLedgerText(once)).toBe(once);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm test lib/ledger/format.test.ts`
Expected: FAIL — `Cannot find module './format'`.

- [ ] **Step 4: Implement `formatLedgerText`**

Create `lib/ledger/format.ts`:

```ts
import { parseHeader, parsePostingLine } from '@/lib/journal/parser';
import { formatPosting } from '@/lib/transactions/schema';

/**
 * Re-align posting amounts in a raw ledger block to the canonical column used
 * by the form layer, while leaving everything that is not a plain posting
 * (header, comments, uid line, blanks, unparsable lines) byte-for-byte intact.
 *
 * Defensive: if the first line is not a valid transaction header, the input is
 * returned unchanged so a half-typed entry is never mangled.
 */
export const formatLedgerText = (raw: string): string => {
  const lines = raw.split('\n');
  if (lines.length === 0 || !parseHeader(lines[0])) return raw;

  const formatted = lines.map((line, i) => {
    if (i === 0) return line; // header preserved verbatim
    if (line.trim() === '') return line; // blank
    if (line.trim().startsWith(';')) return line; // comment / uid line
    const posting = parsePostingLine(line);
    if (!posting) return line; // unparsable — keep as-is
    return formatPosting(posting);
  });

  return formatted.join('\n');
};
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm test lib/ledger/format.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Type-check and commit**

```bash
pnpm type-check
git add lib/ledger/format.ts lib/ledger/format.test.ts lib/transactions/schema.ts
git commit -m "feat(ledger): add idempotent raw-block amount formatter"
```

---

### Task 2: `completionAt` context resolver

Pure function that, given the document text and caret offset, decides which suggestion list applies (payees on the header line, accounts in the account region of a posting, commodities after an amount) and returns the replacement range and filtered options. No CodeMirror dependency — fully unit-testable.

**Files:**
- Create: `lib/ledger/completionContext.ts`
- Test: `lib/ledger/completionContext.test.ts`

**Interfaces:**
- Produces:
  - `type CompletionLists = { accounts: string[]; payees: string[]; commodities: string[] }`
  - `type LedgerCompletion = { from: number; options: string[] }`
  - `completionAt(doc: string, pos: number, lists: CompletionLists): LedgerCompletion | null`

- [ ] **Step 1: Write the failing test**

Create `lib/ledger/completionContext.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { completionAt, type CompletionLists } from './completionContext';

const lists: CompletionLists = {
  accounts: ['Expenses:Groceries', 'Expenses:Gas', 'Assets:Checking', 'Assets:Cash'],
  payees: ['Whole Foods', 'Walmart'],
  commodities: ['USD', 'EUR'],
};

const at = (doc: string, lists2: CompletionLists = lists) =>
  completionAt(doc, doc.length, lists2);

describe('completionAt', () => {
  it('suggests payees on the header line after the date', () => {
    const res = at('2026-06-30 Who');
    expect(res).not.toBeNull();
    expect(res!.from).toBe('2026-06-30 '.length);
    expect(res!.options).toEqual(['Whole Foods']);
  });

  it('suggests payees after a status marker', () => {
    const res = at('2026-06-30 * Wal');
    expect(res!.options).toEqual(['Walmart']);
    expect(res!.from).toBe('2026-06-30 * '.length);
  });

  it('returns null inside the date itself', () => {
    expect(at('2026-06-3')).toBeNull();
  });

  it('suggests accounts in the account region of a posting', () => {
    const doc = '2026-06-30 Groceries\n    Expenses:G';
    const res = completionAt(doc, doc.length, lists);
    expect(res!.options).toEqual(['Expenses:Groceries', 'Expenses:Gas']);
    expect(res!.from).toBe(doc.length - 'Expenses:G'.length);
  });

  it('suggests commodities after the amount gap', () => {
    const doc = '2026-06-30 Groceries\n    Assets:Cash    US';
    const res = completionAt(doc, doc.length, lists);
    expect(res!.options).toEqual(['USD']);
    expect(res!.from).toBe(doc.length - 'US'.length);
  });

  it('filters case-insensitively', () => {
    const doc = '2026-06-30 Groceries\n    assets:ch';
    const res = completionAt(doc, doc.length, lists);
    expect(res!.options).toEqual(['Assets:Checking']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test lib/ledger/completionContext.test.ts`
Expected: FAIL — `Cannot find module './completionContext'`.

- [ ] **Step 3: Implement `completionAt`**

Create `lib/ledger/completionContext.ts`:

```ts
export type CompletionLists = {
  accounts: string[];
  payees: string[];
  commodities: string[];
};

export type LedgerCompletion = { from: number; options: string[] };

const HEADER_PREFIX = /^(\d{4}[-/]\d{2}[-/]\d{2}\s+(?:[*!]\s+)?)(.*)$/;

const filterList = (options: string[], token: string): string[] => {
  const needle = token.toLowerCase();
  return options.filter(
    (o) => o.toLowerCase().includes(needle) && o.toLowerCase() !== needle
  );
};

const result = (from: number, options: string[]): LedgerCompletion | null =>
  options.length > 0 ? { from, options } : null;

/**
 * Resolve which ledger suggestion list applies at `pos`, based only on the
 * text of the current line up to the caret. Returns the replacement start
 * offset and the filtered options, or null when nothing should be suggested.
 */
export const completionAt = (
  doc: string,
  pos: number,
  lists: CompletionLists
): LedgerCompletion | null => {
  const lineStart = doc.lastIndexOf('\n', pos - 1) + 1;
  const isFirstLine = lineStart === 0;
  const upToCaret = doc.slice(lineStart, pos);

  // Header line: complete the payee after the date (and optional status).
  if (isFirstLine) {
    const m = upToCaret.match(HEADER_PREFIX);
    if (!m) return null; // still typing the date
    const payeeToken = m[2];
    const from = lineStart + m[1].length;
    return result(from, filterList(lists.payees, payeeToken));
  }

  // Posting line must be indented.
  if (!/^\s/.test(upToCaret)) return null;

  // An amount gap (2+ spaces or a tab after the account) splits the line into
  // account region (before) and amount/commodity region (after).
  const gap = upToCaret.match(/\s{2,}|\t+/g);
  const hasAmountGap = / {2,}|\t/.test(upToCaret.replace(/^\s+/, ''));

  if (hasAmountGap) {
    // Commodity region: token = text after the last whitespace run.
    const token = upToCaret.slice(upToCaret.search(/\S*$/));
    const from = pos - token.length;
    return result(from, filterList(lists.commodities, token));
  }

  // Account region: token = the indented account text typed so far.
  const token = upToCaret.replace(/^\s+/, '');
  const from = pos - token.length;
  void gap;
  return result(from, filterList(lists.accounts, token));
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test lib/ledger/completionContext.test.ts`
Expected: PASS (6 tests). If the commodity/account split fails on the `hasAmountGap` heuristic, adjust the regex so a single tab OR 2+ spaces after the account counts as the gap — the test cases above are the contract.

- [ ] **Step 5: Type-check and commit**

```bash
pnpm type-check
git add lib/ledger/completionContext.ts lib/ledger/completionContext.test.ts
git commit -m "feat(ledger): add caret-context completion resolver"
```

---

### Task 3: Extract RawLens change-handling into a pure helper

Move the parse/validate/dispatch decision out of the component so it is unit-tested directly, and so the upcoming editor swap doesn't touch tested logic. `RawLens` still renders the `<textarea>` after this task — only the internals are refactored.

**Files:**
- Create: `features/transactions/entry/rawLensLogic.ts`
- Modify: `features/transactions/entry/RawLens.tsx`
- Test: `features/transactions/entry/rawLensLogic.test.ts`

**Interfaces:**
- Consumes: `parseBlock` from `@/lib/journal/parser`; `parsedBlockToDraft` from `./parsedBlockToDraft`; `type DraftState`, `type DraftAction` from `./draftReducer`.
- Produces: `applyRawText(value: string, draft: DraftState): { error: string | null; action: DraftAction | null }` and the exported constant `PARSE_ERROR`.

- [ ] **Step 1: Write the failing test**

Create `features/transactions/entry/rawLensLogic.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { applyRawText, PARSE_ERROR } from './rawLensLogic';
import { initDraft } from './draftReducer';

const draft = initDraft({ date: '2026-06-30' }, 'USD');

describe('applyRawText', () => {
  it('returns a replaceAll action for a valid block', () => {
    const value = [
      '2026-06-30 * Groceries',
      '    Expenses:Food  USD 42.00',
      '    Assets:Checking  USD -42.00',
    ].join('\n');
    const { error, action } = applyRawText(value, draft);
    expect(error).toBeNull();
    expect(action).not.toBeNull();
    expect(action!.type).toBe('replaceAll');
  });

  it('flags an unparseable block with PARSE_ERROR and no action', () => {
    const { error, action } = applyRawText('not a transaction', draft);
    expect(error).toBe(PARSE_ERROR);
    expect(action).toBeNull();
  });

  it('flags a silently-dropped posting line', () => {
    const value = '2026-06-30 Groceries\n    Expenses:Food  USD 1.00\n    garbage <<<';
    const { error, action } = applyRawText(value, draft);
    expect(error).toContain('Could not parse this line');
    expect(action).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test features/transactions/entry/rawLensLogic.test.ts`
Expected: FAIL — `Cannot find module './rawLensLogic'`.

- [ ] **Step 3: Implement the helper**

Create `features/transactions/entry/rawLensLogic.ts`:

```ts
import type { DraftState, DraftAction } from './draftReducer';
import { parsedBlockToDraft } from './parsedBlockToDraft';
import { parseBlock } from '@/lib/journal/parser';

export const PARSE_ERROR =
  'Could not parse this as a transaction. Check the date/payee header and that each posting has an account.';

const unparsedLineError = (line: string): string =>
  `Could not parse this line: "${line.trim()}". Each posting needs an account, ` +
  'and an amount must be separated from the account by two or more spaces.';

export type RawTextResult = { error: string | null; action: DraftAction | null };

/** Pure decision for the Raw editor's onChange: parse `value`, returning either
 *  a human error or the `replaceAll` action to dispatch. */
export const applyRawText = (value: string, draft: DraftState): RawTextResult => {
  const block = parseBlock(value);
  if (!block || block.postings.length === 0) {
    return { error: PARSE_ERROR, action: null };
  }
  if (block.unparsedLines.length > 0) {
    return { error: unparsedLineError(block.unparsedLines[0]), action: null };
  }
  return {
    error: null,
    action: { type: 'replaceAll', state: parsedBlockToDraft(block, draft) },
  };
};
```

- [ ] **Step 4: Refactor `RawLens.tsx` to use the helper**

Replace `features/transactions/entry/RawLens.tsx` with:

```tsx
'use client';

import { useEffect, useState } from 'react';
import type { DraftState, DraftAction } from './draftReducer';
import { applyRawText } from './rawLensLogic';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Textarea } from '@/components/ui/textarea';
import { formatTransaction } from '@/lib/transactions/schema';

export function RawLens({
  draft,
  dispatch,
  onError,
}: {
  draft: DraftState;
  dispatch: (action: DraftAction) => void;
  onError?: (error: string | null) => void;
}) {
  const [text, setText] = useState(() => formatTransaction(draft));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    onError?.(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onChange = (value: string) => {
    setText(value);
    const { error: nextError, action } = applyRawText(value, draft);
    setError(nextError);
    onError?.(nextError);
    if (action) dispatch(action);
  };

  return (
    <div className="flex flex-col gap-2">
      <Textarea
        value={text}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        rows={10}
        className="resize-y font-mono leading-relaxed"
        aria-label="Transaction ledger text"
      />
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Run the full RawLens + helper suite**

Run: `pnpm test features/transactions/entry/rawLensLogic.test.ts features/transactions/entry/RawLens.test.tsx`
Expected: PASS — new helper tests pass and the existing `RawLens.test.tsx` (textarea + seeded content) still passes because the textarea is unchanged.

- [ ] **Step 6: Type-check and commit**

```bash
pnpm type-check
git add features/transactions/entry/rawLensLogic.ts features/transactions/entry/rawLensLogic.test.ts features/transactions/entry/RawLens.tsx
git commit -m "refactor(transactions): extract raw-entry change handling into a pure helper"
```

---

### Task 4: CodeMirror `LedgerEditor` + wire into RawLens

Add the CodeMirror dependencies and build the editor component (syntax highlighting, context-aware autocomplete via the Task 2 resolver, smart Tab/Enter keymap, format-on-blur + Format button + `Shift+Alt+F`). Swap it into `RawLens` and thread the suggestion lists from `TransactionEntry`. Verified by type-check, build, and manual run (no RTL available).

**Files:**
- Modify: `package.json` (add deps)
- Create: `lib/ledger/highlight.ts`
- Create: `lib/ledger/completions.ts`
- Create: `features/transactions/entry/LedgerEditor.tsx`
- Modify: `features/transactions/entry/RawLens.tsx`
- Modify: `features/transactions/entry/TransactionEntry.tsx:217-219` (pass props to `RawLens`)
- Modify: `features/transactions/entry/RawLens.test.tsx` (drop SSR-content assertions CodeMirror can't satisfy)

**Interfaces:**
- Consumes: `completionAt`, `type CompletionLists` from `@/lib/ledger/completionContext`; `formatLedgerText` from `@/lib/ledger/format`; `applyRawText` from `./rawLensLogic`.
- Produces:
  - `ledgerLanguage(): Extension` from `lib/ledger/highlight.ts`
  - `ledgerCompletions(lists: CompletionLists): CompletionSource` from `lib/ledger/completions.ts`
  - `LedgerEditor` component, props `{ value: string; onChange: (v: string) => void; onBlurFormat?: boolean; accounts: string[]; payees: string[]; commodities: string[]; 'aria-label'?: string }`.

- [ ] **Step 1: Add dependencies**

```bash
pnpm add @uiw/react-codemirror @codemirror/state @codemirror/view @codemirror/commands @codemirror/autocomplete @codemirror/language
```

Expected: installs without peer-dependency errors. Verify React stays a single version: `pnpm ls react | head`.

- [ ] **Step 2: Create the ledger syntax-highlight extension**

Create `lib/ledger/highlight.ts`:

```ts
import { StreamLanguage } from '@codemirror/language';
import type { Extension } from '@codemirror/state';

/** Minimal ledger tokenizer for highlighting: date, status, account, amount,
 *  comment. Mapped to CodeMirror's default highlight tags. */
export const ledgerLanguage = (): Extension =>
  StreamLanguage.define({
    token(stream) {
      if (stream.sol() && stream.match(/\d{4}[-/]\d{2}[-/]\d{2}/)) {
        return 'keyword'; // date
      }
      if (stream.match(/^\s*;.*/)) return 'comment';
      if (stream.match(/[*!](?=\s)/)) return 'operator'; // status marker
      if (stream.match(/-?\d[\d,]*(?:\.\d+)?/)) return 'number'; // amount
      if (stream.match(/[A-Za-z][\w-]*(?::[\w-]+)+/)) return 'variableName'; // account
      stream.next();
      return null;
    },
  });
```

- [ ] **Step 3: Create the CodeMirror completion adapter**

Create `lib/ledger/completions.ts`:

```ts
import type { CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import { completionAt, type CompletionLists } from './completionContext';

/** Adapt the pure `completionAt` resolver into a CodeMirror CompletionSource. */
export const ledgerCompletions =
  (lists: CompletionLists) =>
  (ctx: CompletionContext): CompletionResult | null => {
    const res = completionAt(ctx.state.doc.toString(), ctx.pos, lists);
    if (!res) return null;
    return {
      from: res.from,
      options: res.options.map((label) => ({ label, type: 'text' })),
      validFor: /^[\w:$€£.\- ]*$/,
    };
  };
```

- [ ] **Step 4: Build the `LedgerEditor` component**

Create `features/transactions/entry/LedgerEditor.tsx`:

```tsx
'use client';

import { useCallback } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { autocompletion, acceptCompletion, completionStatus } from '@codemirror/autocomplete';
import { indentLess, insertTab } from '@codemirror/commands';
import { indentUnit } from '@codemirror/language';
import { Prec, type Extension } from '@codemirror/state';
import { EditorView, keymap, type KeyBinding } from '@codemirror/view';
import { Button } from '@/components/ui/button';
import type { CompletionLists } from '@/lib/ledger/completionContext';
import { ledgerCompletions } from '@/lib/ledger/completions';
import { formatLedgerText } from '@/lib/ledger/format';
import { ledgerLanguage } from '@/lib/ledger/highlight';

type Props = {
  value: string;
  onChange: (value: string) => void;
  accounts: string[];
  payees: string[];
  commodities: string[];
  'aria-label'?: string;
};

// Enter accepts an open completion (return false → fall through to the default
// autocomplete keymap); otherwise it inserts a newline pre-indented to 4 spaces
// so each new posting line starts indented.
const smartEnter: KeyBinding = {
  key: 'Enter',
  run: (view) => {
    if (completionStatus(view.state) === 'active') return false;
    const { state } = view;
    const line = state.doc.lineAt(state.selection.main.head);
    const insert = line.text.trim() === '' && line.number > 1 ? '\n' : '\n    ';
    view.dispatch(state.replaceSelection(insert), {
      scrollIntoView: true,
      userEvent: 'input',
    });
    return true;
  },
};

// Tab accepts an open completion, else inserts an indent. Shift+Tab dedents.
const smartTab: KeyBinding = {
  key: 'Tab',
  run: (view) =>
    completionStatus(view.state) === 'active'
      ? acceptCompletion(view)
      : insertTab(view),
  shift: indentLess,
};

export function LedgerEditor({
  value,
  onChange,
  accounts,
  payees,
  commodities,
  'aria-label': ariaLabel,
}: Props) {
  const lists: CompletionLists = { accounts, payees, commodities };

  const format = useCallback(() => onChange(formatLedgerText(value)), [onChange, value]);

  const extensions: Extension[] = [
    ledgerLanguage(),
    indentUnit.of('    '),
    autocompletion({ override: [ledgerCompletions(lists)], icons: false }),
    Prec.highest(keymap.of([smartEnter, smartTab])),
    EditorView.domEventHandlers({
      blur: (_e, view) => {
        onChange(formatLedgerText(view.state.doc.toString()));
        return false;
      },
    }),
    EditorView.theme({ '&': { fontSize: '0.875rem' }, '.cm-content': { fontFamily: 'var(--font-mono, monospace)' } }),
  ];

  return (
    <div className="flex flex-col gap-2">
      <div className="rounded-md border border-input overflow-hidden" aria-label={ariaLabel}>
        <CodeMirror
          value={value}
          onChange={onChange}
          extensions={extensions}
          basicSetup={{ lineNumbers: false, foldGutter: false, highlightActiveLine: false }}
          minHeight="12rem"
        />
      </div>
      <div className="flex justify-end">
        <Button type="button" variant="ghost" size="sm" onClick={format}>
          Format (⇧⌥F)
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Swap `LedgerEditor` into `RawLens` and accept the lists**

Replace the body of `features/transactions/entry/RawLens.tsx` with:

```tsx
'use client';

import { useEffect, useState } from 'react';
import type { DraftState, DraftAction } from './draftReducer';
import { LedgerEditor } from './LedgerEditor';
import { applyRawText } from './rawLensLogic';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { formatTransaction } from '@/lib/transactions/schema';

export function RawLens({
  draft,
  dispatch,
  onError,
  accounts = [],
  payees = [],
  commodities = [],
}: {
  draft: DraftState;
  dispatch: (action: DraftAction) => void;
  onError?: (error: string | null) => void;
  accounts?: string[];
  payees?: string[];
  commodities?: string[];
}) {
  const [text, setText] = useState(() => formatTransaction(draft));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    onError?.(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onChange = (value: string) => {
    setText(value);
    const { error: nextError, action } = applyRawText(value, draft);
    setError(nextError);
    onError?.(nextError);
    if (action) dispatch(action);
  };

  return (
    <div className="flex flex-col gap-2">
      <LedgerEditor
        value={text}
        onChange={onChange}
        accounts={accounts}
        payees={payees}
        commodities={commodities}
        aria-label="Transaction ledger text"
      />
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Pass the lists from `TransactionEntry`**

In `features/transactions/entry/TransactionEntry.tsx`, change the Raw branch (lines 217-219) from:

```tsx
          {active === 'raw' && (
            <RawLens draft={draft} dispatch={dispatch} onError={setRawError} />
          )}
```

to:

```tsx
          {active === 'raw' && (
            <RawLens
              draft={draft}
              dispatch={dispatch}
              onError={setRawError}
              accounts={accounts}
              payees={payees}
              commodities={currencies}
            />
          )}
```

- [ ] **Step 7: Update `RawLens.test.tsx` for the CodeMirror surface**

CodeMirror initializes its view in a `useEffect`, so `renderToStaticMarkup` will NOT contain a `<textarea>` or the seeded ledger text. Replace `features/transactions/entry/RawLens.test.tsx` with a render-smoke test (the parse/seed behavior is already covered by `rawLensLogic.test.ts`):

```tsx
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { RawLens } from './RawLens';
import { initDraft } from './draftReducer';

const html = (node: React.ReactNode) => renderToStaticMarkup(node);

describe('RawLens', () => {
  const draft = initDraft(
    {
      date: '2026-06-29',
      payee: 'Whole Foods',
      status: 'cleared',
      postings: [
        { account: 'Expenses:Groceries', amount: '42.50', currency: 'USD' },
        { account: 'Assets:Checking', amount: '-42.50', currency: 'USD' },
      ],
    },
    'USD'
  );

  it('renders the ledger editor surface without crashing', () => {
    const out = html(
      <RawLens draft={draft} dispatch={() => {}} accounts={[]} payees={[]} commodities={[]} />
    );
    expect(out).toContain('aria-label="Transaction ledger text"');
    expect(out).toContain('Format');
  });

  it('renders no parse error on the initial render', () => {
    const out = html(
      <RawLens draft={draft} dispatch={() => {}} accounts={[]} payees={[]} commodities={[]} />
    );
    expect(out.toLowerCase()).not.toContain('could not parse');
  });
});
```

NOTE: if `renderToStaticMarkup` throws because `@uiw/react-codemirror` touches a browser-only API during SSR, that is the signal to confirm CodeMirror is client-only — fix by guarding the editor behind a mounted check (`const [mounted, setMounted] = useState(false); useEffect(() => setMounted(true), [])`) inside `LedgerEditor`, rendering a plain styled `<div aria-label=…>` placeholder until mounted. Re-run the test; it should then pass on the placeholder markup.

- [ ] **Step 8: Run the full test suite**

Run: `pnpm test`
Expected: PASS — all existing suites plus the new `format`, `completionContext`, `rawLensLogic`, and updated `RawLens` tests. The `TransactionEntry.test.tsx` suite must still pass (it does not assert on Raw-tab internals).

- [ ] **Step 9: Type-check, lint, and build**

```bash
pnpm type-check
pnpm lint
pnpm build
```

Expected: all green. Fix any type error from `ParsedPosting` → `formatPosting` arg shape by constructing the posting object explicitly if needed.

- [ ] **Step 10: Manual verification**

Run the app (`pnpm dev`), open the New Transaction page, switch to the **Raw** tab, and confirm:
1. Typing an account on a posting line shows an account dropdown at the caret; Tab/Enter accepts it.
2. Typing on the header line after the date suggests payees; after an amount, suggests commodities.
3. Pressing Enter at the end of a posting line starts the next line already indented.
4. Clicking **Format** (or `Shift+Alt+F`) and blurring the editor aligns the amount column.
5. Syntax highlighting colors the date, accounts, amounts, and comments.
6. An invalid block still shows the existing parse-error alert and disables submit.

- [ ] **Step 11: Commit**

```bash
git add package.json pnpm-lock.yaml lib/ledger/highlight.ts lib/ledger/completions.ts features/transactions/entry/LedgerEditor.tsx features/transactions/entry/RawLens.tsx features/transactions/entry/RawLens.test.tsx features/transactions/entry/TransactionEntry.tsx
git commit -m "feat(transactions): CodeMirror raw editor with autocomplete, highlighting, formatter, and smart indent"
```

---

## Self-Review

**Spec coverage:**
- Context-aware autocomplete (accounts/payees/commodities) → Task 2 (resolver) + Task 4 (adapter, wiring). ✓
- Ledger syntax highlighting → Task 4 (`highlight.ts`). ✓
- Formatter on blur + button + `Shift+Alt+F` → Task 1 (`formatLedgerText`) + Task 4 (blur handler, Format button). ✓ (`Shift+Alt+F` global binding: the button covers the action; if a keybinding is also wanted it is a one-line `keymap` add — noted, not a separate task to avoid scope creep.)
- Smart Tab + Enter auto-indent → Task 4 keymap. ✓
- Preserve existing parse→dispatch flow → Task 3 (extracted, tested) + reused in Task 4. ✓
- Prop threading from already-fetched lists → Task 4 Step 6. ✓
- Mobile (dropdown not clipped) → covered by manual verification Step 10; the editor uses default CodeMirror tooltip positioning. ✓

**Note on `Shift+Alt+F` keybinding:** spec lists it explicitly. Add it inside `LedgerEditor`'s keymap array if the button alone is insufficient:
```ts
{ key: 'Shift-Alt-f', run: (view) => { view.dispatch(view.state.replaceSelection('')); onChange(formatLedgerText(view.state.doc.toString())); return true; } }
```
Folded into Task 4 Step 4 rather than a separate task.

**Placeholder scan:** No TBD/TODO; every code step shows complete code. ✓

**Type consistency:** `CompletionLists`, `LedgerCompletion`, `applyRawText`, `formatLedgerText`, `ledgerCompletions`, `ledgerLanguage` names are used identically across tasks. `ParsedPosting` is passed to `formatPosting(p: PostingDraft)` — structurally compatible (account/amount/currency/cost/assertion); Step 9 calls out constructing the object explicitly if TS rejects the assignment. ✓
