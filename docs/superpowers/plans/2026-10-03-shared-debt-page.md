# Shared Debt Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A revocable, read-only link to one person's debts with you. It is
rebuilt after every save and stays encrypted at rest.

**Architecture:** A `debtShare` row holds two AES-256-GCM blobs: the person's
page and the share's meta (person + your display name). Both keys come from the
session DEK through HKDF, so the server can produce them only while you are
unlocked. `push()` rebuilds every share after a successful upload. The public
`/s/[shareId]` page ships the ciphertext. The visitor's browser decrypts it with
the key from the URL fragment.

**Tech Stack:** Next.js app router, Drizzle + Postgres, Node `crypto`, WebCrypto, zod, vitest, ledger 3.4.1.

**Spec:** `docs/superpowers/specs/2026-10-03-shared-debt-page-design.md`

## Global Constraints

- Ledger does all accounting math. JS never adds, negates or converts amounts. It reads only the sign of ledger's `quantity` to pick a direction (see CLAUDE.md).
- Every ledger call for a person uses `personAccountPatterns` for both `Assets:Receivable` and `Liabilities:Payable`, after `--`.
- No `-X`: shared amounts stay in their own commodity.
- Never log journal content, amounts, payees, or person names. Log only ids and errors (see `lib/log/index.ts`).
- A failed rebuild never fails or rolls back a save.
- No abbreviations in identifiers (`button`, not `btn`). Files stay under 600 lines of code.
- No mention of AI tools in code, comments or commits.

## Review Focus

1. **A person whose name is a prefix of another's** ("Bob" and "Bobby"): Bob's page must not show Bobby's rows. Test in Task 3.
2. **A debt in two currencies with opposite directions** (he owes €, you owe $): two header lines, one each way. Test in Task 3.
3. **Saving while locked** (a background job with no DEK): the rebuild is skipped silently, with no database or ledger call. Test in Task 5.
4. **A tampered or swapped blob** (a page blob moved to another share id, or a wrong fragment key): the page shows "no longer active" and never shows garbage. Tests in Tasks 2 and 6.
5. **The other side of a transaction** (`Assets:Bank:Savings`) never appears in the payload. Test in Task 3.

---

## File Map

| File | Job |
|---|---|
| `db/schema/debtShare.ts` | table definition |
| `db/migrations/0015_*.sql` | generated migration |
| `lib/debt-share/repository.ts` | CRUD over `debtShare` |
| `lib/debt-share/seal.ts` | key derivation, seal/unseal (Node crypto) |
| `lib/debt-share/payload.ts` | zod schemas + types for the page and the meta (shared with the browser) |
| `lib/debt-share/ledger.ts` | ledger args + output parsers for one person's flipped register and net |
| `lib/debt-share/service.ts` | create, revoke, linkFor, sharedPeople, refresh |
| `lib/debt-share/index.ts` | production singletons |
| `lib/debt-share/refresh.ts` | never-throwing post-push hook |
| `lib/storage/sync.ts` | `push` calls the hook |
| `lib/crypto/resetEncryption.ts` | deletes shares on reset |
| `components/AppShell/publicPaths.ts` | `/s/` prefix is public |
| `proxy.ts` | privacy headers on `/s/` |
| `features/debtShare/lib/openSharedPage.ts` | browser-side decrypt + validate |
| `features/debtShare/SharedDebtView.tsx` | Bashir's page (client) |
| `app/s/[shareId]/page.tsx` | thin route shell |
| `features/debtShare/actions/createDebtShare.ts` | server action |
| `features/debtShare/actions/revokeDebtShare.ts` | server action |
| `features/debtShare/ShareControls.tsx` | Share / Copy link / Revoke on the owner's page |
| `features/debtShare/index.ts` | barrel |
| `features/debts/PersonDebts.tsx`, `features/debts/Debts.tsx` | mount controls, "Shared" marker |
| `lib/audit/schema.ts`, `lib/audit/describe.ts` | two new audit actions |

---

### Task 1: `debtShare` table and repository

**Files:**
- Create: `db/schema/debtShare.ts`, `lib/debt-share/repository.ts`, `lib/debt-share/repository.test.ts`
- Modify: `db/schema/index.ts`, `drizzle.config.ts` (`tablesFilter`)
- Generated: `db/migrations/0015_*.sql` + `db/migrations/meta/*`

**Interfaces:**
- Produces: `debtShare`, `DebtShare`, `NewDebtShare` from `@/db/schema`; `class DebtShareRepository(db: DbInstance)` with
  `listByUser(userId): Promise<DebtShare[]>`, `findById(id): Promise<DebtShare | null>`, `create(input: NewDebtShare): Promise<void>`,
  `updatePage(userId, id, sealedPage: string, updatedAt: Date): Promise<void>`, `delete(userId, id): Promise<boolean>`, `deleteByUser(userId): Promise<void>`.

- [ ] **Step 1: Write the schema**

`db/schema/debtShare.ts`:

```ts
import { sql } from 'drizzle-orm';
import { user } from '@naeemba/next-starter/schema';
import { index, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

// One row per person whose debt page the owner shares by link. Both blobs are
// AES-256-GCM sealed with keys derived from the owner's DEK (lib/debt-share/
// seal.ts), so the database never learns who is shared with or what they see.
export const debtShare = pgTable(
  'debtShare',
  {
    id: text('id').primaryKey(), // 16 random bytes, base64url; also the GCM associated data
    userId: text('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    sealedMeta: text('sealedMeta').notNull(), // base64 { person, ownerName }
    sealedPage: text('sealedPage').notNull(), // base64 SharedDebtPage
    createdAt: timestamp('createdAt')
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp('updatedAt')
      .notNull()
      .default(sql`now()`),
  },
  (t) => [index('debtShare_userId').on(t.userId)]
);

export type DebtShare = typeof debtShare.$inferSelect;
export type NewDebtShare = typeof debtShare.$inferInsert;
```

Add to `db/schema/index.ts` (alphabetical, after `cryptoPasskeyWrap`):

```ts
export {
  debtShare,
  type DebtShare,
  type NewDebtShare,
} from './debtShare';
```

Add `'debtShare',` to `tablesFilter` in `drizzle.config.ts`.

- [ ] **Step 2: Generate the migration**

Run: `pnpm db:generate`
Expected: a new `db/migrations/0015_*.sql` containing `CREATE TABLE "debtShare"`, the FK with `ON DELETE cascade`, and `CREATE INDEX "debtShare_userId"`. It must contain nothing else. Check with `cat`.

- [ ] **Step 3: Write the failing repository test**

`lib/debt-share/repository.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DebtShareRepository } from './repository';
import {
  setupTestDb,
  teardownTestDb,
  type TestDbContext,
} from '@/lib/test-utils/db';

describe('DebtShareRepository', () => {
  let context: TestDbContext;
  let repository: DebtShareRepository;

  beforeEach(async () => {
    context = await setupTestDb('debt-share-');
    await context.insertUser('alice');
    await context.insertUser('bob');
    repository = new DebtShareRepository(context.db);
  });

  afterEach(async () => {
    await teardownTestDb(context);
  });

  const row = (id: string, userId = 'alice') => ({
    id,
    userId,
    sealedMeta: 'meta',
    sealedPage: 'page',
  });

  it('creates, finds and lists by owner', async () => {
    await repository.create(row('s1'));
    await repository.create(row('s2', 'bob'));
    expect((await repository.findById('s1'))?.userId).toBe('alice');
    expect(await repository.findById('missing')).toBeNull();
    expect((await repository.listByUser('alice')).map((s) => s.id)).toEqual([
      's1',
    ]);
  });

  it('updates the page only for its owner', async () => {
    await repository.create(row('s1'));
    const later = new Date('2026-10-03T14:02:00Z');
    await repository.updatePage('bob', 's1', 'stolen', later);
    expect((await repository.findById('s1'))?.sealedPage).toBe('page');
    await repository.updatePage('alice', 's1', 'fresh', later);
    const share = await repository.findById('s1');
    expect(share?.sealedPage).toBe('fresh');
    expect(share?.updatedAt.toISOString()).toBe(later.toISOString());
  });

  it('deletes only the owner’s share and reports whether it existed', async () => {
    await repository.create(row('s1'));
    expect(await repository.delete('bob', 's1')).toBe(false);
    expect(await repository.delete('alice', 's1')).toBe(true);
    expect(await repository.findById('s1')).toBeNull();
  });

  it('deleteByUser removes every share of that user only', async () => {
    await repository.create(row('s1'));
    await repository.create(row('s2'));
    await repository.create(row('s3', 'bob'));
    await repository.deleteByUser('alice');
    expect(await repository.listByUser('alice')).toEqual([]);
    expect(await repository.listByUser('bob')).toHaveLength(1);
  });
});
```

- [ ] **Step 4: Run it to see it fail**

Run: `pnpm vitest run lib/debt-share/repository.test.ts`
Expected: FAIL, cannot resolve `./repository`.

- [ ] **Step 5: Implement**

`lib/debt-share/repository.ts`:

```ts
import { and, eq } from 'drizzle-orm';
import { debtShare, type DebtShare, type NewDebtShare } from '@/db/schema';
import type { DbInstance } from '@/lib/db/connection';

export class DebtShareRepository {
  constructor(private readonly db: DbInstance) {}

  async listByUser(userId: string): Promise<DebtShare[]> {
    return this.db
      .select()
      .from(debtShare)
      .where(eq(debtShare.userId, userId));
  }

  /** Public lookup for /s/[shareId] — no owner filter, the id is the secret's handle. */
  async findById(id: string): Promise<DebtShare | null> {
    const rows = await this.db
      .select()
      .from(debtShare)
      .where(eq(debtShare.id, id))
      .limit(1);
    return rows[0] ?? null;
  }

  async create(input: NewDebtShare): Promise<void> {
    await this.db.insert(debtShare).values(input);
  }

  async updatePage(
    userId: string,
    id: string,
    sealedPage: string,
    updatedAt: Date
  ): Promise<void> {
    await this.db
      .update(debtShare)
      .set({ sealedPage, updatedAt })
      .where(and(eq(debtShare.userId, userId), eq(debtShare.id, id)));
  }

  async delete(userId: string, id: string): Promise<boolean> {
    const removed = await this.db
      .delete(debtShare)
      .where(and(eq(debtShare.userId, userId), eq(debtShare.id, id)))
      .returning({ id: debtShare.id });
    return removed.length > 0;
  }

  async deleteByUser(userId: string): Promise<void> {
    await this.db.delete(debtShare).where(eq(debtShare.userId, userId));
  }
}
```

- [ ] **Step 6: Run the test, then commit**

Run: `pnpm vitest run lib/debt-share/repository.test.ts`. Expected: PASS.

```bash
git add db/schema/debtShare.ts db/schema/index.ts drizzle.config.ts db/migrations lib/debt-share/repository.ts lib/debt-share/repository.test.ts
git commit -m "feat(debts): debtShare table and repository"
```

---

### Task 2: Sealing, payload schema and browser-side open

**Files:**
- Create: `lib/debt-share/seal.ts`, `lib/debt-share/seal.test.ts`, `lib/debt-share/payload.ts`, `features/debtShare/lib/openSharedPage.ts`, `features/debtShare/lib/openSharedPage.test.ts`

**Interfaces:**
- Produces (`seal.ts`, server-only): `newShareId(): string`, `derivePageKey(dek: Buffer, shareId: string): Buffer`, `deriveMetaKey(dek: Buffer): Buffer`, `seal(key: Buffer, shareId: string, plaintext: string): string` (base64 of nonce‖ciphertext‖tag), `unseal(key: Buffer, shareId: string, sealed: string): string` (throws on any mismatch).
- Produces (`payload.ts`, no `server-only`): `sharedDebtPageSchema`, `type SharedDebtPage`, `type SharedDebtRow`, `type SharedDebtNet`, `shareMetaSchema`, `type ShareMeta`.
- Produces (`openSharedPage.ts`): `openSharedPage(shareId: string, sealed: string, keyText: string): Promise<SharedDebtPage | null>`.

- [ ] **Step 1: Write `payload.ts`** (types only, no test of its own)

```ts
import { z } from 'zod';

// The decrypted body of a shared debt page. Every amount string is exactly as
// ledger printed it, already from the viewer's side (signs flipped by ledger).
const sharedDebtRowSchema = z.object({
  date: z.string(), // YYYY-MM-DD
  payee: z.string(),
  amount: z.string(),
  balance: z.array(z.string()), // one line per commodity
});

const sharedDebtNetSchema = z.object({
  amount: z.string(), // absolute, e.g. "€ 100.00"
  // viewer-owes: the person viewing owes the owner; owner-owes: the reverse.
  direction: z.enum(['viewer-owes', 'owner-owes']),
});

export const sharedDebtPageSchema = z.object({
  version: z.literal(1),
  ownerName: z.string(),
  person: z.string(),
  net: z.array(sharedDebtNetSchema),
  rows: z.array(sharedDebtRowSchema),
  generatedAt: z.string(),
});

export const shareMetaSchema = z.object({
  person: z.string(),
  ownerName: z.string(),
});

export type SharedDebtPage = z.infer<typeof sharedDebtPageSchema>;
export type SharedDebtRow = z.infer<typeof sharedDebtRowSchema>;
export type SharedDebtNet = z.infer<typeof sharedDebtNetSchema>;
export type ShareMeta = z.infer<typeof shareMetaSchema>;
```

- [ ] **Step 2: Write the failing seal test**

`lib/debt-share/seal.test.ts`:

```ts
import { randomBytes } from 'crypto';
import { describe, expect, it } from 'vitest';
import {
  deriveMetaKey,
  derivePageKey,
  newShareId,
  seal,
  unseal,
} from './seal';

const dek = randomBytes(32);

describe('seal', () => {
  it('round-trips under the same key and share id', () => {
    const key = derivePageKey(dek, 'share-a');
    expect(unseal(key, 'share-a', seal(key, 'share-a', 'hello'))).toBe(
      'hello'
    );
  });

  it('fails when the blob is moved to another share id', () => {
    const key = derivePageKey(dek, 'share-a');
    const sealed = seal(key, 'share-a', 'hello');
    expect(() => unseal(key, 'share-b', sealed)).toThrow();
  });

  it('gives each share its own page key, and the meta key differs from both', () => {
    const a = derivePageKey(dek, 'share-a');
    const b = derivePageKey(dek, 'share-b');
    expect(a.equals(b)).toBe(false);
    expect(deriveMetaKey(dek).equals(a)).toBe(false);
    expect(derivePageKey(dek, 'share-a').equals(a)).toBe(true);
  });

  it('fails with a key from another DEK', () => {
    const sealed = seal(derivePageKey(dek, 's'), 's', 'hello');
    expect(() =>
      unseal(derivePageKey(randomBytes(32), 's'), 's', sealed)
    ).toThrow();
  });

  it('makes url-safe 16-byte share ids', () => {
    const id = newShareId();
    expect(id).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(newShareId()).not.toBe(id);
  });
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `pnpm vitest run lib/debt-share/seal.test.ts`. Expected: FAIL, cannot resolve `./seal`.

- [ ] **Step 4: Implement `seal.ts`**

```ts
import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from 'crypto';
import 'server-only';
import { DEK_BYTES } from '@/lib/crypto/constants';

// Layout of a sealed blob, base64: nonce (12) ‖ ciphertext ‖ GCM tag (16).
// WebCrypto's AES-GCM decrypt takes exactly ciphertext‖tag with the nonce as
// iv, so the browser opens it without reshuffling (features/debtShare/lib/
// openSharedPage.ts).
const NONCE_LENGTH = 12;
const TAG_LENGTH = 16;
const SHARE_ID_BYTES = 16;

const derive = (dek: Buffer, info: string): Buffer =>
  Buffer.from(
    hkdfSync('sha256', dek, Buffer.alloc(0), Buffer.from(info, 'utf8'), DEK_BYTES)
  );

export const newShareId = (): string =>
  randomBytes(SHARE_ID_BYTES).toString('base64url');

/** The key in the link's fragment. Never stored: it exists only while the DEK does. */
export const derivePageKey = (dek: Buffer, shareId: string): Buffer =>
  derive(dek, `debt-share-page-v1:${shareId}`);

/** Seals who a share is for, so the database cannot say who you lend to. */
export const deriveMetaKey = (dek: Buffer): Buffer =>
  derive(dek, 'debt-share-meta-v1');

export const seal = (key: Buffer, shareId: string, plaintext: string): string => {
  const nonce = randomBytes(NONCE_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  cipher.setAAD(Buffer.from(shareId, 'utf8'));
  const body = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return Buffer.concat([nonce, body, cipher.getAuthTag()]).toString('base64');
};

export const unseal = (key: Buffer, shareId: string, sealed: string): string => {
  const raw = Buffer.from(sealed, 'base64');
  if (raw.length < NONCE_LENGTH + TAG_LENGTH) throw new Error('sealed blob too short');
  const decipher = createDecipheriv(
    'aes-256-gcm',
    key,
    raw.subarray(0, NONCE_LENGTH)
  );
  decipher.setAAD(Buffer.from(shareId, 'utf8'));
  decipher.setAuthTag(raw.subarray(raw.length - TAG_LENGTH));
  return Buffer.concat([
    decipher.update(raw.subarray(NONCE_LENGTH, raw.length - TAG_LENGTH)),
    decipher.final(),
  ]).toString('utf8');
};
```

Run: `pnpm vitest run lib/debt-share/seal.test.ts`. Expected: PASS.

- [ ] **Step 5: Write the failing browser-open test**

It checks that what Node seals, WebCrypto opens. Vitest runs in `node`, which has `globalThis.crypto.subtle`.

`features/debtShare/lib/openSharedPage.test.ts`:

```ts
import { randomBytes } from 'crypto';
import { describe, expect, it } from 'vitest';
import { openSharedPage } from './openSharedPage';
import type { SharedDebtPage } from '@/lib/debt-share/payload';
import { derivePageKey, seal } from '@/lib/debt-share/seal';

const page: SharedDebtPage = {
  version: 1,
  ownerName: 'Naeem',
  person: 'Bashir',
  net: [{ amount: '€ 100.00', direction: 'viewer-owes' }],
  rows: [
    { date: '2026-03-01', payee: 'He paid back', amount: '€ 100.00', balance: ['€ -100.00'] },
  ],
  generatedAt: '2026-10-03T14:02:00.000Z',
};

const dek = randomBytes(32);
const key = derivePageKey(dek, 'share-a');
const keyText = key.toString('base64url');

describe('openSharedPage', () => {
  it('opens what the server sealed', async () => {
    const sealed = seal(key, 'share-a', JSON.stringify(page));
    expect(await openSharedPage('share-a', sealed, keyText)).toEqual(page);
  });

  it('returns null for a wrong key, a wrong share id, or a bad key string', async () => {
    const sealed = seal(key, 'share-a', JSON.stringify(page));
    const otherKey = derivePageKey(dek, 'share-b').toString('base64url');
    expect(await openSharedPage('share-a', sealed, otherKey)).toBeNull();
    expect(await openSharedPage('share-b', sealed, keyText)).toBeNull();
    expect(await openSharedPage('share-a', sealed, 'not-a-key')).toBeNull();
    expect(await openSharedPage('share-a', sealed, '')).toBeNull();
  });

  it('returns null when the decrypted body is not a page', async () => {
    const sealed = seal(key, 'share-a', JSON.stringify({ version: 2 }));
    expect(await openSharedPage('share-a', sealed, keyText)).toBeNull();
  });
});
```

Run: `pnpm vitest run features/debtShare/lib/openSharedPage.test.ts`. Expected: FAIL, cannot resolve `./openSharedPage`.

- [ ] **Step 6: Implement `openSharedPage.ts`**

```ts
import {
  sharedDebtPageSchema,
  type SharedDebtPage,
} from '@/lib/debt-share/payload';

const NONCE_LENGTH = 12;
const KEY_LENGTH = 32;

const base64ToBytes = (text: string): Uint8Array =>
  Uint8Array.from(atob(text), (character) => character.charCodeAt(0));

const base64UrlToBytes = (text: string): Uint8Array => {
  const standard = text.replace(/-/g, '+').replace(/_/g, '/');
  return base64ToBytes(standard.padEnd(Math.ceil(standard.length / 4) * 4, '='));
};

/**
 * Decrypt a shared debt page in the visitor's browser with the key from the
 * link's fragment. Any failure — wrong key, revoked link, tampered blob, a
 * body that isn't a page — is null, so the caller shows one "no longer active"
 * screen and never half a page.
 */
export const openSharedPage = async (
  shareId: string,
  sealed: string,
  keyText: string
): Promise<SharedDebtPage | null> => {
  try {
    const keyBytes = base64UrlToBytes(keyText);
    if (keyBytes.length !== KEY_LENGTH) return null;
    const raw = base64ToBytes(sealed);
    const key = await crypto.subtle.importKey(
      'raw',
      keyBytes,
      'AES-GCM',
      false,
      ['decrypt']
    );
    const plaintext = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: raw.slice(0, NONCE_LENGTH),
        additionalData: new TextEncoder().encode(shareId),
      },
      key,
      raw.slice(NONCE_LENGTH)
    );
    const parsed = sharedDebtPageSchema.safeParse(
      JSON.parse(new TextDecoder().decode(plaintext))
    );
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
};
```

- [ ] **Step 7: Run both tests, then commit**

Run: `pnpm vitest run lib/debt-share/seal.test.ts features/debtShare/lib/openSharedPage.test.ts`. Expected: PASS.

```bash
git add lib/debt-share/seal.ts lib/debt-share/seal.test.ts lib/debt-share/payload.ts features/debtShare/lib
git commit -m "feat(debts): seal shared debt pages and open them in the browser"
```

---

### Task 3: Ledger queries for the viewer's side

These output shapes were checked against ledger 3.4.1 while writing this plan:
- `--amount '-amount'` flips every sign. Commodities stay apart.
- **The running total accumulates in output order.** With `--sort -date`, the total builds from the newest row and comes out wrong. So query oldest first and reverse in JS. Reversing the order is not math.
- A running total holding two commodities prints over several lines. So rows are framed with `\x1e`, and fields are split with `\x1f`.
- `quantity()` errors on a two-commodity total. The net therefore uses `--group-by commodity --collapse`. Ledger prints a bare header line for each commodity, then one row per transaction. The last row in each group is that commodity's net.

**Files:**
- Create: `lib/debt-share/ledger.ts`, `lib/debt-share/ledger.test.ts`

**Interfaces:**
- Consumes: `personAccountPatterns`, `RECEIVABLE_ROOT`, `PAYABLE_ROOT` from `@/features/debts/parse`.
- Produces: `sharedRowsArgs(person: string): string[]`, `parseSharedRows(stdout: string): SharedDebtRow[]` (newest first), `sharedNetArgs(person: string): string[]`, `parseSharedNet(stdout: string): SharedDebtNet[]`.

- [ ] **Step 1: Write the failing test**

`lib/debt-share/ledger.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  parseSharedNet,
  parseSharedRows,
  sharedNetArgs,
  sharedRowsArgs,
} from './ledger';
import { withLedgerJournal } from '@/lib/test-utils/ledger';

const JOURNAL = `
2026-01-01 Lent cash
    Assets:Receivable:Bashir      200.00 EUR
    Assets:Bank:Savings
2026-02-01 Paid his dinner
    Assets:Receivable:Bashir:Food   $50.00
    Assets:Cash
2026-03-01 He paid back
    Assets:Bank:Checking   100.00 EUR
    Assets:Receivable:Bashir
2026-03-05 Borrowed
    Assets:Cash   $20.00
    Liabilities:Payable:Bashir
2026-03-06 Lent to his brother
    Assets:Receivable:Bashirx   999.00 EUR
    Assets:Cash
`;

describe('shared debt ledger queries', () => {
  it('lists the viewer’s side newest first, signs flipped, currencies apart', async () => {
    const rows = await withLedgerJournal(JOURNAL, async (run) =>
      parseSharedRows(await run(sharedRowsArgs('Bashir')))
    );
    expect(rows).toEqual([
      { date: '2026-03-05', payee: 'Borrowed', amount: '$20.00', balance: ['$-30.00', '-100.00 EUR'] },
      { date: '2026-03-01', payee: 'He paid back', amount: '100.00 EUR', balance: ['$-50.00', '-100.00 EUR'] },
      { date: '2026-02-01', payee: 'Paid his dinner', amount: '$-50.00', balance: ['$-50.00', '-200.00 EUR'] },
      { date: '2026-01-01', payee: 'Lent cash', amount: '-200.00 EUR', balance: ['-200.00 EUR'] },
    ]);
  });

  it('never leaks the owner’s other accounts or a prefix-named person', async () => {
    const stdout = await withLedgerJournal(JOURNAL, (run) =>
      run(sharedRowsArgs('Bashir'))
    );
    expect(stdout).not.toMatch(/Savings|Checking|Cash|999/);
  });

  it('nets each commodity with its own direction', async () => {
    const opposite = `${JOURNAL}
2026-04-01 Borrowed more
    Assets:Cash   $100.00
    Liabilities:Payable:Bashir
`;
    const net = await withLedgerJournal(opposite, async (run) =>
      parseSharedNet(await run(sharedNetArgs('Bashir')))
    );
    // € : Bashir still owes 100. $ : -50 + 20 + 100 → you owe him 70.
    expect(net).toEqual([
      { amount: '$70.00', direction: 'owner-owes' },
      { amount: '100.00 EUR', direction: 'viewer-owes' },
    ]);
  });

  it('drops a settled commodity and returns nothing when all is settled', async () => {
    const settled = `
2026-01-01 Lent
    Assets:Receivable:Bashir   $10.00
    Assets:Cash
2026-01-02 Repaid
    Assets:Cash   $10.00
    Assets:Receivable:Bashir
`;
    const net = await withLedgerJournal(settled, async (run) =>
      parseSharedNet(await run(sharedNetArgs('Bashir')))
    );
    expect(net).toEqual([]);
  });
});
```

The exact rendered strings above (`$-30.00` vs `$ -30.00`, the order of commodities within a total) are whatever ledger prints for this journal. On the first run, compare the failure diff against ledger's real output. Fix the **expected values** if they differ only in rendering. Never change the parser to reshape amounts.

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm vitest run lib/debt-share/ledger.test.ts`. Expected: FAIL, cannot resolve `./ledger`.

- [ ] **Step 3: Implement**

`lib/debt-share/ledger.ts`:

```ts
import type { SharedDebtNet, SharedDebtRow } from './payload';
import {
  PAYABLE_ROOT,
  RECEIVABLE_ROOT,
  personAccountPatterns,
} from '@/features/debts/parse';

// Framing that can't occur in ledger's rendered amounts or (realistically) a
// payee: a record separator before each row and a unit separator between
// fields. A multi-commodity running total spans several lines, so rows can't
// be split on newlines.
const RECORD = '\x1e';
const FIELD = '\x1f';

const personPatterns = (person: string): string[] => [
  ...personAccountPatterns(RECEIVABLE_ROOT, person),
  ...personAccountPatterns(PAYABLE_ROOT, person),
];

// `--amount -amount` makes ledger negate every posting, so the figures read
// from the viewer's side. No `-X`: each amount stays in its own commodity.
const VIEWER_SIDE = ['--amount', '-amount'];

/**
 * One person's postings, oldest first — ledger accumulates the running total in
 * output order, so `--sort -date` would total from the newest row. The caller
 * reverses the parsed rows for display. `--` stops option parsing so a person
 * name can't smuggle a flag.
 */
export const sharedRowsArgs = (person: string): string[] => [
  'register',
  ...VIEWER_SIDE,
  '--format',
  `${RECORD}%(format_date(date, "%Y-%m-%d"))${FIELD}%(scrub(display_amount))${FIELD}%(scrub(display_total))${FIELD}%P\n`,
  '--',
  ...personPatterns(person),
];

const lines = (text: string): string[] =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

export const parseSharedRows = (stdout: string): SharedDebtRow[] =>
  stdout
    .split(RECORD)
    .filter((record) => record.includes(FIELD))
    .map((record) => {
      const [date, amount, total, payee] = record.split(FIELD);
      return {
        date: date.trim(),
        payee: payee.trim(),
        amount: amount.trim(),
        balance: lines(total),
      };
    })
    .reverse();

/**
 * Net per commodity. `quantity()` can't read a multi-commodity total, so ledger
 * groups by commodity: a bare header line per group, then one collapsed row per
 * transaction whose running total is that commodity's net so far.
 */
export const sharedNetArgs = (person: string): string[] => [
  'register',
  ...VIEWER_SIDE,
  '--group-by',
  'commodity',
  '--collapse',
  '--format',
  `${RECORD}%(quantity(scrub(display_total)))${FIELD}%(commodity(scrub(display_total)))${FIELD}%(scrub(abs(display_total)))\n`,
  '--',
  ...personPatterns(person),
];

/**
 * Keep the last row per commodity (its final net) and read only the sign of
 * ledger's quantity: negative means the viewer owes the owner. A zero net is a
 * settled commodity and is dropped.
 */
export const parseSharedNet = (stdout: string): SharedDebtNet[] => {
  const lastByCommodity = new Map<string, { quantity: number; amount: string }>();
  for (const record of stdout.split(RECORD)) {
    // A group header follows the previous row on its own line; keep line one.
    const [quantityText, commodity, amount] = (record.split('\n')[0] ?? '').split(FIELD);
    if (amount === undefined) continue;
    lastByCommodity.set(commodity.trim(), {
      quantity: Number(quantityText),
      amount: amount.trim(),
    });
  }
  return [...lastByCommodity.values()]
    .filter(({ quantity }) => Number.isFinite(quantity) && quantity !== 0)
    .map(({ quantity, amount }) => ({
      amount,
      direction: quantity < 0 ? 'viewer-owes' : 'owner-owes',
    }));
};
```

- [ ] **Step 4: Run the test**

Run: `pnpm vitest run lib/debt-share/ledger.test.ts`. Expected: PASS once any rendering-only differences in the expected strings are corrected. If a test fails for a structural reason, stop and report it. Examples: a row missing, a total from the wrong direction, "Savings" present, or a header parsed as a row.

- [ ] **Step 5: Commit**

```bash
git add lib/debt-share/ledger.ts lib/debt-share/ledger.test.ts
git commit -m "feat(debts): ledger queries for a person's side of their debts"
```

---

### Task 4: `DebtShareService`

**Files:**
- Create: `lib/debt-share/service.ts`, `lib/debt-share/service.test.ts`, `lib/debt-share/index.ts`

**Interfaces:**
- Consumes: Task 1 repository, Task 2 `seal`/`unseal`/`derive*`/`newShareId`/schemas, Task 3 args and parsers, `LockedError` from `@/lib/crypto/sessionKeys`.
- Produces:
  ```ts
  type ShareLink = { shareId: string; key: string; updatedAt: Date };
  type DebtShareDependencies = {
    repository: DebtShareRepository;
    runLedger: (userId: string, args: string[]) => Promise<string>;
    getDek: (userId: string) => Buffer | undefined;
    now?: () => Date;
  };
  class DebtShareService {
    create(userId: string, person: string, ownerName: string): Promise<ShareLink>; // returns the existing link if the person is already shared
    revoke(userId: string, shareId: string): Promise<boolean>;
    linkFor(userId: string, person: string): Promise<ShareLink | null>;
    sharedPeople(userId: string): Promise<Set<string>>; // empty when locked
    refresh(userId: string): Promise<void>; // no-op when locked; per-share failures logged, never thrown
  }
  ```
  `index.ts` exports `debtShareRepository` and `debtShareService` singletons.

`create` and `refresh` read the local journal through `runLedger`. Callers must hold the user lock with the journal pulled. `push` already does. The create action does it in Task 7.

- [ ] **Step 1: Write the failing test**

`lib/debt-share/service.test.ts`. It uses the real test database and a fake `runLedger` that returns canned ledger output, so the test checks wiring, not ledger:

```ts
import { randomBytes } from 'crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sharedDebtPageSchema } from './payload';
import { DebtShareRepository } from './repository';
import { derivePageKey, unseal } from './seal';
import { DebtShareService } from './service';
import { LockedError } from '@/lib/crypto/sessionKeys';
import {
  setupTestDb,
  teardownTestDb,
  type TestDbContext,
} from '@/lib/test-utils/db';

const ROWS = '\x1e2026-01-01\x1f-200.00 EUR\x1f-200.00 EUR\x1fLent cash\n';
const NET = 'EUR\n\x1e-200\x1fEUR\x1f200.00 EUR\n';

describe('DebtShareService', () => {
  let context: TestDbContext;
  let repository: DebtShareRepository;
  let dek: Buffer | undefined;
  let runLedger: ReturnType<typeof vi.fn>;
  let service: DebtShareService;
  const now = new Date('2026-10-03T14:02:00Z');

  beforeEach(async () => {
    context = await setupTestDb('debt-share-service-');
    await context.insertUser('alice');
    repository = new DebtShareRepository(context.db);
    dek = randomBytes(32);
    runLedger = vi.fn(async (_userId: string, args: string[]) =>
      args.includes('--group-by') ? NET : ROWS
    );
    service = new DebtShareService({
      repository,
      runLedger,
      getDek: () => dek,
      now: () => now,
    });
  });

  afterEach(async () => {
    await teardownTestDb(context);
  });

  const openPage = async (shareId: string, key: string) => {
    const share = await repository.findById(shareId);
    return sharedDebtPageSchema.parse(
      JSON.parse(unseal(Buffer.from(key, 'base64url'), shareId, share!.sealedPage))
    );
  };

  it('create seals a page the link key opens, and hides the person from the row', async () => {
    const link = await service.create('alice', 'Bashir', 'Naeem');
    expect(link.key).toBe(derivePageKey(dek!, link.shareId).toString('base64url'));
    const page = await openPage(link.shareId, link.key);
    expect(page).toMatchObject({
      ownerName: 'Naeem',
      person: 'Bashir',
      net: [{ amount: '200.00 EUR', direction: 'viewer-owes' }],
      rows: [{ date: '2026-01-01', payee: 'Lent cash' }],
      generatedAt: now.toISOString(),
    });
    const stored = await repository.findById(link.shareId);
    expect(JSON.stringify(stored)).not.toContain('Bashir');
  });

  it('create returns the existing link for an already-shared person', async () => {
    const first = await service.create('alice', 'Bashir', 'Naeem');
    const second = await service.create('alice', 'Bashir', 'Someone');
    expect(second.shareId).toBe(first.shareId);
    expect(await repository.listByUser('alice')).toHaveLength(1);
  });

  it('linkFor and sharedPeople find the share; revoke removes it for good', async () => {
    const link = await service.create('alice', 'Bashir', 'Naeem');
    expect((await service.linkFor('alice', 'Bashir'))?.shareId).toBe(link.shareId);
    expect(await service.linkFor('alice', 'Bob')).toBeNull();
    expect([...(await service.sharedPeople('alice'))]).toEqual(['Bashir']);
    expect(await service.revoke('alice', link.shareId)).toBe(true);
    expect(await service.linkFor('alice', 'Bashir')).toBeNull();
    expect(await repository.findById(link.shareId)).toBeNull();
  });

  it('refresh rebuilds each page with the latest ledger output', async () => {
    const link = await service.create('alice', 'Bashir', 'Naeem');
    runLedger.mockImplementation(async (_userId: string, args: string[]) =>
      args.includes('--group-by')
        ? 'EUR\n\x1e-50\x1fEUR\x1f50.00 EUR\n'
        : ROWS
    );
    await service.refresh('alice');
    expect((await openPage(link.shareId, link.key)).net).toEqual([
      { amount: '50.00 EUR', direction: 'viewer-owes' },
    ]);
  });

  it('refresh keeps the previous page when ledger fails, and does not throw', async () => {
    const link = await service.create('alice', 'Bashir', 'Naeem');
    const before = (await repository.findById(link.shareId))!.sealedPage;
    runLedger.mockRejectedValue(new Error('ledger broke'));
    await expect(service.refresh('alice')).resolves.toBeUndefined();
    expect((await repository.findById(link.shareId))!.sealedPage).toBe(before);
  });

  it('is inert while locked: refresh and sharedPeople do nothing, create throws', async () => {
    await service.create('alice', 'Bashir', 'Naeem');
    runLedger.mockClear();
    dek = undefined;
    await service.refresh('alice');
    expect(runLedger).not.toHaveBeenCalled();
    expect((await service.sharedPeople('alice')).size).toBe(0);
    await expect(service.create('alice', 'Bob', 'Naeem')).rejects.toBeInstanceOf(LockedError);
  });
});
```

Run: `pnpm vitest run lib/debt-share/service.test.ts`. Expected: FAIL, cannot resolve `./service`.

- [ ] **Step 2: Implement `service.ts`**

```ts
import 'server-only';
import {
  parseSharedNet,
  parseSharedRows,
  sharedNetArgs,
  sharedRowsArgs,
} from './ledger';
import {
  shareMetaSchema,
  type ShareMeta,
  type SharedDebtPage,
} from './payload';
import type { DebtShareRepository } from './repository';
import {
  deriveMetaKey,
  derivePageKey,
  newShareId,
  seal,
  unseal,
} from './seal';
import type { DebtShare } from '@/db/schema';
import { LockedError } from '@/lib/crypto/sessionKeys';
import { createLogger } from '@/lib/log';

const log = createLogger('debt-share');

export type ShareLink = { shareId: string; key: string; updatedAt: Date };

export type DebtShareDependencies = {
  repository: DebtShareRepository;
  runLedger: (userId: string, args: string[]) => Promise<string>;
  getDek: (userId: string) => Buffer | undefined;
  now?: () => Date;
};

type OpenedShare = { share: DebtShare; meta: ShareMeta };

/**
 * Shared debt pages: one sealed, link-readable snapshot per person, rebuilt
 * from ledger while the owner is unlocked. Callers that build a page (create,
 * refresh) must hold the user lock with the journal pulled — runLedger reads
 * the local copy.
 */
export class DebtShareService {
  private readonly now: () => Date;

  constructor(private readonly dependencies: DebtShareDependencies) {
    this.now = dependencies.now ?? (() => new Date());
  }

  private linkOf(dek: Buffer, share: DebtShare): ShareLink {
    return {
      shareId: share.id,
      key: derivePageKey(dek, share.id).toString('base64url'),
      updatedAt: share.updatedAt,
    };
  }

  private async openAll(userId: string, dek: Buffer): Promise<OpenedShare[]> {
    const metaKey = deriveMetaKey(dek);
    const shares = await this.dependencies.repository.listByUser(userId);
    return shares.flatMap((share) => {
      try {
        const meta = shareMetaSchema.parse(
          JSON.parse(unseal(metaKey, share.id, share.sealedMeta))
        );
        return [{ share, meta }];
      } catch (err) {
        log.warn({ err, shareId: share.id }, 'unreadable debt share meta');
        return [];
      }
    });
  }

  private async buildSealedPage(
    userId: string,
    dek: Buffer,
    shareId: string,
    meta: ShareMeta
  ): Promise<string> {
    const [rowsOutput, netOutput] = await Promise.all([
      this.dependencies.runLedger(userId, sharedRowsArgs(meta.person)),
      this.dependencies.runLedger(userId, sharedNetArgs(meta.person)),
    ]);
    const page: SharedDebtPage = {
      version: 1,
      ownerName: meta.ownerName,
      person: meta.person,
      net: parseSharedNet(netOutput),
      rows: parseSharedRows(rowsOutput),
      generatedAt: this.now().toISOString(),
    };
    return seal(derivePageKey(dek, shareId), shareId, JSON.stringify(page));
  }

  async create(
    userId: string,
    person: string,
    ownerName: string
  ): Promise<ShareLink> {
    const dek = this.dependencies.getDek(userId);
    if (!dek) throw new LockedError();
    const existing = (await this.openAll(userId, dek)).find(
      ({ meta }) => meta.person === person
    );
    if (existing) return this.linkOf(dek, existing.share);

    const shareId = newShareId();
    const meta: ShareMeta = { person, ownerName };
    const updatedAt = this.now();
    const share: DebtShare = {
      id: shareId,
      userId,
      sealedMeta: seal(deriveMetaKey(dek), shareId, JSON.stringify(meta)),
      sealedPage: await this.buildSealedPage(userId, dek, shareId, meta),
      createdAt: updatedAt,
      updatedAt,
    };
    await this.dependencies.repository.create(share);
    return this.linkOf(dek, share);
  }

  revoke(userId: string, shareId: string): Promise<boolean> {
    return this.dependencies.repository.delete(userId, shareId);
  }

  async linkFor(userId: string, person: string): Promise<ShareLink | null> {
    const dek = this.dependencies.getDek(userId);
    if (!dek) return null;
    const opened = (await this.openAll(userId, dek)).find(
      ({ meta }) => meta.person === person
    );
    return opened ? this.linkOf(dek, opened.share) : null;
  }

  async sharedPeople(userId: string): Promise<Set<string>> {
    const dek = this.dependencies.getDek(userId);
    if (!dek) return new Set();
    return new Set(
      (await this.openAll(userId, dek)).map(({ meta }) => meta.person)
    );
  }

  /** Rebuild every share. A failing share keeps its previous page. */
  async refresh(userId: string): Promise<void> {
    const dek = this.dependencies.getDek(userId);
    if (!dek) return;
    for (const { share, meta } of await this.openAll(userId, dek)) {
      try {
        const sealedPage = await this.buildSealedPage(userId, dek, share.id, meta);
        await this.dependencies.repository.updatePage(
          userId,
          share.id,
          sealedPage,
          this.now()
        );
      } catch (err) {
        log.error({ err, shareId: share.id }, 'debt share rebuild failed');
      }
    }
  }
}
```

If `createLogger`'s logger has no `warn`, use `error` in `openAll`. Check `lib/log/index.ts`.

- [ ] **Step 3: Write `index.ts`**

```ts
import 'server-only';
import { DebtShareRepository } from './repository';
import { DebtShareService } from './service';
import { getSessionDek } from '@/lib/crypto/sessionKeys';
import { db } from '@/lib/db';
import { runLedgerForUser } from '@/utils/runLedgerForUser';

export const debtShareRepository = new DebtShareRepository(db);

// runLedgerForUser, not runLedger: refresh runs inside push(), which already
// holds the per-user lock, and runLedger would pull under that lock again.
export const debtShareService = new DebtShareService({
  repository: debtShareRepository,
  runLedger: (userId, args) => runLedgerForUser(userId, args),
  getDek: getSessionDek,
});

export type { ShareLink } from './service';
```

- [ ] **Step 4: Run the test, type-check, commit**

Run: `pnpm vitest run lib/debt-share/service.test.ts && pnpm type-check`. Expected: PASS, no type errors.

```bash
git add lib/debt-share/service.ts lib/debt-share/service.test.ts lib/debt-share/index.ts
git commit -m "feat(debts): service that creates, rebuilds and revokes debt shares"
```

---

### Task 5: Rebuild after every save; clean up on encryption reset

**Files:**
- Create: `lib/debt-share/refresh.ts`, `lib/debt-share/refresh.test.ts`
- Modify: `lib/storage/sync.ts` (`push`), `lib/storage/sync.test.ts`, `lib/crypto/resetEncryption.ts`, `lib/crypto/resetEncryption.test.ts`

**Interfaces:**
- Consumes: `debtShareService` and `debtShareRepository` (Task 4), `hasSessionDek`.
- Produces: `refreshDebtShares(userId: string): Promise<void>`. It never throws. It returns at once without a DEK.

- [ ] **Step 1: Write the failing hook test**

`lib/debt-share/refresh.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const refresh = vi.fn();
vi.mock('./index', () => ({ debtShareService: { refresh } }));
const hasSessionDek = vi.fn();
vi.mock('@/lib/crypto/sessionKeys', () => ({ hasSessionDek }));

const { refreshDebtShares } = await import('./refresh');

describe('refreshDebtShares', () => {
  beforeEach(() => {
    refresh.mockReset();
    hasSessionDek.mockReset();
  });

  it('skips everything while locked', async () => {
    hasSessionDek.mockReturnValue(false);
    await refreshDebtShares('alice');
    expect(refresh).not.toHaveBeenCalled();
  });

  it('rebuilds while unlocked', async () => {
    hasSessionDek.mockReturnValue(true);
    await refreshDebtShares('alice');
    expect(refresh).toHaveBeenCalledWith('alice');
  });

  it('swallows a failure so the save still succeeds', async () => {
    hasSessionDek.mockReturnValue(true);
    refresh.mockRejectedValue(new Error('database down'));
    await expect(refreshDebtShares('alice')).resolves.toBeUndefined();
  });
});
```

Run: `pnpm vitest run lib/debt-share/refresh.test.ts`. Expected: FAIL, cannot resolve `./refresh`.

- [ ] **Step 2: Implement `refresh.ts`**

```ts
import { hasSessionDek } from '@/lib/crypto/sessionKeys';
import { createLogger } from '@/lib/log';

const log = createLogger('debt-share');

/**
 * Rebuild the owner's shared debt pages after a save. Never throws: a broken
 * rebuild must not fail the save that triggered it. Locked (no DEK, e.g. a
 * background job) means nothing to rebuild with, so it returns before touching
 * the database. The service is imported lazily because it reaches back through
 * the journal module, which imports push() — this file's only caller.
 */
export const refreshDebtShares = async (userId: string): Promise<void> => {
  if (!hasSessionDek(userId)) return;
  try {
    const { debtShareService } = await import('./index');
    await debtShareService.refresh(userId);
  } catch (err) {
    log.error({ err }, 'debt share refresh failed');
  }
};
```

Run: `pnpm vitest run lib/debt-share/refresh.test.ts`. Expected: PASS.

- [ ] **Step 3: Write the failing `push` test**

Append to `lib/storage/sync.test.ts`. Add `vi` to the vitest import, and put the mock at the top of the file, after the imports:

```ts
const refreshDebtShares = vi.fn(async () => undefined);
vi.mock('@/lib/debt-share/refresh', () => ({ refreshDebtShares }));
```

and the test inside the `describe`:

```ts
  it('rebuilds shared debt pages after a successful push', async () => {
    refreshDebtShares.mockClear();
    await pull(USER);
    await fs.writeFile(path.join(getJournalDir(USER), 'main.ledger'), 'd');
    await push(USER);
    expect(refreshDebtShares).toHaveBeenCalledWith(USER);
  });
```

Run: `pnpm vitest run lib/storage/sync.test.ts`. Expected: the new test FAILS (not called).

- [ ] **Step 4: Call the hook from `push`**

In `lib/storage/sync.ts`, add `import { refreshDebtShares } from '@/lib/debt-share/refresh';` and replace `push`:

```ts
/**
 * Mirror the user's local cache up to the canonical store, then rebuild any
 * shared debt pages from the journal just saved. A failed upload throws before
 * the rebuild, so a share never shows a save that didn't land.
 */
export const push = async (userId: string): Promise<void> => {
  await pushFromLocal(getObjectStore(), userId);
  await refreshDebtShares(userId);
};
```

Run: `pnpm vitest run lib/storage`. Expected: PASS.

- [ ] **Step 5: Reset deletes shares (failing test first)**

Open `lib/crypto/resetEncryption.test.ts` and follow its existing setup (test db + injected `clearRemote`/`removeLocalJournal`). Add:

```ts
  it('deletes the user’s debt shares, whose keys came from the old DEK', async () => {
    const shares = new DebtShareRepository(context.db);
    await shares.create({ id: 's1', userId: USER_ID, sealedMeta: 'm', sealedPage: 'p' });
    await resetUserEncryption(USER_ID, context.db, dependencies);
    expect(await shares.listByUser(USER_ID)).toEqual([]);
  });
```

Rename `context`, `USER_ID` and `dependencies` to whatever the file already calls its test-db context, user id and deps object. Import `DebtShareRepository` from `@/lib/debt-share/repository`.

Run: `pnpm vitest run lib/crypto/resetEncryption.test.ts`. Expected: the new test FAILS.

In `lib/crypto/resetEncryption.ts`, add `import { DebtShareRepository } from '@/lib/debt-share/repository';`. Then, right after the `UserCryptoRepository(db).delete(userId)` line, add:

```ts
  await new DebtShareRepository(db).deleteByUser(userId); // keys derived from the old DEK; unrebuildable
```

Run: `pnpm vitest run lib/crypto/resetEncryption.test.ts`. Expected: PASS.

- [ ] **Step 6: Full suite, commit**

Run: `pnpm test`. Expected: all green. Many journal tests call the real `push`. They have no DEK, so the hook returns at once. If one fails on importing `@/lib/debt-share`, that test holds a DEK. Mock `@/lib/debt-share/refresh` in it the way Step 3 does.

```bash
git add lib/debt-share/refresh.ts lib/debt-share/refresh.test.ts lib/storage/sync.ts lib/storage/sync.test.ts lib/crypto/resetEncryption.ts lib/crypto/resetEncryption.test.ts
git commit -m "feat(debts): rebuild shared debt pages after every save"
```

---

### Task 6: The public page `/s/[shareId]`

**Files:**
- Modify: `components/AppShell/publicPaths.ts`, `components/AppShell/publicPaths.test.ts`, `proxy.ts`
- Create: `features/debtShare/SharedDebtView.tsx`, `features/debtShare/index.ts`, `app/s/[shareId]/page.tsx`

**Interfaces:**
- Consumes: `openSharedPage` (Task 2), `debtShareRepository` (Task 4).
- Produces: `isSharedPagePath(pathname): boolean`; `isPublicPath` true for `/s/<anything>`; `SharedDebtView({ shareId, sealedPage }: { shareId: string; sealedPage: string | null })`.

- [ ] **Step 1: Failing public-path test**

Append to `components/AppShell/publicPaths.test.ts` (and import `isSharedPagePath`):

```ts
describe('isSharedPagePath', () => {
  it('treats /s/<id> as a public shared page', () => {
    expect(isSharedPagePath('/s/abc')).toBe(true);
    expect(isPublicPath('/s/abc')).toBe(true);
  });

  it('does not open up look-alike paths', () => {
    expect(isSharedPagePath('/s')).toBe(false);
    expect(isSharedPagePath('/settings')).toBe(false);
    expect(isPublicPath('/settings')).toBe(false);
  });
});
```

Run: `pnpm vitest run components/AppShell/publicPaths.test.ts`. Expected: FAIL.

- [ ] **Step 2: Implement**

In `components/AppShell/publicPaths.ts`, replace `isPublicPath` with:

```ts
// A shared debt page (/s/<shareId>) is readable by anyone holding the link; the
// key lives in the URL fragment and the page decrypts itself in the browser.
export const isSharedPagePath = (pathname: string): boolean =>
  pathname.startsWith('/s/');

export const isPublicPath = (pathname: string): boolean =>
  PUBLIC_PATHS.has(pathname) || isSharedPagePath(pathname);
```

Update the file's top comment to "Three kinds of route today", and mention `/s/`.

In `proxy.ts`, import `isSharedPagePath`. Then in the `isPublicPath` branch, replace the final `return withSecurityHeaders(req);` with:

```ts
    const response = withSecurityHeaders(req);
    if (isSharedPagePath(req.nextUrl.pathname)) {
      // A shared page's whole secret is its URL fragment, and its content is
      // someone's debts: send no referrer, keep it out of search engines and
      // out of any cache.
      response.headers.set('Referrer-Policy', 'no-referrer');
      response.headers.set('X-Robots-Tag', 'noindex, nofollow');
      response.headers.set('Cache-Control', 'no-store');
    }
    return response;
```

Run: `pnpm vitest run components/AppShell`. Expected: PASS.

- [ ] **Step 3: The view**

`features/debtShare/SharedDebtView.tsx`:

```tsx
'use client';

import { openSharedPage } from './lib/openSharedPage';
import { TableScroll } from '@/components/ui/table';
import type { SharedDebtPage } from '@/lib/debt-share/payload';
import { useEffect, useState } from 'react';

type Props = { shareId: string; sealedPage: string | null };

type ViewState =
  | { status: 'opening' }
  | { status: 'closed' }
  | { status: 'open'; page: SharedDebtPage };

const formatUpdated = (iso: string): string =>
  new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

/**
 * The page a person sees through a shared debt link. The key never leaves the
 * browser: it is read from the fragment and used to decrypt the sealed page
 * the server embedded. Anything that fails to open shows one neutral screen,
 * so a revoked link and a wrong key look the same.
 */
const SharedDebtView = ({ shareId, sealedPage }: Props) => {
  const [state, setState] = useState<ViewState>({ status: 'opening' });

  useEffect(() => {
    const key = window.location.hash.slice(1);
    if (!sealedPage || !key) {
      setState({ status: 'closed' });
      return;
    }
    openSharedPage(shareId, sealedPage, key).then((page) =>
      setState(page ? { status: 'open', page } : { status: 'closed' })
    );
  }, [shareId, sealedPage]);

  if (state.status === 'opening') {
    return <main className="mx-auto max-w-2xl px-4 py-16" aria-busy="true" />;
  }
  if (state.status === 'closed') {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="text-xl font-semibold">This link is no longer active</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Ask the person who sent it for a new one.
        </p>
      </main>
    );
  }

  const { page } = state;
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-10">
      <header>
        <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Between you and {page.ownerName}
        </div>
        {page.net.length === 0 ? (
          <h1 className="mt-1 text-2xl font-semibold">All settled</h1>
        ) : (
          page.net.map((net) => (
            <h1
              key={net.amount}
              className={`mt-1 text-2xl font-semibold tracking-tight ${
                net.direction === 'viewer-owes' ? 'text-negative' : 'text-positive'
              }`}
            >
              {net.direction === 'viewer-owes'
                ? `You owe ${page.ownerName} ${net.amount}`
                : `${page.ownerName} owes you ${net.amount}`}
            </h1>
          ))
        )}
      </header>

      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <TableScroll bleed={false}>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Description</th>
                <th className="text-right">Amount</th>
                <th className="text-right">Balance</th>
              </tr>
            </thead>
            <tbody>
              {page.rows.map((row, index) => (
                <tr key={`${row.date}-${index}`}>
                  <td className="whitespace-nowrap">{row.date}</td>
                  <td>{row.payee}</td>
                  <td className="whitespace-nowrap text-right tabular-nums">
                    {row.amount}
                  </td>
                  <td className="whitespace-pre-line text-right tabular-nums">
                    {row.balance.join('\n')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      </div>

      <p className="text-xs text-muted-foreground">
        Negative amounts are what you owe. Updated {formatUpdated(page.generatedAt)}.
      </p>
    </main>
  );
};

export default SharedDebtView;
```

`features/debtShare/index.ts`:

```ts
export { default as SharedDebtView } from './SharedDebtView';
```

`app/s/[shareId]/page.tsx`:

```tsx
import { SharedDebtView } from '@/features/debtShare';
import { debtShareRepository } from '@/lib/debt-share';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Shared balance',
  robots: { index: false, follow: false },
};

const Page = async ({ params }: { params: Promise<{ shareId: string }> }) => {
  const { shareId } = await params;
  const share = await debtShareRepository.findById(shareId);
  return (
    <SharedDebtView shareId={shareId} sealedPage={share?.sealedPage ?? null} />
  );
};

export default Page;
```

- [ ] **Step 4: Type-check, lint, commit**

Run: `pnpm type-check && pnpm lint`. Expected: clean.

```bash
git add components/AppShell/publicPaths.ts components/AppShell/publicPaths.test.ts proxy.ts features/debtShare/SharedDebtView.tsx features/debtShare/index.ts app/s
git commit -m "feat(debts): public page that opens a shared debt link"
```

---

### Task 7: Owner controls, actions, audit

**Files:**
- Create: `features/debtShare/actions/createDebtShare.ts`, `features/debtShare/actions/revokeDebtShare.ts`, `features/debtShare/actions/createDebtShare.test.ts`, `features/debtShare/ShareControls.tsx`
- Modify: `lib/audit/schema.ts`, `lib/audit/describe.ts`, `features/debtShare/index.ts`, `features/debts/PersonDebts.tsx`, `features/debts/Debts.tsx`

**Interfaces:**
- Consumes: `debtShareService` (Task 4), `withUserLock`, `pull`, `hasSessionDek`, `isSafeLedgerArg`, `auditService`, `rateLimit`.
- Produces:
  ```ts
  type DebtShareActionResult = { ok: true; shareId: string; key: string } | { ok: false; error: string };
  createDebtShareAction(person: string, ownerName: string): Promise<DebtShareActionResult>;
  revokeDebtShareAction(shareId: string): Promise<{ ok: boolean; error?: string }>;
  ShareControls(props: { person: string; link: { shareId: string; key: string; updatedAt: string } | null; defaultOwnerName: string })
  ```

- [ ] **Step 1: Audit actions**

In `lib/audit/schema.ts`, append `'debtShare.create'` and `'debtShare.revoke'` to `AUDIT_ACTIONS`. In `lib/audit/describe.ts`, add labels next to the others:

```ts
  'debtShare.create': ['Shared a debt page', 'Failed to share a debt page'],
  'debtShare.revoke': ['Revoked a debt page link', 'Failed to revoke a debt page link'],
```

Run: `pnpm vitest run lib/audit`. Expected: PASS. If a test enumerates every action, add the two there.

- [ ] **Step 2: Failing action test**

`features/debtShare/actions/createDebtShare.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const create = vi.fn();
vi.mock('@/lib/debt-share', () => ({ debtShareService: { create } }));
vi.mock('@/lib/auth/require-user', () => ({
  requireUser: async () => ({ id: 'alice' }),
}));
const hasSessionDek = vi.fn();
vi.mock('@/lib/crypto/sessionKeys', () => ({ hasSessionDek }));
const pull = vi.fn(async () => ({ fingerprint: 'f' }));
vi.mock('@/lib/storage/sync', () => ({ pull }));
vi.mock('@/lib/audit', () => ({
  auditService: { record: vi.fn() },
  auditRequestMeta: async () => ({}),
}));
vi.mock('@/lib/rate-limit', () => ({
  rateLimit: () => ({ allowed: true }),
  WRITE: 'write',
  RATE_LIMIT_MESSAGE: 'slow down',
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const { createDebtShareAction } = await import('./createDebtShare');

describe('createDebtShareAction', () => {
  beforeEach(() => {
    create.mockReset();
    pull.mockClear();
    hasSessionDek.mockReturnValue(true);
  });

  it('pulls the journal, then creates the share', async () => {
    create.mockResolvedValue({ shareId: 's1', key: 'k', updatedAt: new Date() });
    expect(await createDebtShareAction('Bashir', ' Naeem ')).toEqual({
      ok: true,
      shareId: 's1',
      key: 'k',
    });
    expect(pull).toHaveBeenCalledWith('alice');
    expect(create).toHaveBeenCalledWith('alice', 'Bashir', 'Naeem');
  });

  it('rejects an empty or overlong display name and a flag-like person', async () => {
    expect((await createDebtShareAction('Bashir', '  ')).ok).toBe(false);
    expect((await createDebtShareAction('Bashir', 'x'.repeat(61))).ok).toBe(false);
    expect((await createDebtShareAction('--file=/etc/passwd', 'Naeem')).ok).toBe(false);
    expect(create).not.toHaveBeenCalled();
  });

  it('asks to unlock when locked', async () => {
    hasSessionDek.mockReturnValue(false);
    expect(await createDebtShareAction('Bashir', 'Naeem')).toEqual({
      ok: false,
      error: 'Unlock your journal first.',
    });
  });

  it('reports a failure without throwing', async () => {
    create.mockRejectedValue(new Error('ledger broke'));
    expect(await createDebtShareAction('Bashir', 'Naeem')).toEqual({
      ok: false,
      error: 'Could not create the link. Try again.',
    });
  });
});
```

Run: `pnpm vitest run features/debtShare/actions`. Expected: FAIL, cannot resolve `./createDebtShare`.

- [ ] **Step 3: The actions**

`features/debtShare/actions/createDebtShare.ts`:

```ts
'use server';

import { isSafeLedgerArg } from '@/features/transactions/entry/typeForms/fixBalancePreview';
import { auditRequestMeta, auditService } from '@/lib/audit';
import { requireUser } from '@/lib/auth/require-user';
import { hasSessionDek } from '@/lib/crypto/sessionKeys';
import { debtShareService } from '@/lib/debt-share';
import { withUserLock } from '@/lib/journal/mutex';
import { createLogger } from '@/lib/log';
import { RATE_LIMIT_MESSAGE, WRITE, rateLimit } from '@/lib/rate-limit';
import { pull } from '@/lib/storage/sync';
import { revalidatePath } from 'next/cache';

const log = createLogger('debt-share');
const OWNER_NAME_MAX_LENGTH = 60;

export type DebtShareActionResult =
  | { ok: true; shareId: string; key: string }
  | { ok: false; error: string };

export async function createDebtShareAction(
  person: string,
  ownerName: string
): Promise<DebtShareActionResult> {
  const user = await requireUser();
  if (!rateLimit(WRITE, user.id).allowed) {
    return { ok: false, error: RATE_LIMIT_MESSAGE };
  }
  const name = ownerName.trim();
  if (!isSafeLedgerArg(person) || !name || name.length > OWNER_NAME_MAX_LENGTH) {
    return {
      ok: false,
      error: `Enter a name between 1 and ${OWNER_NAME_MAX_LENGTH} characters.`,
    };
  }
  if (!hasSessionDek(user.id)) {
    return { ok: false, error: 'Unlock your journal first.' };
  }
  try {
    // Building the first page reads the local journal: pull it under the same
    // lock every write uses, so the page matches what's saved.
    const link = await withUserLock(user.id, async () => {
      await pull(user.id);
      return debtShareService.create(user.id, person, name);
    });
    await auditService.record(user.id, {
      action: 'debtShare.create',
      result: 'success',
      targetUid: link.shareId,
      ...(await auditRequestMeta()),
    });
    revalidatePath('/debts', 'layout');
    return { ok: true, shareId: link.shareId, key: link.key };
  } catch (err) {
    log.error({ err }, 'failed to create debt share');
    await auditService.record(user.id, {
      action: 'debtShare.create',
      result: 'failure',
      ...(await auditRequestMeta()),
    });
    return { ok: false, error: 'Could not create the link. Try again.' };
  }
}
```

`features/debtShare/actions/revokeDebtShare.ts`:

```ts
'use server';

import { auditRequestMeta, auditService } from '@/lib/audit';
import { requireUser } from '@/lib/auth/require-user';
import { debtShareService } from '@/lib/debt-share';
import { RATE_LIMIT_MESSAGE, WRITE, rateLimit } from '@/lib/rate-limit';
import { revalidatePath } from 'next/cache';

export async function revokeDebtShareAction(
  shareId: string
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  if (!rateLimit(WRITE, user.id).allowed) {
    return { ok: false, error: RATE_LIMIT_MESSAGE };
  }
  const removed = await debtShareService.revoke(user.id, shareId);
  await auditService.record(user.id, {
    action: 'debtShare.revoke',
    result: removed ? 'success' : 'failure',
    targetUid: shareId,
    ...(await auditRequestMeta()),
  });
  revalidatePath('/debts', 'layout');
  return removed ? { ok: true } : { ok: false, error: 'That link was already revoked.' };
}
```

Run: `pnpm vitest run features/debtShare/actions`. Expected: PASS.

- [ ] **Step 4: `ShareControls`**

`features/debtShare/ShareControls.tsx`:

```tsx
'use client';

import { createDebtShareAction } from './actions/createDebtShare';
import { revokeDebtShareAction } from './actions/revokeDebtShare';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

type Props = {
  person: string;
  link: { shareId: string; key: string; updatedAt: string } | null;
  defaultOwnerName: string;
};

const linkUrl = (shareId: string, key: string): string =>
  `${window.location.origin}/s/${shareId}#${key}`;

const copyLink = async (shareId: string, key: string) => {
  await navigator.clipboard.writeText(linkUrl(shareId, key));
  toast.success('Link copied.');
};

/** Share, copy, or revoke the read-only link to this person's debts. */
const ShareControls = ({ person, link, defaultOwnerName }: Props) => {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [ownerName, setOwnerName] = useState(defaultOwnerName);
  const [error, setError] = useState<string | null>(null);

  const share = () =>
    startTransition(async () => {
      const result = await createDebtShareAction(person, ownerName);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
      await copyLink(result.shareId, result.key);
      router.refresh();
    });

  const revoke = (shareId: string) =>
    startTransition(async () => {
      const result = await revokeDebtShareAction(shareId);
      if (result.ok) toast.success('Link revoked. It no longer works.');
      else toast.error(result.error ?? 'Could not revoke the link.');
      router.refresh();
    });

  if (link) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">
          Shared · updated{' '}
          {new Date(link.updatedAt).toLocaleString(undefined, {
            dateStyle: 'medium',
            timeStyle: 'short',
          })}
        </span>
        <Button size="sm" variant="outline" onClick={() => copyLink(link.shareId, link.key)}>
          Copy link
        </Button>
        <AlertDialog>
          <AlertDialogTrigger render={<Button size="sm" variant="outline" disabled={pending} />}>
            Revoke
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Revoke this link?</AlertDialogTitle>
              <AlertDialogDescription>
                {person} will see “This link is no longer active”. The link
                can’t be brought back; sharing again makes a new one.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => revoke(link.shareId)}>
                Revoke
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>
        Share
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Share with {person}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {person} gets a read-only link showing your debts with each other:
          dates, descriptions and amounts. No other accounts, no notes. It
          updates whenever you save, until you revoke it.
        </p>
        <div className="grid gap-2">
          <Label htmlFor="share-owner-name">Your name on the page</Label>
          <Input
            id="share-owner-name"
            value={ownerName}
            maxLength={60}
            onChange={(event) => setOwnerName(event.target.value)}
          />
          {error && <p className="text-sm text-negative">{error}</p>}
        </div>
        <DialogFooter>
          <Button onClick={share} disabled={pending || !ownerName.trim()}>
            Create link and copy
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ShareControls;
```

Before keeping the trigger markup, check how `AlertDialogTrigger` and `DialogTrigger` take a custom button in this repo. The UI kit is Base UI, which uses `render={...}`. Grep an existing use (`rg "DialogTrigger" features`) and copy its form.

Add to `features/debtShare/index.ts`:

```ts
export { default as ShareControls } from './ShareControls';
```

- [ ] **Step 5: Mount on the person page and mark the list**

`features/debts/PersonDebts.tsx`: import `requireUser`, `debtShareService` from `@/lib/debt-share`, and `ShareControls` from `@/features/debtShare`. After the `isSafeLedgerArg` check, add:

```tsx
  const user = await requireUser();
  const shareLink = await debtShareService.linkFor(user.id, person);
```

and render, right under the `<h1>{person}</h1>`:

```tsx
          <div className="mt-2">
            <ShareControls
              person={person}
              defaultOwnerName={user.name ?? ''}
              link={
                shareLink && {
                  shareId: shareLink.shareId,
                  key: shareLink.key,
                  updatedAt: shareLink.updatedAt.toISOString(),
                }
              }
            />
          </div>
```

`features/debts/Debts.tsx`: import `requireUser` and `debtShareService`. Next to `getBaseCurrency()`, load `const shared = await debtShareService.sharedPeople((await requireUser()).id);`. After the direction `<span>`, add:

```tsx
                      {shared.has(debt.person) && (
                        <span className="ml-2 rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                          Shared
                        </span>
                      )}
```

- [ ] **Step 6: Verify, commit**

Run: `pnpm type-check && pnpm lint && pnpm test`. Expected: all clean and green.

```bash
git add lib/audit features/debtShare features/debts
git commit -m "feat(debts): share, copy and revoke a person's debt link"
```

---

### Task 8: Walk it in the running app

No code. This checks the parts unit tests can't reach.

- [ ] `pnpm dev` (needs Postgres + Garage; see `scripts/app-dev.sh`). Sign in, unlock, and open `/debts/<someone>`.
- [ ] Share with a display name. The link is copied. "Shared · updated …" shows, and `/debts` marks the person.
- [ ] Open the link in a private window. You see the header in the viewer's words, the rows newest first, and no other account names.
- [ ] `curl -sI http://localhost:3000/s/<id>` shows `Referrer-Policy: no-referrer`, `X-Robots-Tag: noindex, nofollow` and `Cache-Control: no-store`.
- [ ] Add a transaction for that person in the app. Reload the private window: the new row is there and the "Updated" time moved.
- [ ] Change one character of the key in the URL, then reload. You see "This link is no longer active".
- [ ] Lock the journal, then reload the private window. The page still opens and shows the last version.
- [ ] Revoke. The private window shows "no longer active" after a reload.
- [ ] `psql` → `select * from "debtShare"`. There is no readable name or amount in any column.
- [ ] Note the results in the PR body.
