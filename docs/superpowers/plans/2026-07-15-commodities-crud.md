# Commodities CRUD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** CRUD for `commodity` directive blocks in `definitions.ledger`, as a second tab on `/currencies`.

**Architecture:** A pure parser/serializer module (`lib/commodities/blocks.ts`) round-trips commodity blocks; a service (`lib/commodities/service.ts`) does locked read-modify-write on `definitions.ledger` with ledger-verify + rollback, mirroring `JournalService.addTransaction`; one server action per operation; a client view with an edit dialog. Blocks the parser can't model are "opaque" and edited as raw text.

**Tech Stack:** Next.js server actions, Zod, vitest, ledger 3.4.1 CLI.

**Spec:** `docs/superpowers/specs/2026-07-15-commodities-crud-design.md`

## Global Constraints

- HARD RULE (CLAUDE.md): ledger does accounting math; JS only parses/orchestrates. The ledger-backed test in Task 6 must shell out to real `ledger`.
- No abbreviations in identifiers (`definition`, not `def`; established terms like `id`, `uid` are fine).
- No AI/Claude attribution anywhere (commits, comments, docs).
- Server actions: one action per file under `features/<feature>/actions/`, exported via `actions/index.ts`.
- Every write: `withUserLock` → `pull` → snapshot → mutate → `verifyJournalParseable` → rollback on failure → `push` → `revalidatePath`.
- Run `pnpm exec vitest run <file>` for tests; `pnpm lint` and `pnpm exec tsc --noEmit` before finishing.
- Commit after each task on branch `feat/commodities-crud` (create it from the current branch at Task 1).

---

### Task 1: Block parser + serializer

**Files:**
- Create: `lib/commodities/blocks.ts`
- Test: `lib/commodities/blocks.test.ts`

**Interfaces:**
- Produces (used by Tasks 3–5):

```ts
export type CommodityDefinition = {
  symbol: string;            // unquoted canonical symbol
  note: string;              // '' when absent
  aliases: string[];
  decimalPlaces: number | null; // null = no format line
  nomarket: boolean;
  isDefault: boolean;
};
export type CommodityBlock = CommodityDefinition & {
  startLine: number;  // 0-based, inclusive — the `commodity` line
  endLine: number;    // 0-based, inclusive — last line of the block
  opaque: boolean;    // block contains lines the model can't represent
  raw: string;        // verbatim block text (no trailing newline)
};
export const parseCommodityBlocks = (text: string): CommodityBlock[] => …
export const serializeCommodityBlock = (definition: CommodityDefinition): string => …
```

- [ ] **Step 1: Create branch**

```bash
git checkout -b feat/commodities-crud
```

- [ ] **Step 2: Write the failing test**

`lib/commodities/blocks.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  parseCommodityBlocks,
  serializeCommodityBlock,
  type CommodityDefinition,
} from './blocks';

const SAMPLE = [
  '; user comment outside blocks',
  'commodity KIRT',
  '\tnote Iranian Thousand Toman',
  '\tdefault',
  '\talias Kirt',
  '',
  'commodity $',
  '\tnote US Dollar',
  '\talias USD',
  '\tformat USD 1,000.00',
  '',
  'P 2026-01-01 BTC 100000 $',
  'commodity ADA',
  '\tformat ADA 1,000.00',
  '\tnomarket',
].join('\n');

describe('parseCommodityBlocks', () => {
  it('parses every block with spans and fields', () => {
    const blocks = parseCommodityBlocks(SAMPLE);
    expect(blocks.map((b) => b.symbol)).toEqual(['KIRT', '$', 'ADA']);
    const kirt = blocks[0];
    expect(kirt).toMatchObject({
      note: 'Iranian Thousand Toman',
      aliases: ['Kirt'],
      decimalPlaces: null,
      nomarket: false,
      isDefault: true,
      startLine: 1,
      endLine: 4,
      opaque: false,
    });
    expect(blocks[1]).toMatchObject({ symbol: '$', decimalPlaces: 2 });
    expect(blocks[2]).toMatchObject({ nomarket: true, decimalPlaces: 2 });
  });

  it('unquotes quoted symbols and reads symbol-after format samples', () => {
    const blocks = parseCommodityBlocks(
      'commodity "د.إ"\n\tformat 1,000.00 "د.إ"\n'
    );
    expect(blocks[0].symbol).toBe('د.إ');
    expect(blocks[0].decimalPlaces).toBe(2);
    expect(blocks[0].opaque).toBe(false);
  });

  it('marks blocks with unmodeled lines opaque but keeps raw text', () => {
    const text = 'commodity XYZ\n\t; inline comment\n\tnote n';
    const [block] = parseCommodityBlocks(text);
    expect(block.opaque).toBe(true);
    expect(block.raw).toBe(text);
  });

  it('marks a format sample without a numeric token opaque', () => {
    const [block] = parseCommodityBlocks('commodity X\n\tformat X abc');
    expect(block.opaque).toBe(true);
  });

  it('zero-decimal format parses as decimalPlaces 0', () => {
    const [block] = parseCommodityBlocks('commodity KIRT\n\tformat KIRT 1,000');
    expect(block.decimalPlaces).toBe(0);
  });
});

describe('serializeCommodityBlock', () => {
  const base: CommodityDefinition = {
    symbol: 'KIRT',
    note: 'Iranian Thousand Toman',
    aliases: ['Kirt'],
    decimalPlaces: 1,
    nomarket: false,
    isDefault: true,
  };

  it('emits canonical field order', () => {
    expect(serializeCommodityBlock(base)).toBe(
      [
        'commodity KIRT',
        '\tnote Iranian Thousand Toman',
        '\talias Kirt',
        '\tformat KIRT 1,000.0',
        '\tdefault',
      ].join('\n')
    );
  });

  it('quotes symbols containing separators, symbol-after form', () => {
    expect(
      serializeCommodityBlock({
        symbol: 'د.إ',
        note: '',
        aliases: [],
        decimalPlaces: 2,
        nomarket: true,
        isDefault: false,
      })
    ).toBe(
      ['commodity "د.إ"', '\tformat 1,000.00 "د.إ"', '\tnomarket'].join('\n')
    );
  });

  it('round-trips: parse(serialize(definition)) equals definition', () => {
    const [block] = parseCommodityBlocks(serializeCommodityBlock(base));
    expect(block).toMatchObject(base);
    expect(block.opaque).toBe(false);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm exec vitest run lib/commodities/blocks.test.ts`
Expected: FAIL — module `./blocks` not found.

- [ ] **Step 4: Implement `lib/commodities/blocks.ts`**

```ts
export type CommodityDefinition = {
  symbol: string;
  note: string;
  aliases: string[];
  decimalPlaces: number | null;
  nomarket: boolean;
  isDefault: boolean;
};

export type CommodityBlock = CommodityDefinition & {
  startLine: number;
  endLine: number;
  opaque: boolean;
  raw: string;
};

const unquote = (symbol: string): string =>
  symbol.replace(/^"(.*)"$/, '$1');

// Ledger requires quoting when the symbol contains digits or the characters
// it tokenizes on. Mirrors the quoting `extractDefinitions` applies.
const needsQuoting = (symbol: string): boolean => /[\d.,;\s"-]/.test(symbol);

const renderSymbol = (symbol: string): string =>
  needsQuoting(symbol) ? `"${symbol}"` : symbol;

const NUMBER_TOKEN = /-?[\d,]+(?:\.(\d+))?/;

/** Decimal places of a format sample, or null when it has no numeric token. */
const sampleDecimalPlaces = (sample: string): number | null => {
  const match = NUMBER_TOKEN.exec(sample);
  if (!match) return null;
  return match[1]?.length ?? 0;
};

export const parseCommodityBlocks = (text: string): CommodityBlock[] => {
  const lines = text.split('\n');
  const blocks: CommodityBlock[] = [];
  let current: (CommodityBlock & { lines: string[] }) | null = null;

  const close = () => {
    if (!current) return;
    // Drop trailing blank lines from the block span.
    while (
      current.lines.length > 1 &&
      current.lines[current.lines.length - 1].trim() === ''
    ) {
      current.lines.pop();
      current.endLine -= 1;
    }
    const { lines: blockLines, ...block } = current;
    blocks.push({ ...block, raw: blockLines.join('\n') });
    current = null;
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    const commodityMatch = /^commodity\s+(.+)$/.exec(trimmed);
    // A non-indented, non-blank line closes the open block.
    if (current && trimmed && !/^\s/.test(line) && !commodityMatch) close();
    if (commodityMatch && !/^\s/.test(line)) {
      close();
      current = {
        symbol: unquote(commodityMatch[1].trim()),
        note: '',
        aliases: [],
        decimalPlaces: null,
        nomarket: false,
        isDefault: false,
        startLine: index,
        endLine: index,
        opaque: false,
        raw: '',
        lines: [line],
      };
      return;
    }
    if (!current) return;
    current.lines.push(line);
    current.endLine = index;
    if (trimmed === '') return;

    const directive = /^(\S+)(?:\s+(.*))?$/.exec(trimmed);
    const keyword = directive?.[1];
    const argument = directive?.[2]?.trim() ?? '';
    if (keyword === 'note') current.note = argument;
    else if (keyword === 'alias') current.aliases.push(unquote(argument));
    else if (keyword === 'nomarket' && argument === '') current.nomarket = true;
    else if (keyword === 'default' && argument === '') current.isDefault = true;
    else if (keyword === 'format') {
      const decimals = sampleDecimalPlaces(argument);
      if (decimals === null) current.opaque = true;
      else current.decimalPlaces = decimals;
    } else current.opaque = true; // comment or unknown sub-directive
  });
  close();
  return blocks;
};

const formatSample = (decimalPlaces: number): string =>
  decimalPlaces > 0 ? `1,000.${'0'.repeat(decimalPlaces)}` : '1,000';

export const serializeCommodityBlock = (
  definition: CommodityDefinition
): string => {
  const lines = [`commodity ${renderSymbol(definition.symbol)}`];
  if (definition.note) lines.push(`\tnote ${definition.note}`);
  for (const alias of definition.aliases) {
    lines.push(`\talias ${renderSymbol(alias)}`);
  }
  if (definition.decimalPlaces !== null) {
    const sample = formatSample(definition.decimalPlaces);
    // A quoted symbol goes after the sample (the form ledger accepts for
    // symbols containing separator characters); a plain one prefixes it.
    lines.push(
      needsQuoting(definition.symbol)
        ? `\tformat ${sample} ${renderSymbol(definition.symbol)}`
        : `\tformat ${definition.symbol} ${sample}`
    );
  }
  if (definition.nomarket) lines.push('\tnomarket');
  if (definition.isDefault) lines.push('\tdefault');
  return lines.join('\n');
};
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm exec vitest run lib/commodities/blocks.test.ts`
Expected: PASS (all tests).

- [ ] **Step 6: Commit**

```bash
git add lib/commodities/blocks.ts lib/commodities/blocks.test.ts
git commit -m "feat(commodities): commodity block parser and serializer"
```

---

### Task 2: Extract `ensureIncluded` journal helper

`PricesService.prependInclude` (`lib/prices/service.ts:1076-1100`) is exactly the "make main journal include this file" logic the commodity service needs. Extract it; don't duplicate it.

**Files:**
- Create: `lib/journal/include.ts`
- Modify: `lib/prices/service.ts` (replace the private method body with a call)
- Test: `lib/journal/include.test.ts`

**Interfaces:**
- Produces: `ensureIncluded(repo: { readFile(p: string): Promise<string>; writeFileAtomic(p: string, c: string): Promise<void> }, mainPath: string, includedPath: string): Promise<void>`

- [ ] **Step 1: Write the failing test**

`lib/journal/include.test.ts`:

```ts
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ensureIncluded } from './include';

const repo = {
  readFile: (p: string) => fs.readFile(p, 'utf-8'),
  writeFileAtomic: async (p: string, c: string) => {
    await fs.writeFile(p, c, 'utf-8');
  },
};

describe('ensureIncluded', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'include-'));
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('prepends an include directive when missing', async () => {
    const main = path.join(dir, 'main.ledger');
    await fs.writeFile(main, '2026-01-01 x\n', 'utf-8');
    await ensureIncluded(repo, main, path.join(dir, 'definitions.ledger'));
    expect(await fs.readFile(main, 'utf-8')).toBe(
      'include ./definitions.ledger\n2026-01-01 x\n'
    );
  });

  it('is idempotent', async () => {
    const main = path.join(dir, 'main.ledger');
    await fs.writeFile(main, 'include ./definitions.ledger\n', 'utf-8');
    await ensureIncluded(repo, main, path.join(dir, 'definitions.ledger'));
    expect(await fs.readFile(main, 'utf-8')).toBe(
      'include ./definitions.ledger\n'
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run lib/journal/include.test.ts`
Expected: FAIL — module `./include` not found.

- [ ] **Step 3: Create `lib/journal/include.ts`**

Move the body of `PricesService.prependInclude` verbatim (it is at `lib/prices/service.ts:1076-1100`), generalized to take the repository as a parameter:

```ts
import path from 'path';

type FileAccess = {
  readFile(absolutePath: string): Promise<string>;
  writeFileAtomic(absolutePath: string, content: string): Promise<void>;
};

/** Prepend `include <relpath>` to the main journal unless already present, so
 * declarations in the included file resolve before any posting that uses them. */
export const ensureIncluded = async (
  repo: FileAccess,
  mainPath: string,
  includedPath: string
): Promise<void> => {
  const main = await repo.readFile(mainPath).catch(() => '');
  let rel = path
    .relative(path.dirname(mainPath), includedPath)
    .split(path.sep)
    .join('/');
  if (!rel.startsWith('.')) rel = `./${rel}`;
  const directive = `include ${rel}`;
  const mainDir = path.dirname(mainPath);
  const alreadyIncluded = main.split('\n').some((line) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith('include ')) return false;
    const target = trimmed.slice('include '.length).trim();
    if (!target) return false;
    return path.resolve(mainDir, target) === path.resolve(includedPath);
  });
  if (alreadyIncluded) return;
  await repo.writeFileAtomic(mainPath, `${directive}\n${main}`);
};
```

In `lib/prices/service.ts`, delete the `prependInclude` private method and replace its one call site (`await this.prependInclude(layout.mainPath, defsPath)` at line 1017) with:

```ts
await ensureIncluded(this.deps.journalRepo, layout.mainPath, defsPath);
```

adding `import { ensureIncluded } from '@/lib/journal/include';` to that file's imports.

- [ ] **Step 4: Run tests**

Run: `pnpm exec vitest run lib/journal/include.test.ts lib/prices/service-definitions.test.ts`
Expected: PASS — both the new tests and the existing relocation tests.

- [ ] **Step 5: Commit**

```bash
git add lib/journal/include.ts lib/journal/include.test.ts lib/prices/service.ts
git commit -m "refactor(journal): extract ensureIncluded from prices service"
```

---

### Task 3: Commodity definitions service

**Files:**
- Create: `lib/commodities/service.ts`
- Create: `lib/commodities/index.ts`
- Test: `lib/commodities/service.test.ts`

**Interfaces:**
- Consumes: `parseCommodityBlocks`, `serializeCommodityBlock`, `CommodityDefinition`, `CommodityBlock` (Task 1); `ensureIncluded` (Task 2); `JournalRepository`, `verifyJournalParseable`, `withUserLock`, `pull`, `push`, `DEFINITIONS_NAME`, `GENERATED_PRICE_DB_NAME`, `DEFINITIONS_BANNER`.
- Produces (used by Task 4):

```ts
export type CommodityRow = CommodityBlock & { file: string; editable: boolean };
export type CommodityWriteResult = { ok: true } | { ok: false; message: string };
export class CommodityDefinitionService {
  constructor(repo: JournalRepository) {}
  list(userId: string): Promise<CommodityRow[]>;
  create(userId: string, definition: CommodityDefinition): Promise<CommodityWriteResult>;
  update(userId: string, symbol: string, next: CommodityDefinition | { raw: string }): Promise<CommodityWriteResult>;
  remove(userId: string, symbol: string): Promise<CommodityWriteResult>;
}
export const commodityDefinitionService: CommodityDefinitionService; // singleton in index.ts
```

- [ ] **Step 1: Write the failing test**

`lib/commodities/service.test.ts` (setup mirrors `lib/journal/repository.test.ts:13-29` — `setupTestDb`/`teardownTestDb` from `@/lib/test-utils/db`, `resetObjectStore` from `@/lib/storage`, and wiping `getJournalDir('test-user')`):

```ts
import { promises as fs } from 'fs';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CommodityDefinitionService } from './service';
import { getJournalDir } from '@/lib/journal/layout';
import { JournalRepository } from '@/lib/journal/repository';
import { resetObjectStore } from '@/lib/storage';
import {
  setupTestDb,
  teardownTestDb,
  type TestDbContext,
} from '@/lib/test-utils/db';

const USER = 'test-user';

describe('CommodityDefinitionService', () => {
  let ctx: TestDbContext;
  let service: CommodityDefinitionService;
  let dir: string;

  beforeEach(async () => {
    ctx = await setupTestDb('commodities-');
    await ctx.insertUser(USER, 'Test', 'test@example.com');
    service = new CommodityDefinitionService(new JournalRepository(ctx.db));
    resetObjectStore();
    dir = getJournalDir(USER);
    await fs.rm(dir, { recursive: true, force: true });
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, 'main.ledger'),
      '2026-07-14 cigarette\n    Expenses:Wage    KIRT 0.9\n    Assets:Bank\n',
      'utf-8'
    );
  });

  afterEach(async () => {
    await teardownTestDb(ctx);
    resetObjectStore();
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('create writes definitions.ledger, includes it, and lists it back', async () => {
    const result = await service.create(USER, {
      symbol: 'KIRT',
      note: 'Iranian Thousand Toman',
      aliases: ['Kirt'],
      decimalPlaces: 1,
      nomarket: false,
      isDefault: false,
    });
    expect(result).toEqual({ ok: true });
    const main = await fs.readFile(path.join(dir, 'main.ledger'), 'utf-8');
    expect(main).toContain('include ./definitions.ledger');
    const rows = await service.list(USER);
    const kirt = rows.find((row) => row.symbol === 'KIRT');
    expect(kirt).toMatchObject({ decimalPlaces: 1, editable: true });
  });

  it('update rewrites only that block; remove deletes it', async () => {
    await service.create(USER, {
      symbol: 'KIRT', note: '', aliases: [], decimalPlaces: null,
      nomarket: false, isDefault: false,
    });
    await service.create(USER, {
      symbol: 'ADA', note: '', aliases: [], decimalPlaces: 2,
      nomarket: true, isDefault: false,
    });
    const updated = await service.update(USER, 'KIRT', {
      symbol: 'KIRT', note: 'toman', aliases: ['Kirt'], decimalPlaces: 1,
      nomarket: false, isDefault: false,
    });
    expect(updated).toEqual({ ok: true });
    const removed = await service.remove(USER, 'ADA');
    expect(removed).toEqual({ ok: true });
    const rows = await service.list(USER);
    expect(rows.map((row) => row.symbol)).toEqual(['KIRT']);
    expect(rows[0].note).toBe('toman');
  });

  it('setting default clears the previous holder', async () => {
    for (const symbol of ['KIRT', 'ADA']) {
      await service.create(USER, {
        symbol, note: '', aliases: [], decimalPlaces: null,
        nomarket: false, isDefault: symbol === 'KIRT',
      });
    }
    await service.update(USER, 'ADA', {
      symbol: 'ADA', note: '', aliases: [], decimalPlaces: null,
      nomarket: false, isDefault: true,
    });
    const rows = await service.list(USER);
    expect(rows.find((r) => r.symbol === 'KIRT')?.isDefault).toBe(false);
    expect(rows.find((r) => r.symbol === 'ADA')?.isDefault).toBe(true);
  });

  it('rolls back when ledger rejects the result', async () => {
    await service.create(USER, {
      symbol: 'BTC', note: '', aliases: [], decimalPlaces: null,
      nomarket: false, isDefault: false,
    });
    // An alias equal to an existing commodity symbol aborts ledger's parse.
    const result = await service.update(USER, 'BTC', {
      raw: 'commodity BTC\n\talias BTC',
    });
    expect(result.ok).toBe(false);
    const definitions = await fs.readFile(
      path.join(dir, 'definitions.ledger'),
      'utf-8'
    );
    expect(definitions).not.toContain('alias BTC');
  });

  it('rejects duplicate create and unknown update/remove symbols', async () => {
    await service.create(USER, {
      symbol: 'KIRT', note: '', aliases: [], decimalPlaces: null,
      nomarket: false, isDefault: false,
    });
    expect(
      (await service.create(USER, {
        symbol: 'KIRT', note: '', aliases: [], decimalPlaces: null,
        nomarket: false, isDefault: false,
      })).ok
    ).toBe(false);
    expect((await service.remove(USER, 'NOPE')).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run lib/commodities/service.test.ts`
Expected: FAIL — module `./service` not found.

- [ ] **Step 3: Implement `lib/commodities/service.ts`**

```ts
import { promises as fs } from 'fs';
import path from 'path';
import {
  parseCommodityBlocks,
  serializeCommodityBlock,
  type CommodityBlock,
  type CommodityDefinition,
} from './blocks';
import { ensureIncluded } from '@/lib/journal/include';
import {
  DEFINITIONS_NAME,
  GENERATED_PRICE_DB_NAME,
  PRICE_DB_NAME,
} from '@/lib/journal/layout';
import { withUserLock } from '@/lib/journal/mutex';
import type { JournalRepository } from '@/lib/journal/repository';
import { verifyJournalParseable } from '@/lib/journal/verify';
import { DEFINITIONS_BANNER } from '@/lib/prices/formatter';
import { pull, push, StorageConflictError } from '@/lib/storage';

export type CommodityRow = CommodityBlock & {
  file: string;
  editable: boolean;
};

export type CommodityWriteResult =
  | { ok: true }
  | { ok: false; message: string };

/**
 * CRUD over `commodity` directive blocks in the user's `definitions.ledger`.
 * Blocks found in other journal files (legacy `price-db.ledger`, hand-made
 * includes) are listed read-only. Every mutation is verified with ledger and
 * rolled back if the resulting file set does not parse.
 */
export class CommodityDefinitionService {
  constructor(private readonly repo: JournalRepository) {}

  private definitionsPath(dir: string): string {
    return path.join(dir, DEFINITIONS_NAME);
  }

  async list(userId: string): Promise<CommodityRow[]> {
    await pull(userId).catch(() => {}); // locked journal → list what's local
    const layout = await this.repo.ensureLayout(userId);
    const rows: CommodityRow[] = [];
    const entries = await fs.readdir(layout.dir).catch(() => [] as string[]);
    for (const name of entries) {
      if (!/\.(ledger|dat|journal|txt)$/.test(name)) continue;
      if (name === GENERATED_PRICE_DB_NAME) continue;
      const text = await this.repo
        .readFile(path.join(layout.dir, name))
        .catch(() => '');
      for (const block of parseCommodityBlocks(text)) {
        rows.push({ ...block, file: name, editable: name === DEFINITIONS_NAME });
      }
    }
    return rows.sort((a, b) => a.symbol.localeCompare(b.symbol));
  }

  create(
    userId: string,
    definition: CommodityDefinition
  ): Promise<CommodityWriteResult> {
    return this.mutate(userId, (blocks) => {
      if (blocks.some((block) => block.symbol === definition.symbol)) {
        return { error: `${definition.symbol} is already defined` };
      }
      return {
        blocks: [
          ...this.withDefaultCleared(blocks, definition),
          { text: serializeCommodityBlock(definition) },
        ],
      };
    });
  }

  update(
    userId: string,
    symbol: string,
    next: CommodityDefinition | { raw: string }
  ): Promise<CommodityWriteResult> {
    return this.mutate(userId, (blocks) => {
      const index = blocks.findIndex((block) => block.symbol === symbol);
      if (index === -1) return { error: `${symbol} is not defined` };
      if ('raw' in next) {
        const result = blocks.map((block) => ({ text: block.raw }));
        result[index] = { text: next.raw };
        return { blocks: result };
      }
      const result = this.withDefaultCleared(blocks, next);
      result[index] = { text: serializeCommodityBlock(next) };
      return { blocks: result };
    });
  }

  remove(userId: string, symbol: string): Promise<CommodityWriteResult> {
    return this.mutate(userId, (blocks) => {
      if (!blocks.some((block) => block.symbol === symbol)) {
        return { error: `${symbol} is not defined` };
      }
      return {
        blocks: blocks
          .filter((block) => block.symbol !== symbol)
          .map((block) => ({ text: block.raw })),
      };
    });
  }

  /** Re-serialize every block, clearing `default` from previous holders when
   * the incoming definition claims it. Opaque blocks stay verbatim. */
  private withDefaultCleared(
    blocks: CommodityBlock[],
    incoming: CommodityDefinition
  ): { text: string }[] {
    return blocks.map((block) => {
      if (
        incoming.isDefault &&
        block.isDefault &&
        block.symbol !== incoming.symbol &&
        !block.opaque
      ) {
        return { text: serializeCommodityBlock({ ...block, isDefault: false }) };
      }
      return { text: block.raw };
    });
  }

  /**
   * Locked read-modify-write on definitions.ledger: parse current blocks, let
   * `change` produce the next block list, rewrite the file (preserving the
   * banner/header lines above the first block), verify with ledger, roll back
   * on rejection, push. Mirrors JournalService.addTransaction's write flow.
   */
  private mutate(
    userId: string,
    change: (
      blocks: CommodityBlock[]
    ) => { blocks: { text: string }[] } | { error: string }
  ): Promise<CommodityWriteResult> {
    return withUserLock(userId, async (): Promise<CommodityWriteResult> => {
      try {
        await pull(userId);
      } catch {
        return { ok: false, message: 'Journal is locked or unavailable.' };
      }
      const layout = await this.repo.ensureLayout(userId);
      const definitionsPath = this.definitionsPath(layout.dir);
      const original = await this.repo
        .readFile(definitionsPath)
        .catch(() => null);
      const mainOriginal = await this.repo.readFile(layout.mainPath);

      const current = original ?? '';
      const blocks = parseCommodityBlocks(current);
      const outcome = change(blocks);
      if ('error' in outcome) return { ok: false, message: outcome.error };

      // Header = everything above the first block (banner, user comments).
      const headerEnd = blocks.length > 0 ? blocks[0].startLine : null;
      const header =
        headerEnd !== null
          ? current.split('\n').slice(0, headerEnd).join('\n').trimEnd()
          : current.trimEnd() || DEFINITIONS_BANNER;
      const body = outcome.blocks.map((block) => block.text).join('\n\n');
      const nextText = `${header ? header + '\n\n' : ''}${body}\n`;

      await this.repo.writeFileAtomic(definitionsPath, nextText);
      await ensureIncluded(this.repo, layout.mainPath, definitionsPath);

      const generatedPath = path.join(layout.dir, GENERATED_PRICE_DB_NAME);
      const priceDbPath = await fs
        .access(generatedPath)
        .then(() => generatedPath)
        .catch(() =>
          fs
            .access(path.join(layout.dir, PRICE_DB_NAME))
            .then(() => path.join(layout.dir, PRICE_DB_NAME))
            .catch(() => undefined)
        );
      const verify = await verifyJournalParseable(layout.mainPath, priceDbPath);
      if (!verify.ok) {
        if (original === null) await fs.rm(definitionsPath, { force: true });
        else await this.repo.writeFileAtomic(definitionsPath, original);
        await this.repo.writeFileAtomic(layout.mainPath, mainOriginal);
        return {
          ok: false,
          message: `Ledger rejected the definition: ${verify.message}`,
        };
      }
      try {
        await push(userId);
      } catch (error) {
        if (original === null) await fs.rm(definitionsPath, { force: true });
        else await this.repo.writeFileAtomic(definitionsPath, original);
        await this.repo.writeFileAtomic(layout.mainPath, mainOriginal);
        return {
          ok: false,
          message:
            error instanceof StorageConflictError
              ? error.message
              : 'Failed to save journal to storage.',
        };
      }
      return { ok: true };
    });
  }
}
```

`lib/commodities/index.ts`:

```ts
import { CommodityDefinitionService } from './service';
import { db } from '@/lib/db/connection';
import { JournalRepository } from '@/lib/journal/repository';

export {
  type CommodityDefinition,
  type CommodityBlock,
} from './blocks';
export {
  CommodityDefinitionService,
  type CommodityRow,
  type CommodityWriteResult,
} from './service';

export const commodityDefinitionService = new CommodityDefinitionService(
  new JournalRepository(db)
);
```

(Check how `lib/journal/index.ts` constructs its singleton — line 6 is `export const journalService = new JournalService(journalRepository);` — and mirror the exact db/repository import it uses rather than the guess above if it differs.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run lib/commodities/service.test.ts`
Expected: PASS. If the rollback test fails because ledger accepts `alias BTC` on its own commodity, change the invalid raw block to `commodity BTC\n\tbogus-directive x` — the goal is only "ledger rejects → file restored". Verify what ledger 3.4.1 actually rejects by running it, per CLAUDE.md.

- [ ] **Step 5: Commit**

```bash
git add lib/commodities/
git commit -m "feat(commodities): definitions service with verify and rollback"
```

---

### Task 4: Server actions

**Files:**
- Create: `features/commodities/actions/listCommodities.ts`
- Create: `features/commodities/actions/createCommodity.ts`
- Create: `features/commodities/actions/updateCommodity.ts`
- Create: `features/commodities/actions/deleteCommodity.ts`
- Create: `features/commodities/actions/schema.ts`
- Create: `features/commodities/actions/index.ts`

**Interfaces:**
- Consumes: `commodityDefinitionService`, `CommodityRow` (Task 3); `requireUser` from `@/lib/auth/require-user`; `rateLimit, READ, WRITE, RATE_LIMIT_MESSAGE` from `@/lib/rate-limit`; `auditService, auditRequestMeta` from `@/lib/audit` (mirror `features/currencies/actions/upsertMapping.ts` exactly for the guard order).
- Produces (used by Task 5): `listCommoditiesAction(): Promise<CommodityRow[]>`, `createCommodityAction(input: unknown)`, `updateCommodityAction(input: unknown)`, `deleteCommodityAction(input: unknown)` — all mutations return `{ ok: true } | { ok: false; message: string }`.

- [ ] **Step 1: Write `schema.ts`**

```ts
import { z } from 'zod';

const symbolSchema = z
  .string()
  .trim()
  .min(1, 'Symbol is required')
  .max(10, 'Symbol is too long')
  .refine(
    (value) => /^[^\s\x00-\x1f;"]+$/.test(value),
    'Symbol contains forbidden characters'
  );

export const commodityDefinitionSchema = z
  .object({
    symbol: symbolSchema,
    note: z.string().trim().max(200, 'Note is too long').default(''),
    aliases: z.array(symbolSchema).max(10).default([]),
    decimalPlaces: z.number().int().min(0).max(8).nullable(),
    nomarket: z.boolean().default(false),
    isDefault: z.boolean().default(false),
  })
  .refine(
    (value) =>
      new Set([value.symbol, ...value.aliases]).size ===
      value.aliases.length + 1,
    { message: 'Aliases must be distinct from each other and the symbol' }
  );

export const updateCommoditySchema = z.union([
  z.object({ symbol: symbolSchema, definition: commodityDefinitionSchema }),
  z.object({ symbol: symbolSchema, raw: z.string().max(2000) }),
]);
```

- [ ] **Step 2: Write the four actions**

Each is `'use server'`, one per file, guard order copied from `features/currencies/actions/upsertMapping.ts:16-19`. `createCommodity.ts` shown in full; `updateCommodity.ts` and `deleteCommodity.ts` are the same shell around their service call:

```ts
'use server';

import { commodityDefinitionSchema } from './schema';
import { auditService, auditRequestMeta } from '@/lib/audit';
import { requireUser } from '@/lib/auth/require-user';
import { commodityDefinitionService } from '@/lib/commodities';
import { rateLimit, WRITE, RATE_LIMIT_MESSAGE } from '@/lib/rate-limit';
import { revalidatePath } from 'next/cache';

export async function createCommodityAction(
  input: unknown
): Promise<{ ok: true } | { ok: false; message: string }> {
  const user = await requireUser();
  if (!rateLimit(WRITE, user.id).allowed) {
    return { ok: false, message: RATE_LIMIT_MESSAGE };
  }
  const parsed = commodityDefinitionSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? 'Invalid input',
    };
  }
  const result = await commodityDefinitionService.create(user.id, parsed.data);
  await auditService.record(user.id, {
    action: 'commodity.create',
    result: result.ok ? 'success' : 'failure',
    detail: { symbol: parsed.data.symbol },
    ...(await auditRequestMeta()),
  });
  if (result.ok) revalidatePath('/currencies');
  return result;
}
```

- `updateCommodityAction` parses `updateCommoditySchema`, calls `service.update(user.id, parsed.data.symbol, 'raw' in parsed.data ? { raw: parsed.data.raw } : parsed.data.definition)`, audit action `commodity.update`.
- `deleteCommodityAction` parses `z.object({ symbol: symbolSchema })` (export `symbolSchema` from `schema.ts`), calls `service.remove`, audit action `commodity.delete`.
- `listCommoditiesAction` is `'use server'`, `requireUser` + `rateLimit(READ, …)` (return `[]` when limited), returns `commodityDefinitionService.list(user.id)`.
- If `auditService.record` rejects unknown action strings (check `lib/audit` for an action union type), add `commodity.create|update|delete` to that union.

`index.ts` re-exports all four actions and the schema types.

- [ ] **Step 3: Type-check and lint**

Run: `pnpm exec tsc --noEmit && pnpm lint`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add features/commodities/actions
git commit -m "feat(commodities): server actions for definition CRUD"
```

---

### Task 5: UI — tabs on /currencies + Commodities view

**Files:**
- Create: `features/commodities/CommoditiesView.tsx`
- Create: `features/commodities/CommodityDialog.tsx`
- Create: `features/currencies/CurrenciesTabs.tsx`
- Modify: `app/currencies/page.tsx`

**Interfaces:**
- Consumes: actions from Task 4; `CommodityRow`; `TabBar` from `@/features/transactions/entry/TabBar` (usage pattern: `features/prices/PricesTabs.tsx`); `Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle` from `@/components/ui/dialog`; `Button`, `Input`, `PageContainer`, `TableScroll` — all existing components.

- [ ] **Step 1: `CurrenciesTabs.tsx`**

Client component modeled line-for-line on `features/prices/PricesTabs.tsx`:

```tsx
'use client';

import { useState } from 'react';
import CurrenciesView from './CurrenciesView';
import type { MappingRow } from './actions';
import PageContainer from '@/components/PageContainer';
import CommoditiesView from '@/features/commodities/CommoditiesView';
import { TabBar } from '@/features/transactions/entry/TabBar';
import type { CommodityRow } from '@/lib/commodities';

const TABS = [
  { id: 'mapping', label: 'Price mapping' },
  { id: 'commodities', label: 'Commodities' },
];

type Props = {
  mappingRows: MappingRow[];
  commodityRows: CommodityRow[];
  observedSymbols: string[];
};

export const CurrenciesTabs = ({
  mappingRows,
  commodityRows,
  observedSymbols,
}: Props) => {
  const [active, setActive] = useState('mapping');
  return (
    <PageContainer>
      <header>
        <h1 className="text-2xl font-semibold">Currencies</h1>
      </header>
      <TabBar tabs={TABS} active={active} onSelect={setActive} />
      {active === 'mapping' ? (
        <CurrenciesView rows={mappingRows} />
      ) : (
        <CommoditiesView
          rows={commodityRows}
          observedSymbols={observedSymbols}
        />
      )}
    </PageContainer>
  );
};
```

Note: `CurrenciesView` currently wraps itself in `PageContainer` — check it, and if so lift the container out (render its table without the page chrome) so it nests inside the tabs. Keep the diff minimal.

`app/currencies/page.tsx` becomes:

```tsx
import { CurrenciesTabs } from '@/features/currencies/CurrenciesTabs';
import { listMappingsAction } from '@/features/currencies/actions';
import { listCommoditiesAction } from '@/features/commodities/actions';
import { requireUser } from '@/lib/auth/require-user';
import { getAvailableCurrencies } from '@/lib/settings/getAvailableCurrencies';

export const dynamic = 'force-dynamic';

export default async function CurrenciesPage() {
  await requireUser();
  const [mappingRows, commodityRows, { currencies }] = await Promise.all([
    listMappingsAction(),
    listCommoditiesAction(),
    getAvailableCurrencies(),
  ]);
  return (
    <CurrenciesTabs
      mappingRows={mappingRows}
      commodityRows={commodityRows}
      observedSymbols={currencies}
    />
  );
}
```

- [ ] **Step 2: `CommoditiesView.tsx`**

Client component. Behavior:

- Build the row set: every `CommodityRow`, plus one synthetic `{ symbol, editable: true, undefined: true }` row per `observedSymbols` entry with no matching block or alias — rendered with an "Add definition" button that opens the dialog in create mode with the symbol pre-filled.
- Table columns: Symbol · Note · Aliases (comma-joined) · Decimals (`—` when null) · Flags (`nomarket`, `default` as small badges) · action button.
- Editable rows (`editable && !opaque`): "Edit" opens `CommodityDialog` in form mode. Opaque editable rows: "Edit raw" opens the dialog with a `<textarea>` seeded with `row.raw`, saved via `updateCommodityAction({ symbol, raw })`.
- Non-editable rows: muted text `defined in <file>` instead of a button.
- Delete lives inside the dialog (a destructive-variant button) and calls `deleteCommodityAction({ symbol })`.
- After any successful action: `router.refresh()` (matches how `TransactionEditDialog.onSave` refreshes) and close the dialog; on failure show `result.message` inline in the dialog.
- Wrap the table in `TableScroll` (see `CurrenciesView` for usage).

- [ ] **Step 3: `CommodityDialog.tsx`**

Controlled dialog (`open`/`onOpenChange` props) with `useState` for the field set `{ note, aliases: string, decimalPlaces: string, nomarket, isDefault }` — aliases as a comma-separated text input split/trimmed on save; decimals as `<Input type="number" min={0} max={8}>` where empty string maps to `null`. Symbol input is disabled in edit mode. Save button `disabled` while a `useTransition` is pending. Compose payloads:

```ts
const definition = {
  symbol,
  note: note.trim(),
  aliases: aliases.split(',').map((a) => a.trim()).filter(Boolean),
  decimalPlaces: decimalPlaces === '' ? null : Number(decimalPlaces),
  nomarket,
  isDefault,
};
```

create mode → `createCommodityAction(definition)`; edit mode → `updateCommodityAction({ symbol, definition })`.

- [ ] **Step 4: Verify in the running app**

```bash
pnpm exec tsc --noEmit && pnpm lint && pnpm exec vitest run
```

Then start the dev server and check `/currencies`: both tabs render; editing KIRT's decimals to 1 in the dev journal (`data/journals/…`) succeeds and the dashboard's `KIRT 0.702`-style values keep their decimals. (Dev data already has definitions in legacy `price-db.ledger` — those rows must appear read-only with the "defined in price-db.ledger" hint.)

- [ ] **Step 5: Commit**

```bash
git add features/commodities features/currencies/CurrenciesTabs.tsx app/currencies/page.tsx
git commit -m "feat(currencies): commodities definitions tab with edit dialog"
```

---

### Task 6: Ledger-backed display-precision test

Proves the whole point end-to-end: saving a decimals value changes ledger's rendered register output.

**Files:**
- Modify: `lib/commodities/service.test.ts` (append one test)

- [ ] **Step 1: Write the test**

Append to the existing describe block:

```ts
it('saving decimalPlaces changes ledger register rendering (0.9 no longer shows as 1)', async () => {
  const { execFile } = await import('child_process');
  const { promisify } = await import('util');
  const run = promisify(execFile);
  const mainPath = path.join(dir, 'main.ledger');
  const register = async () => {
    const { LEDGER_PRICE_DB: _p, LEDGER_FILE: _f, ...env } = process.env;
    const { stdout } = await run(
      'ledger',
      ['--init-file', '/dev/null', '-f', mainPath, 'reg', 'Expenses:Wage',
       '--format', '%t\n'],
      { env }
    );
    return stdout.trim();
  };

  await service.create(USER, {
    symbol: 'KIRT', note: '', aliases: [], decimalPlaces: 0,
    nomarket: false, isDefault: false,
  });
  expect(await register()).toBe('KIRT 1'); // 0-decimal format rounds display

  await service.update(USER, 'KIRT', {
    symbol: 'KIRT', note: '', aliases: [], decimalPlaces: 1,
    nomarket: false, isDefault: false,
  });
  expect(await register()).toBe('KIRT 0.9');
});
```

- [ ] **Step 2: Run it**

Run: `pnpm exec vitest run lib/commodities/service.test.ts`
Expected: PASS. If the exact strings differ (e.g. ledger renders `KIRT0.9` without a space when the journal used suffix-commodity style), adjust the *expected strings* to what real ledger prints — never the service — and note why.

- [ ] **Step 3: Full verification and commit**

```bash
pnpm exec vitest run && pnpm lint && pnpm exec tsc --noEmit
git add lib/commodities/service.test.ts
git commit -m "test(commodities): ledger-verified display precision round trip"
```
