# Encrypted Journals — P1: Crypto Core + Storage Seam — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the server-side cryptographic foundation for zero-knowledge journal encryption — per-file AES-256-GCM, an in-RAM per-user session-key store, the `userCrypto` table, and encrypt/decrypt wired into the Garage push/pull seam — with no UI, fully inert until a DEK is ever set.

**Architecture:** Encryption lives entirely at the storage sync seam (`lib/storage/download.ts` + `save.ts`), inside the existing `withUserLock`. The seam is **DEK-driven**: a file is encrypted on upload iff the user's session holds a Data Encryption Key (DEK); a downloaded file is decrypted iff it carries the `LEJ1` magic header (else it passes through as legacy/mid-migration plaintext). `runLedger`, `verify`, and the repository never change — they keep reading plaintext local files. Wraps (KEK→DEK) are created and unwrapped **client-side** (P2), so the server never sees the passphrase; the server only receives the raw DEK over TLS at `/api/crypto/unlock` and holds it in RAM for the session.

**Tech Stack:** TypeScript, Next.js 16 (app router), Node `crypto` (AES-256-GCM, HKDF-SHA256), Drizzle ORM + Postgres, Vitest + PGlite.

## Global Constraints

- **Zero-knowledge at rest:** server never persists the DEK, passphrase, or recovery code. The DEK exists only in RAM, only for the session.
- **Encryption is confined to the storage seam** (`lib/storage/download.ts`, `lib/storage/save.ts`). Do NOT modify `utils/runLedger.ts`, `utils/runLedgerForUser.ts`, `lib/journal/verify.ts`, or `lib/journal/repository.ts`.
- **Cipher:** AES-256-GCM. **DEK:** exactly 32 bytes. **Per-file subkey:** `HKDF-SHA256(DEK, salt="", info=relPath)` → 32 bytes. **AAD:** `"LEJ1"(4) || version(1) || utf8(relPath)`.
- **On-disk envelope (per file):** `[magic "LEJ1"(4)][version=1(1)][nonce(12)][ciphertext][tag(16)]`.
- **Seam is DEK-driven and DB-free:** encrypt iff `getSessionDek(userId)` returns a key; decrypt iff `isCiphertext(body)`. No `userCrypto` lookup in the seam — existing storage tests must keep passing unchanged.
- **The `.manifest.json` is never encrypted** — `listLocalRelPaths` already excludes it and it is never uploaded, so no special-casing is needed.
- **Drizzle migration workflow:** new table → schema file → export from `db/schema/index.ts` → add to `tablesFilter` in `drizzle.config.ts` → `pnpm db:generate` → commit the generated SQL + `db/migrations/meta`.
- **Test command:** `pnpm test` (Vitest). **Type check:** `pnpm type-check`.
- All new server code that imports Node `crypto` runs server-side only (the seam and routes are already server-only).

---

## File Structure

**Create:**
- `lib/crypto/fileCrypto.ts` — per-file AES-256-GCM encrypt/decrypt + `isCiphertext`. Pure, no I/O.
- `lib/crypto/sessionKeys.ts` — in-RAM `Map<userId, DEK>` + `LockedError`.
- `lib/crypto/journalCipher.ts` — seam adapters `encryptForUpload` / `decryptFromDownload` (compose fileCrypto + sessionKeys).
- `lib/crypto/transport.ts` — `decodeDek` (validate base64 → 32-byte Buffer).
- `lib/crypto/userCryptoRepository.ts` — Drizzle repo (`get`/`exists`/`create`).
- `lib/crypto/index.ts` — lazy singleton `getUserCryptoRepository()` + re-exports.
- `db/schema/userCrypto.ts` — the `userCrypto` table.
- `app/api/crypto/unlock/route.ts` — `POST` store DEK for the session user.
- `app/api/crypto/lock/route.ts` — `POST` drop DEK.
- Tests: `lib/crypto/fileCrypto.test.ts`, `lib/crypto/sessionKeys.test.ts`, `lib/crypto/journalCipher.test.ts`, `lib/crypto/transport.test.ts`, `lib/crypto/userCryptoRepository.test.ts`, `lib/storage/seam-encryption.test.ts`, `app/api/crypto/unlock/route.test.ts`.

**Modify:**
- `lib/storage/download.ts:75-77` — decrypt after `store.get` before `fs.writeFile`.
- `lib/storage/save.ts:53-57` — encrypt before `store.put`.
- `db/schema/index.ts` — export `userCrypto`.
- `drizzle.config.ts` — add `'userCrypto'` to `tablesFilter`.
- `lib/rate-limit/limits.ts` — add `UNLOCK` policy.
- `db/migrations/` — generated SQL + meta (via `pnpm db:generate`).

---

## Task 1: Per-file crypto primitive (`lib/crypto/fileCrypto.ts`)

**Files:**
- Create: `lib/crypto/fileCrypto.ts`
- Test: `lib/crypto/fileCrypto.test.ts`

**Interfaces:**
- Produces:
  - `encryptFile(dek: Buffer, relPath: string, plaintext: Buffer): Buffer`
  - `decryptFile(dek: Buffer, relPath: string, buf: Buffer): Buffer`
  - `isCiphertext(buf: Buffer): boolean`
  - `MAGIC: Buffer`, `VERSION: number`

- [ ] **Step 1: Write the failing test**

```ts
// lib/crypto/fileCrypto.test.ts
import { randomBytes } from 'crypto';
import { describe, expect, it } from 'vitest';
import { decryptFile, encryptFile, isCiphertext, MAGIC } from './fileCrypto';

const dek = () => randomBytes(32);

describe('fileCrypto', () => {
  it('round-trips plaintext under the same dek + relPath', () => {
    const key = dek();
    const pt = Buffer.from('2026/01/01 Opening\n  Assets:Cash  $10\n', 'utf8');
    const ct = encryptFile(key, 'main.ledger', pt);
    expect(ct.subarray(0, 4).equals(MAGIC)).toBe(true);
    expect(ct.equals(pt)).toBe(false);
    expect(decryptFile(key, 'main.ledger', ct).equals(pt)).toBe(true);
  });

  it('isCiphertext detects the envelope and rejects plaintext', () => {
    const ct = encryptFile(dek(), 'main.ledger', Buffer.from('x'));
    expect(isCiphertext(ct)).toBe(true);
    expect(isCiphertext(Buffer.from('2026/01/01 Payee\n'))).toBe(false);
    expect(isCiphertext(Buffer.alloc(3))).toBe(false);
  });

  it('fails when the relPath (AAD/subkey) differs — no cross-file swap', () => {
    const key = dek();
    const ct = encryptFile(key, 'main.ledger', Buffer.from('secret'));
    expect(() => decryptFile(key, 'other.ledger', ct)).toThrow();
  });

  it('fails under a different dek', () => {
    const ct = encryptFile(dek(), 'main.ledger', Buffer.from('secret'));
    expect(() => decryptFile(dek(), 'main.ledger', ct)).toThrow();
  });

  it('fails when the ciphertext is tampered', () => {
    const key = dek();
    const ct = encryptFile(key, 'main.ledger', Buffer.from('secret'));
    ct[ct.length - 1] ^= 0xff; // flip a tag byte
    expect(() => decryptFile(key, 'main.ledger', ct)).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test lib/crypto/fileCrypto.test.ts`
Expected: FAIL — cannot find module `./fileCrypto`.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/crypto/fileCrypto.ts
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'crypto';

// On-disk envelope: [magic "LEJ1"(4)][version(1)][nonce(12)][ciphertext][tag(16)]
export const MAGIC = Buffer.from('LEJ1', 'ascii');
export const VERSION = 1;
const NONCE_LEN = 12;
const TAG_LEN = 16;
const HEADER_LEN = MAGIC.length + 1 + NONCE_LEN; // 17

/** Per-file 256-bit subkey: HKDF-SHA256(DEK, info = relPath). Binds each file's
 * key to its path so ciphertexts can't be swapped between files. */
const subkeyFor = (dek: Buffer, relPath: string): Buffer =>
  Buffer.from(
    hkdfSync('sha256', dek, Buffer.alloc(0), Buffer.from(relPath, 'utf8'), 32)
  );

/** AAD binds magic+version+relPath into the GCM tag (defence in depth). */
const aadFor = (relPath: string): Buffer =>
  Buffer.concat([MAGIC, Buffer.from([VERSION]), Buffer.from(relPath, 'utf8')]);

export const isCiphertext = (buf: Buffer): boolean =>
  buf.length >= HEADER_LEN + TAG_LEN &&
  buf.subarray(0, MAGIC.length).equals(MAGIC);

export const encryptFile = (
  dek: Buffer,
  relPath: string,
  plaintext: Buffer
): Buffer => {
  const nonce = randomBytes(NONCE_LEN);
  const cipher = createCipheriv('aes-256-gcm', subkeyFor(dek, relPath), nonce);
  cipher.setAAD(aadFor(relPath));
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([MAGIC, Buffer.from([VERSION]), nonce, ct, tag]);
};

export const decryptFile = (
  dek: Buffer,
  relPath: string,
  buf: Buffer
): Buffer => {
  if (!isCiphertext(buf)) throw new Error('Not a LEJ1 ciphertext file');
  const version = buf[MAGIC.length];
  if (version !== VERSION) throw new Error(`Unsupported crypto version ${version}`);
  const nonce = buf.subarray(MAGIC.length + 1, HEADER_LEN);
  const tag = buf.subarray(buf.length - TAG_LEN);
  const ct = buf.subarray(HEADER_LEN, buf.length - TAG_LEN);
  const decipher = createDecipheriv('aes-256-gcm', subkeyFor(dek, relPath), nonce);
  decipher.setAAD(aadFor(relPath));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]);
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test lib/crypto/fileCrypto.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/crypto/fileCrypto.ts lib/crypto/fileCrypto.test.ts
git commit -m "feat(crypto): per-file AES-256-GCM envelope with HKDF subkey + AAD"
```

---

## Task 2: Session-key store (`lib/crypto/sessionKeys.ts`)

**Files:**
- Create: `lib/crypto/sessionKeys.ts`
- Test: `lib/crypto/sessionKeys.test.ts`

**Interfaces:**
- Produces:
  - `setSessionDek(userId: string, dek: Buffer): void` (throws if `dek.length !== 32`)
  - `getSessionDek(userId: string): Buffer | undefined`
  - `hasSessionDek(userId: string): boolean`
  - `dropSessionDek(userId: string): void`
  - `__resetSessionKeysForTest(): void`
  - `class LockedError extends Error`

- [ ] **Step 1: Write the failing test**

```ts
// lib/crypto/sessionKeys.test.ts
import { randomBytes } from 'crypto';
import { afterEach, describe, expect, it } from 'vitest';
import {
  __resetSessionKeysForTest,
  dropSessionDek,
  getSessionDek,
  hasSessionDek,
  setSessionDek,
} from './sessionKeys';

afterEach(() => __resetSessionKeysForTest());

describe('sessionKeys', () => {
  it('stores and retrieves a DEK per user', () => {
    const dek = randomBytes(32);
    setSessionDek('alice', dek);
    expect(hasSessionDek('alice')).toBe(true);
    expect(getSessionDek('alice')!.equals(dek)).toBe(true);
    expect(getSessionDek('bob')).toBeUndefined();
  });

  it('drops a DEK', () => {
    setSessionDek('alice', randomBytes(32));
    dropSessionDek('alice');
    expect(hasSessionDek('alice')).toBe(false);
    expect(getSessionDek('alice')).toBeUndefined();
  });

  it('rejects a wrong-length DEK', () => {
    expect(() => setSessionDek('alice', randomBytes(16))).toThrow();
  });

  it('copies the buffer so external mutation cannot corrupt the stored key', () => {
    const dek = randomBytes(32);
    setSessionDek('alice', dek);
    dek.fill(0);
    expect(getSessionDek('alice')!.equals(Buffer.alloc(32))).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test lib/crypto/sessionKeys.test.ts`
Expected: FAIL — cannot find module `./sessionKeys`.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/crypto/sessionKeys.ts
const DEK_BYTES = 32;
const keys = new Map<string, Buffer>();

/** Thrown when an operation needs the DEK but the session is locked. */
export class LockedError extends Error {
  constructor(message = 'Journal is locked; unlock to continue.') {
    super(message);
    this.name = 'LockedError';
  }
}

export const setSessionDek = (userId: string, dek: Buffer): void => {
  if (dek.length !== DEK_BYTES) {
    throw new Error(`DEK must be ${DEK_BYTES} bytes, got ${dek.length}`);
  }
  keys.set(userId, Buffer.from(dek)); // defensive copy
};

export const getSessionDek = (userId: string): Buffer | undefined =>
  keys.get(userId);

export const hasSessionDek = (userId: string): boolean => keys.has(userId);

export const dropSessionDek = (userId: string): void => {
  keys.delete(userId);
};

/** Test-only: clear all in-RAM keys between tests. */
export const __resetSessionKeysForTest = (): void => {
  keys.clear();
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test lib/crypto/sessionKeys.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/crypto/sessionKeys.ts lib/crypto/sessionKeys.test.ts
git commit -m "feat(crypto): in-RAM per-user session DEK store + LockedError"
```

---

## Task 3: `userCrypto` table + repository

**Files:**
- Create: `db/schema/userCrypto.ts`, `lib/crypto/userCryptoRepository.ts`, `lib/crypto/index.ts`
- Modify: `db/schema/index.ts`, `drizzle.config.ts`
- Generated: `db/migrations/XXXX_*.sql` + `db/migrations/meta/*` (via `pnpm db:generate`)
- Test: `lib/crypto/userCryptoRepository.test.ts`

**Interfaces:**
- Produces:
  - table `userCrypto` with columns `userId` (PK→user, cascade), `wrapPassphrase` text, `passSalt` text, `argonParams` jsonb `{m,t,p}`, `wrapRecovery` text, `recoveryCreatedAt` ts, `kdfVersion` int default 1, `createdAt` ts, `updatedAt` ts.
  - `UserCrypto = typeof userCrypto.$inferSelect`, `NewUserCrypto = typeof userCrypto.$inferInsert`
  - `class UserCryptoRepository { get(userId): Promise<UserCrypto|null>; exists(userId): Promise<boolean>; create(input: NewUserCrypto): Promise<void> }`
  - `getUserCryptoRepository(): UserCryptoRepository` (lazy singleton bound to `@/lib/db`)

- [ ] **Step 1: Create the schema file**

```ts
// db/schema/userCrypto.ts
import { sql } from 'drizzle-orm';
import { user } from '@naeemba/next-starter/schema';
import { integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/** Client-side Argon2id parameters, stored for forward-compat. */
export type ArgonParams = { m: number; t: number; p: number };

export const userCrypto = pgTable('userCrypto', {
  userId: text('userId')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  // All wraps are opaque base64 blobs created client-side; the server never unwraps them.
  wrapPassphrase: text('wrapPassphrase').notNull(),
  passSalt: text('passSalt').notNull(),
  argonParams: jsonb('argonParams').notNull().$type<ArgonParams>(),
  wrapRecovery: text('wrapRecovery').notNull(),
  recoveryCreatedAt: timestamp('recoveryCreatedAt')
    .notNull()
    .default(sql`now()`),
  kdfVersion: integer('kdfVersion').notNull().default(1),
  createdAt: timestamp('createdAt').notNull().default(sql`now()`),
  updatedAt: timestamp('updatedAt')
    .notNull()
    .default(sql`now()`)
    .$onUpdate(() => sql`now()`),
});

export type UserCrypto = typeof userCrypto.$inferSelect;
export type NewUserCrypto = typeof userCrypto.$inferInsert;
```

- [ ] **Step 2: Export from the schema barrel and add to drizzle tablesFilter**

In `db/schema/index.ts`, add (keep alphabetical-ish ordering consistent with the file):

```ts
export { userCrypto, type UserCrypto } from './userCrypto';
```

In `drizzle.config.ts`, add `'userCrypto'` to the `tablesFilter` array:

```ts
  tablesFilter: [
    'userSetting',
    'userCrypto',
    'template',
    'commodity_price',
    'price_fetch_run',
    'savedView',
  ],
```

- [ ] **Step 3: Generate the migration**

Run: `pnpm db:generate`
Expected: a new `db/migrations/XXXX_*.sql` containing `CREATE TABLE "userCrypto" (...)` with the FK to `"user"`, plus updated files under `db/migrations/meta/`. Open the SQL and confirm it creates `userCrypto` and nothing else unexpected.

- [ ] **Step 4: Write the repository**

```ts
// lib/crypto/userCryptoRepository.ts
import { eq } from 'drizzle-orm';
import {
  userCrypto,
  type NewUserCrypto,
  type UserCrypto,
} from '@/db/schema/userCrypto';
import type { DbInstance } from '@/lib/db/connection';

export class UserCryptoRepository {
  constructor(private readonly db: DbInstance) {}

  async get(userId: string): Promise<UserCrypto | null> {
    const rows = await this.db
      .select()
      .from(userCrypto)
      .where(eq(userCrypto.userId, userId))
      .limit(1);
    return rows[0] ?? null;
  }

  async exists(userId: string): Promise<boolean> {
    return (await this.get(userId)) !== null;
  }

  async create(input: NewUserCrypto): Promise<void> {
    await this.db.insert(userCrypto).values(input);
  }
}
```

```ts
// lib/crypto/index.ts
import { db } from '@/lib/db';
import { UserCryptoRepository } from './userCryptoRepository';

let repo: UserCryptoRepository | null = null;

/** Lazy singleton bound to the production db (connects on first query). */
export const getUserCryptoRepository = (): UserCryptoRepository =>
  (repo ??= new UserCryptoRepository(db));

export { UserCryptoRepository } from './userCryptoRepository';
```

- [ ] **Step 5: Write the failing test**

```ts
// lib/crypto/userCryptoRepository.test.ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { UserCryptoRepository } from './userCryptoRepository';
import { setupTestDb, teardownTestDb, type TestDbContext } from '@/lib/test-utils/db';

describe('UserCryptoRepository', () => {
  let ctx: TestDbContext;
  let repo: UserCryptoRepository;

  beforeEach(async () => {
    ctx = await setupTestDb('user-crypto-');
    await ctx.insertUser('alice');
    repo = new UserCryptoRepository(ctx.db);
  });

  afterEach(async () => {
    await teardownTestDb(ctx);
  });

  it('create → get → exists round-trips', async () => {
    expect(await repo.exists('alice')).toBe(false);
    await repo.create({
      userId: 'alice',
      wrapPassphrase: 'd2FwUA==',
      passSalt: 'c2FsdA==',
      argonParams: { m: 65536, t: 3, p: 1 },
      wrapRecovery: 'd2FwUg==',
    });
    expect(await repo.exists('alice')).toBe(true);
    const row = await repo.get('alice');
    expect(row?.wrapPassphrase).toBe('d2FwUA==');
    expect(row?.argonParams).toEqual({ m: 65536, t: 3, p: 1 });
    expect(row?.kdfVersion).toBe(1);
  });

  it('exists is false for an unknown user', async () => {
    expect(await repo.exists('nobody')).toBe(false);
  });
});
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm test lib/crypto/userCryptoRepository.test.ts`
Expected: PASS (2 tests). (If migrations did not apply, the failure will mention a missing `userCrypto` relation — re-run Step 3.)

- [ ] **Step 7: Type-check and commit**

```bash
pnpm type-check
git add db/schema/userCrypto.ts db/schema/index.ts drizzle.config.ts db/migrations \
  lib/crypto/userCryptoRepository.ts lib/crypto/index.ts lib/crypto/userCryptoRepository.test.ts
git commit -m "feat(crypto): userCrypto table + repository (wrap storage)"
```

---

## Task 4: Wire encryption into the storage seam

**Files:**
- Create: `lib/crypto/journalCipher.ts`
- Modify: `lib/storage/download.ts`, `lib/storage/save.ts`
- Test: `lib/crypto/journalCipher.test.ts`, `lib/storage/seam-encryption.test.ts`

**Interfaces:**
- Consumes: `encryptFile`/`decryptFile`/`isCiphertext` (Task 1), `getSessionDek`/`LockedError` (Task 2).
- Produces:
  - `encryptForUpload(userId: string, relPath: string, plaintext: Buffer): Buffer`
  - `decryptFromDownload(userId: string, relPath: string, body: Buffer): Buffer`

- [ ] **Step 1: Write the failing unit test for the adapters**

```ts
// lib/crypto/journalCipher.test.ts
import { randomBytes } from 'crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { encryptFile, isCiphertext } from './fileCrypto';
import { decryptFromDownload, encryptForUpload } from './journalCipher';
import { LockedError, __resetSessionKeysForTest, setSessionDek } from './sessionKeys';

afterEach(() => __resetSessionKeysForTest());

describe('journalCipher', () => {
  it('encryptForUpload encrypts when the session holds a DEK', () => {
    setSessionDek('alice', randomBytes(32));
    const out = encryptForUpload('alice', 'main.ledger', Buffer.from('plain'));
    expect(isCiphertext(out)).toBe(true);
  });

  it('encryptForUpload passes through plaintext when no DEK (not enabled)', () => {
    const pt = Buffer.from('plain');
    expect(encryptForUpload('bob', 'main.ledger', pt).equals(pt)).toBe(true);
  });

  it('decryptFromDownload decrypts ciphertext when the DEK is present', () => {
    const dek = randomBytes(32);
    setSessionDek('alice', dek);
    const ct = encryptFile(dek, 'main.ledger', Buffer.from('secret'));
    expect(decryptFromDownload('alice', 'main.ledger', ct).toString()).toBe('secret');
  });

  it('decryptFromDownload passes through plaintext bodies', () => {
    const pt = Buffer.from('2026/01/01 Payee\n');
    expect(decryptFromDownload('bob', 'main.ledger', pt).equals(pt)).toBe(true);
  });

  it('decryptFromDownload throws LockedError on ciphertext with no DEK', () => {
    const ct = encryptFile(randomBytes(32), 'main.ledger', Buffer.from('secret'));
    expect(() => decryptFromDownload('carol', 'main.ledger', ct)).toThrow(LockedError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test lib/crypto/journalCipher.test.ts`
Expected: FAIL — cannot find module `./journalCipher`.

- [ ] **Step 3: Implement the adapters**

```ts
// lib/crypto/journalCipher.ts
import { decryptFile, encryptFile, isCiphertext } from './fileCrypto';
import { getSessionDek, LockedError } from './sessionKeys';

/**
 * Encrypt a journal file for upload IFF the user's session holds a DEK.
 * No DEK → the user is not encryption-enabled → upload plaintext unchanged.
 */
export const encryptForUpload = (
  userId: string,
  relPath: string,
  plaintext: Buffer
): Buffer => {
  const dek = getSessionDek(userId);
  return dek ? encryptFile(dek, relPath, plaintext) : plaintext;
};

/**
 * Decrypt a downloaded journal file IFF it carries the LEJ1 envelope. Plaintext
 * bodies (legacy / mid-migration) pass through untouched. Ciphertext with no
 * session DEK is a locked read → LockedError.
 */
export const decryptFromDownload = (
  userId: string,
  relPath: string,
  body: Buffer
): Buffer => {
  if (!isCiphertext(body)) return body;
  const dek = getSessionDek(userId);
  if (!dek) throw new LockedError();
  return decryptFile(dek, relPath, body);
};
```

- [ ] **Step 4: Run unit test to verify it passes**

Run: `pnpm test lib/crypto/journalCipher.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Wire into `download.ts`**

In `lib/storage/download.ts`, add the import near the other `@/lib` imports:

```ts
import { decryptFromDownload } from '@/lib/crypto/journalCipher';
```

Replace the download/write block (currently lines 75-77):

```ts
    const { body } = await store.get(obj.key);
    await fs.mkdir(path.dirname(localAbs), { recursive: true });
    await fs.writeFile(localAbs, body);
```

with:

```ts
    const { body } = await store.get(obj.key);
    const plaintext = decryptFromDownload(userId, rel, body);
    await fs.mkdir(path.dirname(localAbs), { recursive: true });
    await fs.writeFile(localAbs, plaintext);
```

- [ ] **Step 6: Wire into `save.ts`**

In `lib/storage/save.ts`, add the import:

```ts
import { encryptForUpload } from '@/lib/crypto/journalCipher';
```

Replace the upload loop body (currently lines 53-57):

```ts
  for (const rel of localRels) {
    const body = await fs.readFile(path.join(dir, rel));
    const { etag } = await store.put(keyFor(userId, rel), body);
    next[rel] = etag;
  }
```

with:

```ts
  for (const rel of localRels) {
    const body = await fs.readFile(path.join(dir, rel));
    const payload = encryptForUpload(userId, rel, body);
    const { etag } = await store.put(keyFor(userId, rel), payload);
    next[rel] = etag;
  }
```

- [ ] **Step 7: Write the seam round-trip integration test**

```ts
// lib/storage/seam-encryption.test.ts
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { randomBytes } from 'crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isCiphertext } from '@/lib/crypto/fileCrypto';
import {
  __resetSessionKeysForTest,
  LockedError,
  setSessionDek,
} from '@/lib/crypto/sessionKeys';
import { getJournalDir } from '@/lib/journal/layout';
import { MemoryObjectStore } from './memoryObjectStore';
import { pullToLocal } from './download';
import { keyFor, userPrefix } from './manifest';
import { pushFromLocal } from './save';

let prevDataDir: string | undefined;
let tmp: string;

beforeEach(async () => {
  prevDataDir = process.env.DATA_DIR;
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'seam-enc-'));
  process.env.DATA_DIR = tmp;
});

afterEach(async () => {
  __resetSessionKeysForTest();
  if (prevDataDir === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = prevDataDir;
  await fs.rm(tmp, { recursive: true, force: true });
});

const writeLocal = async (userId: string, rel: string, content: string) => {
  const abs = path.join(getJournalDir(userId), rel);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, content);
};

describe('storage seam encryption', () => {
  it('enabled user: push stores ciphertext, pull restores plaintext', async () => {
    const store = new MemoryObjectStore();
    const userId = 'alice';
    setSessionDek(userId, randomBytes(32)); // "enabled"
    const plaintext = '2026/01/01 Opening\n  Assets:Cash  $10\n';
    await writeLocal(userId, 'main.ledger', plaintext);

    await pushFromLocal(store, userId);

    // Remote object is ciphertext, not the plaintext.
    const remote = await store.get(keyFor(userId, 'main.ledger'));
    expect(isCiphertext(remote.body)).toBe(true);
    expect(remote.body.toString()).not.toContain('Assets:Cash');

    // Wipe local, pull back, expect decrypted plaintext.
    await fs.rm(getJournalDir(userId), { recursive: true, force: true });
    await pullToLocal(store, userId);
    const restored = await fs.readFile(
      path.join(getJournalDir(userId), 'main.ledger'),
      'utf8'
    );
    expect(restored).toBe(plaintext);
  });

  it('not-enabled user: push stores plaintext (no behaviour change)', async () => {
    const store = new MemoryObjectStore();
    const userId = 'bob'; // no session DEK
    await writeLocal(userId, 'main.ledger', 'hello');
    await pushFromLocal(store, userId);
    const remote = await store.get(keyFor(userId, 'main.ledger'));
    expect(isCiphertext(remote.body)).toBe(false);
    expect(remote.body.toString()).toBe('hello');
  });

  it('locked user: pulling ciphertext throws LockedError', async () => {
    const store = new MemoryObjectStore();
    const userId = 'carol';
    // Seed remote with ciphertext authored by an unlocked session.
    setSessionDek(userId, randomBytes(32));
    await writeLocal(userId, 'main.ledger', 'secret');
    await pushFromLocal(store, userId);
    // Now "lock" and wipe local cache.
    __resetSessionKeysForTest();
    await fs.rm(getJournalDir(userId), { recursive: true, force: true });

    await expect(pullToLocal(store, userId)).rejects.toBeInstanceOf(LockedError);
  });
});
```

- [ ] **Step 8: Run the seam test + the full storage suite**

Run: `pnpm test lib/storage lib/crypto/journalCipher.test.ts`
Expected: PASS — the new `seam-encryption.test.ts` passes AND the pre-existing `download.test.ts` / `save.test.ts` / `sync.test.ts` still pass unchanged (they exercise the not-enabled passthrough path).

- [ ] **Step 9: Type-check and commit**

```bash
pnpm type-check
git add lib/crypto/journalCipher.ts lib/crypto/journalCipher.test.ts \
  lib/storage/download.ts lib/storage/save.ts lib/storage/seam-encryption.test.ts
git commit -m "feat(crypto): encrypt/decrypt at the Garage push/pull seam (DEK-driven)"
```

---

## Task 5: `/api/crypto/unlock` + `/api/crypto/lock` routes

**Files:**
- Create: `lib/crypto/transport.ts`, `app/api/crypto/unlock/route.ts`, `app/api/crypto/lock/route.ts`
- Modify: `lib/rate-limit/limits.ts`
- Test: `lib/crypto/transport.test.ts`, `app/api/crypto/unlock/route.test.ts`

**Interfaces:**
- Consumes: `setSessionDek`/`dropSessionDek` (Task 2), `getUserCryptoRepository` (Task 3), `requireUser`, `rateLimit`.
- Produces: `decodeDek(value: unknown): Buffer`; HTTP `POST /api/crypto/unlock` (204 / 400 / 409 / 429), `POST /api/crypto/lock` (204).

- [ ] **Step 1: Write the failing test for `decodeDek`**

```ts
// lib/crypto/transport.test.ts
import { randomBytes } from 'crypto';
import { describe, expect, it } from 'vitest';
import { decodeDek } from './transport';

describe('decodeDek', () => {
  it('decodes a base64 32-byte DEK', () => {
    const dek = randomBytes(32);
    expect(decodeDek(dek.toString('base64')).equals(dek)).toBe(true);
  });

  it('rejects a non-string', () => {
    expect(() => decodeDek(123)).toThrow();
    expect(() => decodeDek(undefined)).toThrow();
  });

  it('rejects a wrong-length DEK', () => {
    expect(() => decodeDek(randomBytes(16).toString('base64'))).toThrow();
    expect(() => decodeDek('')).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test lib/crypto/transport.test.ts`
Expected: FAIL — cannot find module `./transport`.

- [ ] **Step 3: Implement `decodeDek`**

```ts
// lib/crypto/transport.ts
const DEK_BYTES = 32;

/** Decode a base64-encoded DEK posted by the browser into a 32-byte Buffer. */
export const decodeDek = (value: unknown): Buffer => {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error('Missing dek');
  }
  const buf = Buffer.from(value, 'base64'); // lenient; validate by length
  if (buf.length !== DEK_BYTES) {
    throw new Error(`DEK must be ${DEK_BYTES} bytes`);
  }
  return buf;
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test lib/crypto/transport.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Add the `UNLOCK` rate-limit policy**

In `lib/rate-limit/limits.ts`, add after the existing policies:

```ts
export const UNLOCK: RateLimitPolicy = {
  name: 'unlock',
  max: 10,
  windowMs: 60_000,
};
```

Confirm `lib/rate-limit/index.ts` re-exports the named policies (the existing ones like `UPLOAD` are imported from `@/lib/rate-limit`); if policies are re-exported explicitly, add `UNLOCK` to that re-export the same way.

- [ ] **Step 6: Write the route handlers**

```ts
// app/api/crypto/unlock/route.ts
import { requireUser } from '@/lib/auth/require-user';
import { getUserCryptoRepository } from '@/lib/crypto';
import { setSessionDek } from '@/lib/crypto/sessionKeys';
import { decodeDek } from '@/lib/crypto/transport';
import { rateLimit, UNLOCK } from '@/lib/rate-limit';
import { NextResponse, type NextRequest } from 'next/server';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const user = await requireUser();

  const limit = rateLimit(UNLOCK, user.id);
  if (!limit.allowed) {
    const retryAfter = Math.ceil((limit.resetAt - Date.now()) / 1000);
    return NextResponse.json(
      { error: 'Too many unlock attempts. Please wait a moment.' },
      { status: 429, headers: { 'Retry-After': String(Math.max(1, retryAfter)) } }
    );
  }

  if (!(await getUserCryptoRepository().exists(user.id))) {
    return NextResponse.json(
      { error: 'Encryption is not set up for this account.' },
      { status: 409 }
    );
  }

  let dek: Buffer;
  try {
    const body = (await req.json()) as { dek?: unknown };
    dek = decodeDek(body?.dek);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Bad request' },
      { status: 400 }
    );
  }

  setSessionDek(user.id, dek);
  return new NextResponse(null, { status: 204 });
}
```

```ts
// app/api/crypto/lock/route.ts
import { requireUser } from '@/lib/auth/require-user';
import { dropSessionDek } from '@/lib/crypto/sessionKeys';
import { NextResponse } from 'next/server';

export async function POST(): Promise<NextResponse> {
  const user = await requireUser();
  dropSessionDek(user.id);
  return new NextResponse(null, { status: 204 });
}
```

- [ ] **Step 7: Write the route test (mocked auth + repo)**

```ts
// app/api/crypto/unlock/route.test.ts
import { randomBytes } from 'crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetSessionKeysForTest,
  hasSessionDek,
} from '@/lib/crypto/sessionKeys';

const existsMock = vi.fn();

vi.mock('@/lib/auth/require-user', () => ({
  requireUser: vi.fn(async () => ({ id: 'alice' })),
}));
vi.mock('@/lib/crypto', () => ({
  getUserCryptoRepository: () => ({ exists: existsMock }),
}));

import { POST } from './route';

const req = (body: unknown) =>
  new Request('http://localhost/api/crypto/unlock', {
    method: 'POST',
    body: JSON.stringify(body),
  }) as unknown as Parameters<typeof POST>[0];

beforeEach(() => {
  existsMock.mockResolvedValue(true);
});
afterEach(() => {
  __resetSessionKeysForTest();
  vi.clearAllMocks();
});

describe('POST /api/crypto/unlock', () => {
  it('stores the DEK and returns 204', async () => {
    const dek = randomBytes(32).toString('base64');
    const res = await POST(req({ dek }));
    expect(res.status).toBe(204);
    expect(hasSessionDek('alice')).toBe(true);
  });

  it('returns 409 when encryption is not set up', async () => {
    existsMock.mockResolvedValue(false);
    const res = await POST(req({ dek: randomBytes(32).toString('base64') }));
    expect(res.status).toBe(409);
    expect(hasSessionDek('alice')).toBe(false);
  });

  it('returns 400 on a malformed DEK', async () => {
    const res = await POST(req({ dek: 'too-short' }));
    expect(res.status).toBe(400);
    expect(hasSessionDek('alice')).toBe(false);
  });
});
```

- [ ] **Step 8: Run the route test**

Run: `pnpm test app/api/crypto/unlock/route.test.ts`
Expected: PASS (3 tests). (If `rateLimit` interferes across the 3 calls, note `UNLOCK.max = 10` per 60s window keyed by `'alice'` — 3 calls stay well under the cap.)

- [ ] **Step 9: Full suite, type-check, commit**

```bash
pnpm test
pnpm type-check
git add lib/crypto/transport.ts lib/crypto/transport.test.ts lib/rate-limit/limits.ts \
  app/api/crypto/unlock/route.ts app/api/crypto/unlock/route.test.ts \
  app/api/crypto/lock/route.ts
git commit -m "feat(crypto): /api/crypto/unlock + /lock routes (store/drop session DEK)"
```

---

## Out of scope for P1 (handled in later plans)

- **Onboarding wizard, per-session unlock screen, Lock button, journal migration** → P2.
- **Settings → Security (change passphrase, recovery, reset)** → P3.
- **Passkey-PRF unlock** → fast-follow.
- **`requireUnlocked(userId)` action guard** (refuse mutations when an encryption-enabled user is locked, esp. the no-read import path) → P2, layered in the server-action/route tier (not the seam). The seam already hard-blocks read-first flows via `LockedError` on decrypt.
- **Drop DEK on better-auth sign-out** → P2 (hook the sign-out callback to `dropSessionDek`). P1 covers explicit Lock + process restart.

---

## Self-Review

**Spec coverage (P1 slice of `2026-06-25-encrypted-journals-v2-design.md`):**
- Per-file AES-256-GCM, `HKDF(DEK, path)` subkey, path+magic AAD, `[LEJ1][ver][nonce][ct][tag]` layout → Task 1. ✓
- In-RAM `Map<userId, DEK>` session-key store + `LockedError` → Task 2. ✓
- `userCrypto` table (wraps/salts/argonParams/kdfVersion) + repo → Task 3. ✓
- Encryption at the push/pull seam; `runLedger`/repository untouched; manifest excluded → Task 4. ✓
- `/api/crypto/unlock` (+ `/lock`) storing the raw DEK over TLS → Task 5. ✓
- Magic-prefix detection for mixed plaintext/ciphertext (migration-safe reads) → Task 1 `isCiphertext` + Task 4 passthrough. ✓
- Feature inert until a DEK is set (no UI yet) → seam is DEK-driven; not-enabled path = passthrough (Task 4 test 2). ✓

**Placeholder scan:** none — every step ships real code/commands.

**Type consistency:** `encryptFile`/`decryptFile`/`isCiphertext` (Task 1) consumed verbatim by Task 4; `getSessionDek`/`setSessionDek`/`dropSessionDek`/`LockedError`/`__resetSessionKeysForTest` (Task 2) consumed by Tasks 4–5 and tests; `getUserCryptoRepository().exists` (Task 3) consumed by Task 5; `decodeDek` (Task 5) names match. `DbInstance` imported from `@/lib/db/connection`, `db` from `@/lib/db`, `setupTestDb`/`teardownTestDb`/`insertUser` from `@/lib/test-utils/db` — all per the codebase conventions. ✓
