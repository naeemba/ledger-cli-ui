# Encrypted journals — passkey (PRF) unlock — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user's existing login passkey also unlock their encrypted journal, via the WebAuthn PRF extension — additive to the passphrase and recovery-code paths, supporting multiple passkeys.

**Architecture:** A passkey carries an *additional opaque wrap* of the same per-user DEK, derived from the authenticator's PRF output (PRF → HKDF-SHA256 → AES-GCM KEK). Wraps live in a new one-to-many `cryptoPasskeyWrap` table. Unlock needs no server-side assertion verification: the assertion uses a random challenge and the DEK either unwraps client-side or it doesn't. The DEK never changes; passphrase/recovery wraps are untouched.

**Tech Stack:** Next.js 16 (App Router), TypeScript, Drizzle ORM + Postgres, `@better-auth/passkey`, WebCrypto + `hash-wasm` (existing), Vitest. Spec: `docs/superpowers/specs/2026-06-25-encrypted-journals-passkey-unlock-design.md`.

## Global Constraints

- **Zero-knowledge:** the server stores only opaque base64 wraps + salts; it never sees the DEK except in session RAM (posted to `/api/crypto/unlock`). New code must not log or persist plaintext DEK or PRF output.
- **DEK never changes:** passkey enable/disable only adds/removes a wrap; it never re-encrypts the journal.
- **Proof-before-mutation:** enabling a passkey requires the user to first prove with passphrase or recovery (re-deriving the DEK via the existing `obtainDek`).
- **No "last method" guard needed:** passphrase + recovery always exist, so a passkey is never the only way in.
- **KEK info string:** `"ledger-passkey-v1"` (HKDF `info`), empty HKDF salt — mirrors the recovery path (`"ledger-recovery-v1"`).
- **PRF salt:** 32 random bytes per credential, stored standard-base64.
- **Credential IDs** are WebAuthn base64url strings (charset `A-Za-z0-9_-`), as stored by better-auth.
- Follow the repository + service + one-action-per-file conventions already in the codebase.
- Run `pnpm test`, `pnpm type-check`, and `pnpm lint` before each commit; all must pass.

---

### Task 1: Enable the PRF extension at passkey registration

**Files:**
- Modify: `lib/auth.ts:9-13`

**Interfaces:**
- Produces: passkeys registered from now on are PRF/hmac-secret capable (no runtime export).

- [ ] **Step 1: Add the registration extension**

Edit `lib/auth.ts` so the passkey plugin requests PRF at credential creation:

```ts
export const auth = await createAuth({
  passkey: { rpName: APP_NAME, registration: { extensions: { prf: {} } } },
  transport: postalTransport,
  ...(googleConfigured && { google: {} }),
});
```

- [ ] **Step 2: Type-check**

Run: `pnpm type-check`
Expected: PASS. If `createAuth`'s `passkey` option type rejects `registration`, the starter (`@naeemba/next-starter`) does not forward it — note this in the commit body and the live-acceptance checklist; the forwarding fix is a one-line change in the starter (user owns it). Do **not** block the rest of the plan on it — the automated tests below don't depend on real PRF.

- [ ] **Step 3: Commit**

```bash
git add lib/auth.ts
git commit -m "feat(crypto): request PRF extension at passkey registration"
```

---

### Task 2: `cryptoPasskeyWrap` schema + migration

**Files:**
- Create: `db/schema/cryptoPasskeyWrap.ts`
- Modify: `db/schema/index.ts`
- Create (generated): `db/migrations/0005_*.sql`

**Interfaces:**
- Produces: table `cryptoPasskeyWrap`; types `CryptoPasskeyWrap`, `NewCryptoPasskeyWrap`.

- [ ] **Step 1: Write the schema file**

Create `db/schema/cryptoPasskeyWrap.ts`:

```ts
import { sql } from 'drizzle-orm';
import { user } from '@naeemba/next-starter/schema';
import { pgTable, text, timestamp, unique } from 'drizzle-orm/pg-core';

// One row per (user, passkey) that can unlock the journal. The DEK is wrapped
// by a key derived from that passkey's PRF output. credentialId mirrors the
// better-auth passkey credentialID (base64url); it is NOT a foreign key because
// better-auth's credentialID column is indexed, not unique. Orphan rows (passkey
// later deleted) are harmless — they can never assert — and the Settings UI hides
// them by cross-referencing the live passkey list.
export const cryptoPasskeyWrap = pgTable(
  'cryptoPasskeyWrap',
  {
    id: text('id').primaryKey(), // ULID
    userId: text('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    credentialId: text('credentialId').notNull(),
    prfSalt: text('prfSalt').notNull(), // base64, 32 bytes
    wrap: text('wrap').notNull(), // opaque base64; DEK wrapped by the PRF-derived KEK
    label: text('label').notNull(), // mirrors the passkey name, for the UI
    createdAt: timestamp('createdAt').notNull().default(sql`now()`),
  },
  (t) => [unique('cryptoPasskeyWrap_user_cred').on(t.userId, t.credentialId)]
);

export type CryptoPasskeyWrap = typeof cryptoPasskeyWrap.$inferSelect;
export type NewCryptoPasskeyWrap = typeof cryptoPasskeyWrap.$inferInsert;
```

- [ ] **Step 2: Export from the schema barrel**

Add to `db/schema/index.ts` (keep alphabetical-ish ordering near the other crypto export):

```ts
export {
  cryptoPasskeyWrap,
  type CryptoPasskeyWrap,
  type NewCryptoPasskeyWrap,
} from './cryptoPasskeyWrap';
```

- [ ] **Step 3: Generate the migration**

Run: `pnpm db:generate`
Expected: a new file `db/migrations/0005_*.sql` creating the `cryptoPasskeyWrap` table with the unique constraint. Inspect it to confirm the table, FK on `userId`, and the `(userId, credentialId)` unique index.

- [ ] **Step 4: Type-check**

Run: `pnpm type-check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add db/schema/cryptoPasskeyWrap.ts db/schema/index.ts db/migrations/
git commit -m "feat(crypto): cryptoPasskeyWrap table + migration 0005"
```

---

### Task 3: `PasskeyWrapRepository`

**Files:**
- Create: `lib/crypto/passkeyWrapRepository.ts`
- Create: `lib/crypto/passkeyWrapRepository.test.ts`
- Modify: `lib/crypto/index.ts`

**Interfaces:**
- Consumes: `cryptoPasskeyWrap`, `CryptoPasskeyWrap`, `NewCryptoPasskeyWrap` (Task 2); `DbInstance` from `@/lib/db/connection`.
- Produces:
  - `class PasskeyWrapRepository { listByUser(userId: string): Promise<CryptoPasskeyWrap[]>; create(input: NewCryptoPasskeyWrap): Promise<void>; deleteByCredential(userId: string, credentialId: string): Promise<void>; }`
  - `getPasskeyWrapRepository(): PasskeyWrapRepository` from `@/lib/crypto`.

- [ ] **Step 1: Write the failing test**

Create `lib/crypto/passkeyWrapRepository.test.ts` (mirrors `userCryptoRepository.test.ts`'s harness):

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PasskeyWrapRepository } from './passkeyWrapRepository';
import {
  setupTestDb,
  teardownTestDb,
  type TestDbContext,
} from '@/lib/test-utils/db';

describe('PasskeyWrapRepository', () => {
  let ctx: TestDbContext;
  let repo: PasskeyWrapRepository;

  beforeEach(async () => {
    ctx = await setupTestDb('passkey-wrap-');
    await ctx.insertUser('alice');
    repo = new PasskeyWrapRepository(ctx.db);
  });

  afterEach(async () => {
    await teardownTestDb(ctx);
  });

  const row = (over: Partial<Parameters<PasskeyWrapRepository['create']>[0]> = {}) => ({
    id: 'wrap-1',
    userId: 'alice',
    credentialId: 'cred-A',
    prfSalt: 'c2FsdA==',
    wrap: 'd3JhcA==',
    label: 'Laptop',
    ...over,
  });

  it('create → listByUser round-trips', async () => {
    expect(await repo.listByUser('alice')).toEqual([]);
    await repo.create(row());
    const all = await repo.listByUser('alice');
    expect(all).toHaveLength(1);
    expect(all[0].credentialId).toBe('cred-A');
    expect(all[0].label).toBe('Laptop');
  });

  it('supports multiple passkeys per user', async () => {
    await repo.create(row({ id: 'wrap-1', credentialId: 'cred-A' }));
    await repo.create(row({ id: 'wrap-2', credentialId: 'cred-B', label: 'Phone' }));
    expect(await repo.listByUser('alice')).toHaveLength(2);
  });

  it('create is idempotent per (user, credential) — re-enable updates the wrap', async () => {
    await repo.create(row({ id: 'wrap-1', credentialId: 'cred-A', wrap: 'old==' }));
    await repo.create(row({ id: 'wrap-2', credentialId: 'cred-A', wrap: 'new==', prfSalt: 's2==' }));
    const all = await repo.listByUser('alice');
    expect(all).toHaveLength(1);
    expect(all[0].wrap).toBe('new==');
    expect(all[0].prfSalt).toBe('s2==');
  });

  it('deleteByCredential removes only the matching row', async () => {
    await repo.create(row({ id: 'wrap-1', credentialId: 'cred-A' }));
    await repo.create(row({ id: 'wrap-2', credentialId: 'cred-B' }));
    await repo.deleteByCredential('alice', 'cred-A');
    const all = await repo.listByUser('alice');
    expect(all).toHaveLength(1);
    expect(all[0].credentialId).toBe('cred-B');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test lib/crypto/passkeyWrapRepository.test.ts`
Expected: FAIL — cannot find module `./passkeyWrapRepository`.

- [ ] **Step 3: Write the repository**

Create `lib/crypto/passkeyWrapRepository.ts`:

```ts
import { and, eq } from 'drizzle-orm';
import {
  cryptoPasskeyWrap,
  type CryptoPasskeyWrap,
  type NewCryptoPasskeyWrap,
} from '@/db/schema';
import type { DbInstance } from '@/lib/db/connection';

export class PasskeyWrapRepository {
  constructor(private readonly db: DbInstance) {}

  async listByUser(userId: string): Promise<CryptoPasskeyWrap[]> {
    return this.db
      .select()
      .from(cryptoPasskeyWrap)
      .where(eq(cryptoPasskeyWrap.userId, userId));
  }

  /** Insert a wrap, or replace it if this (user, credential) already has one. */
  async create(input: NewCryptoPasskeyWrap): Promise<void> {
    await this.db
      .insert(cryptoPasskeyWrap)
      .values(input)
      .onConflictDoUpdate({
        target: [cryptoPasskeyWrap.userId, cryptoPasskeyWrap.credentialId],
        set: { prfSalt: input.prfSalt, wrap: input.wrap, label: input.label },
      });
  }

  async deleteByCredential(userId: string, credentialId: string): Promise<void> {
    await this.db
      .delete(cryptoPasskeyWrap)
      .where(
        and(
          eq(cryptoPasskeyWrap.userId, userId),
          eq(cryptoPasskeyWrap.credentialId, credentialId)
        )
      );
  }
}
```

- [ ] **Step 4: Add the lazy getter to the crypto barrel**

Edit `lib/crypto/index.ts` to add (alongside the existing `getUserCryptoRepository`):

```ts
import { PasskeyWrapRepository } from './passkeyWrapRepository';

let passkeyWrapRepo: PasskeyWrapRepository | null = null;

export const getPasskeyWrapRepository = (): PasskeyWrapRepository =>
  (passkeyWrapRepo ??= new PasskeyWrapRepository(db));

export { PasskeyWrapRepository } from './passkeyWrapRepository';
```

(`db` is already imported in that file.)

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm test lib/crypto/passkeyWrapRepository.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add lib/crypto/passkeyWrapRepository.ts lib/crypto/passkeyWrapRepository.test.ts lib/crypto/index.ts
git commit -m "feat(crypto): PasskeyWrapRepository (list/create/delete)"
```

---

### Task 4: `derivePrfKek` client helper

**Files:**
- Modify: `features/crypto/lib/clientCrypto.ts`
- Modify: `features/crypto/lib/clientCrypto.test.ts`

**Interfaces:**
- Consumes: WebCrypto (`crypto.subtle`).
- Produces: `derivePrfKek(prfOutput: Uint8Array): Promise<CryptoKey>` — AES-GCM-256 key usable by the existing `wrapDek`/`unwrapDek`.

- [ ] **Step 1: Write the failing test**

Add to `features/crypto/lib/clientCrypto.test.ts`:

```ts
import { derivePrfKek, wrapDek, unwrapDek } from './clientCrypto';

describe('derivePrfKek', () => {
  it('round-trips a DEK wrap and is deterministic for the same PRF output', async () => {
    const prf = crypto.getRandomValues(new Uint8Array(32));
    const dek = crypto.getRandomValues(new Uint8Array(32));
    const kek = await derivePrfKek(prf);
    const wrapped = await wrapDek(dek, kek);
    const kek2 = await derivePrfKek(prf); // same PRF → same key
    const back = await unwrapDek(wrapped, kek2);
    expect(Array.from(back)).toEqual(Array.from(dek));
  });

  it('a different PRF output cannot unwrap', async () => {
    const dek = crypto.getRandomValues(new Uint8Array(32));
    const wrapped = await wrapDek(dek, await derivePrfKek(crypto.getRandomValues(new Uint8Array(32))));
    await expect(
      unwrapDek(wrapped, await derivePrfKek(crypto.getRandomValues(new Uint8Array(32))))
    ).rejects.toBeTruthy();
  });
});
```

(If `clientCrypto.test.ts` already imports some of these names, merge imports rather than duplicating.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test features/crypto/lib/clientCrypto.test.ts`
Expected: FAIL — `derivePrfKek` is not exported.

- [ ] **Step 3: Implement `derivePrfKek`**

Add to `features/crypto/lib/clientCrypto.ts` (next to `recoveryHkdfKey`):

```ts
const PASSKEY_INFO = new TextEncoder().encode('ledger-passkey-v1');

/** Derive an AES-GCM KEK from a passkey's PRF output (HKDF, empty salt). */
export const derivePrfKek = async (
  prfOutput: Uint8Array
): Promise<CryptoKey> => {
  const base = await crypto.subtle.importKey(
    'raw',
    new Uint8Array(prfOutput) as Uint8Array<ArrayBuffer>,
    'HKDF',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(0) as Uint8Array<ArrayBuffer>,
      info: PASSKEY_INFO,
    },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test features/crypto/lib/clientCrypto.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add features/crypto/lib/clientCrypto.ts features/crypto/lib/clientCrypto.test.ts
git commit -m "feat(crypto): derivePrfKek (PRF → HKDF → AES-GCM KEK)"
```

---

### Task 5: WebAuthn PRF assertion helpers

**Files:**
- Create: `features/crypto/lib/webauthn.ts`
- Create: `features/crypto/lib/webauthn.test.ts`

**Interfaces:**
- Consumes: `fromBase64` from `./clientCrypto`; `navigator.credentials`.
- Produces:
  - `base64urlToBytes(s: string): Uint8Array`, `bytesToBase64url(b: Uint8Array): string`
  - `type PrfAssertion = { credentialId: string; prfOutput: Uint8Array }`
  - `assertPrfForCredential(credentialId: string, salt: Uint8Array): Promise<PrfAssertion>` (enable flow, single credential)
  - `assertPrfAny(creds: { credentialId: string; prfSalt: string }[]): Promise<PrfAssertion>` (unlock flow, multiple credentials)

- [ ] **Step 1: Write the failing test**

Create `features/crypto/lib/webauthn.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  base64urlToBytes,
  bytesToBase64url,
  assertPrfForCredential,
  assertPrfAny,
} from './webauthn';

// Minimal fake of a PublicKeyCredential carrying a PRF result.
const fakeCred = (id: string, first: ArrayBuffer | undefined) => ({
  id,
  getClientExtensionResults: () => (first ? { prf: { results: { first } } } : {}),
});

const stubGet = (impl: (opts: CredentialRequestOptions) => unknown) => {
  // @ts-expect-error — jsdom has no navigator.credentials; install a stub.
  globalThis.navigator = { credentials: { get: vi.fn(impl) } };
};

afterEach(() => vi.restoreAllMocks());

describe('base64url helpers', () => {
  it('round-trips bytes', () => {
    const b = new Uint8Array([0, 1, 2, 250, 255]);
    expect(Array.from(base64urlToBytes(bytesToBase64url(b)))).toEqual(Array.from(b));
  });
});

describe('assertPrfForCredential', () => {
  it('returns the PRF output for the credential', async () => {
    const out = new Uint8Array(32).fill(7).buffer;
    stubGet(() => fakeCred('cred-A', out));
    const res = await assertPrfForCredential('cred-A', new Uint8Array(32));
    expect(res.credentialId).toBe('cred-A');
    expect(res.prfOutput).toHaveLength(32);
  });

  it('throws a clear error when PRF is unsupported', async () => {
    stubGet(() => fakeCred('cred-A', undefined));
    await expect(
      assertPrfForCredential('cred-A', new Uint8Array(32))
    ).rejects.toThrow(/does not support/i);
  });

  it('throws when the prompt is dismissed (null credential)', async () => {
    stubGet(() => null);
    await expect(
      assertPrfForCredential('cred-A', new Uint8Array(32))
    ).rejects.toThrow(/dismissed/i);
  });
});

describe('assertPrfAny', () => {
  it('identifies which credential answered and returns its PRF output', async () => {
    const out = new Uint8Array(32).fill(9).buffer;
    stubGet(() => fakeCred('cred-B', out));
    const res = await assertPrfAny([
      { credentialId: 'cred-A', prfSalt: 'c2FsdEE=' },
      { credentialId: 'cred-B', prfSalt: 'c2FsdEI=' },
    ]);
    expect(res.credentialId).toBe('cred-B');
    expect(res.prfOutput).toHaveLength(32);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test features/crypto/lib/webauthn.test.ts`
Expected: FAIL — cannot find module `./webauthn`.

- [ ] **Step 3: Implement the helpers**

Create `features/crypto/lib/webauthn.ts`:

```ts
import { fromBase64 } from './clientCrypto';

export const base64urlToBytes = (s: string): Uint8Array => {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const b64 = (s + pad).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
};

export const bytesToBase64url = (b: Uint8Array): string =>
  btoa(String.fromCharCode(...b))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

export type PrfAssertion = { credentialId: string; prfOutput: Uint8Array };

const readPrf = (cred: PublicKeyCredential): Uint8Array => {
  const first = cred.getClientExtensionResults().prf?.results?.first;
  if (!first) throw new Error('This device does not support passkey unlock.');
  return new Uint8Array(first as ArrayBuffer);
};

/** Single-credential PRF assertion — used when enabling a specific passkey. */
export const assertPrfForCredential = async (
  credentialId: string,
  salt: Uint8Array
): Promise<PrfAssertion> => {
  const cred = (await navigator.credentials.get({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      allowCredentials: [
        { id: base64urlToBytes(credentialId), type: 'public-key' },
      ],
      userVerification: 'required',
      extensions: { prf: { eval: { first: salt } } },
    },
  })) as PublicKeyCredential | null;
  if (!cred) throw new Error('Passkey prompt was dismissed.');
  return { credentialId, prfOutput: readPrf(cred) };
};

/** Multi-credential PRF assertion — used at unlock; the user picks any enrolled passkey. */
export const assertPrfAny = async (
  creds: { credentialId: string; prfSalt: string }[]
): Promise<PrfAssertion> => {
  const evalByCredential: Record<string, { first: BufferSource }> = {};
  for (const c of creds) {
    evalByCredential[c.credentialId] = { first: fromBase64(c.prfSalt) };
  }
  const cred = (await navigator.credentials.get({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      allowCredentials: creds.map((c) => ({
        id: base64urlToBytes(c.credentialId),
        type: 'public-key' as const,
      })),
      userVerification: 'required',
      extensions: { prf: { evalByCredential } },
    },
  })) as PublicKeyCredential | null;
  if (!cred) throw new Error('Passkey prompt was dismissed.');
  return { credentialId: cred.id, prfOutput: readPrf(cred) };
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test features/crypto/lib/webauthn.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add features/crypto/lib/webauthn.ts features/crypto/lib/webauthn.test.ts
git commit -m "feat(crypto): WebAuthn PRF assertion helpers (enable + unlock)"
```

---

### Task 6: Extend the material contract + endpoint; add zod schemas

**Files:**
- Modify: `lib/crypto/setupSchema.ts`
- Modify: `app/api/crypto/material/route.ts`
- Modify: `app/api/crypto/material/route.test.ts`
- Create: `lib/crypto/passkeyWrapSchema.ts`

**Interfaces:**
- Consumes: `getPasskeyWrapRepository` (Task 3).
- Produces:
  - `type PasskeyMaterial = { credentialId: string; prfSalt: string; wrap: string }`
  - `CryptoMaterial` now includes `passkeys: PasskeyMaterial[]`
  - `enablePasskeyUnlockSchema`, `disablePasskeyUnlockSchema` (zod)

- [ ] **Step 1: Extend `CryptoMaterial`**

Edit `lib/crypto/setupSchema.ts`, replacing the `CryptoMaterial` type block:

```ts
export type PasskeyMaterial = {
  credentialId: string;
  prfSalt: string;
  wrap: string;
};

// Wrapped key-material the server hands back to the client (GET /api/crypto/material).
// Opaque blobs only; the server never unwraps them. `passkeys` is the list of
// enrolled passkey wraps (empty when none).
export type CryptoMaterial = Pick<
  SetupCryptoInput,
  'passSalt' | 'argonParams' | 'wrapPassphrase' | 'wrapRecovery'
> & {
  passkeys: PasskeyMaterial[];
};
```

- [ ] **Step 2: Update the material route test**

Edit `app/api/crypto/material/route.test.ts` to assert `passkeys` is present. Add an expectation to the existing "returns material" test (adapt to the file's existing mocking style):

```ts
// after the existing assertions on passSalt / wraps:
expect(body.passkeys).toEqual([]); // none enrolled by default
```

If the test mocks `getUserCryptoRepository`, also mock `getPasskeyWrapRepository` to return `{ listByUser: async () => [] }`.

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm test app/api/crypto/material/route.test.ts`
Expected: FAIL — `passkeys` is undefined / mock missing.

- [ ] **Step 4: Update the material route**

Edit `app/api/crypto/material/route.ts`:

```ts
import { requireUser } from '@/lib/auth/require-user';
import {
  getPasskeyWrapRepository,
  getUserCryptoRepository,
} from '@/lib/crypto';
import type { CryptoMaterial } from '@/lib/crypto/setupSchema';
import { NextResponse } from 'next/server';

export async function GET(): Promise<NextResponse> {
  const user = await requireUser();
  const row = await getUserCryptoRepository().get(user.id);
  if (!row) {
    return NextResponse.json(
      { error: 'Encryption is not set up.' },
      { status: 404 }
    );
  }
  const wraps = await getPasskeyWrapRepository().listByUser(user.id);
  // All blobs are opaque without the user's secret.
  const material: CryptoMaterial = {
    passSalt: row.passSalt,
    argonParams: row.argonParams,
    wrapPassphrase: row.wrapPassphrase,
    wrapRecovery: row.wrapRecovery,
    passkeys: wraps.map((w) => ({
      credentialId: w.credentialId,
      prfSalt: w.prfSalt,
      wrap: w.wrap,
    })),
  };
  return NextResponse.json(material);
}
```

- [ ] **Step 5: Write the zod schemas**

Create `lib/crypto/passkeyWrapSchema.ts`:

```ts
import { z } from 'zod';

const b64 = z
  .string()
  .regex(/^[A-Za-z0-9+/]+={0,2}$/)
  .min(1)
  .max(512);

// WebAuthn credential id: base64url charset.
const b64url = z
  .string()
  .regex(/^[A-Za-z0-9_-]+={0,2}$/)
  .min(1)
  .max(512);

export const enablePasskeyUnlockSchema = z.object({
  credentialId: b64url,
  prfSalt: b64,
  wrap: b64,
  label: z.string().min(1).max(100),
});

export const disablePasskeyUnlockSchema = z.object({
  credentialId: b64url,
});
```

- [ ] **Step 6: Run tests + type-check**

Run: `pnpm test app/api/crypto/material/route.test.ts && pnpm type-check`
Expected: PASS. (Type-check confirms `SetupWizard`/unlock code that builds `CryptoMaterial`-shaped objects still compiles; `getMaterial` consumers now see `passkeys`.)

- [ ] **Step 7: Commit**

```bash
git add lib/crypto/setupSchema.ts app/api/crypto/material/route.ts app/api/crypto/material/route.test.ts lib/crypto/passkeyWrapSchema.ts
git commit -m "feat(crypto): expose passkey wraps in material + enable/disable schemas"
```

---

### Task 7: Server actions — enable / disable passkey unlock

**Files:**
- Create: `features/crypto/actions/enablePasskeyUnlock.ts`
- Create: `features/crypto/actions/disablePasskeyUnlock.ts`
- Create: `features/crypto/actions/passkeyUnlock.test.ts`

**Interfaces:**
- Consumes: `enablePasskeyUnlockSchema`, `disablePasskeyUnlockSchema` (Task 6); `getUserCryptoRepository`, `getPasskeyWrapRepository`; `rateLimit, WRITE, RATE_LIMIT_MESSAGE`; `ulid`.
- Produces:
  - `enablePasskeyUnlockAction(input: unknown): Promise<{ ok: true } | { ok: false; message: string }>`
  - `disablePasskeyUnlockAction(input: unknown): Promise<{ ok: true } | { ok: false; message: string }>`

- [ ] **Step 1: Write the failing test**

Create `features/crypto/actions/passkeyUnlock.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const exists = vi.fn();
const create = vi.fn();
const deleteByCredential = vi.fn();
const allowed = vi.fn(() => ({ allowed: true }));

vi.mock('@/lib/auth/require-user', () => ({
  requireUser: async () => ({ id: 'alice' }),
}));
vi.mock('@/lib/crypto', () => ({
  getUserCryptoRepository: () => ({ exists }),
  getPasskeyWrapRepository: () => ({ create, deleteByCredential }),
}));
vi.mock('@/lib/rate-limit', () => ({
  rateLimit: () => allowed(),
  WRITE: { name: 'write' },
  RATE_LIMIT_MESSAGE: 'slow down',
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { enablePasskeyUnlockAction } from './enablePasskeyUnlock';
import { disablePasskeyUnlockAction } from './disablePasskeyUnlock';

const validEnable = {
  credentialId: 'cred-A',
  prfSalt: 'c2FsdA==',
  wrap: 'd3JhcA==',
  label: 'Laptop',
};

beforeEach(() => {
  vi.clearAllMocks();
  exists.mockResolvedValue(true);
  allowed.mockReturnValue({ allowed: true });
});

describe('enablePasskeyUnlockAction', () => {
  it('creates a wrap for a valid request', async () => {
    const res = await enablePasskeyUnlockAction(validEnable);
    expect(res).toEqual({ ok: true });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'alice', credentialId: 'cred-A', label: 'Laptop' })
    );
  });

  it('rejects when encryption is not set up', async () => {
    exists.mockResolvedValue(false);
    expect(await enablePasskeyUnlockAction(validEnable)).toMatchObject({ ok: false });
    expect(create).not.toHaveBeenCalled();
  });

  it('rejects invalid input', async () => {
    expect(await enablePasskeyUnlockAction({ credentialId: '' })).toMatchObject({ ok: false });
  });

  it('rejects when rate-limited', async () => {
    allowed.mockReturnValue({ allowed: false });
    expect(await enablePasskeyUnlockAction(validEnable)).toEqual({ ok: false, message: 'slow down' });
  });
});

describe('disablePasskeyUnlockAction', () => {
  it('deletes the wrap', async () => {
    const res = await disablePasskeyUnlockAction({ credentialId: 'cred-A' });
    expect(res).toEqual({ ok: true });
    expect(deleteByCredential).toHaveBeenCalledWith('alice', 'cred-A');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test features/crypto/actions/passkeyUnlock.test.ts`
Expected: FAIL — action modules do not exist.

- [ ] **Step 3: Write `enablePasskeyUnlock.ts`**

```ts
'use server';
import { requireUser } from '@/lib/auth/require-user';
import {
  getPasskeyWrapRepository,
  getUserCryptoRepository,
} from '@/lib/crypto';
import { enablePasskeyUnlockSchema } from '@/lib/crypto/passkeyWrapSchema';
import { rateLimit, WRITE, RATE_LIMIT_MESSAGE } from '@/lib/rate-limit';
import { ulid } from 'ulid';
import { revalidatePath } from 'next/cache';

type Result = { ok: true } | { ok: false; message: string };

export async function enablePasskeyUnlockAction(
  input: unknown
): Promise<Result> {
  const user = await requireUser();
  if (!rateLimit(WRITE, user.id).allowed)
    return { ok: false, message: RATE_LIMIT_MESSAGE };
  const parsed = enablePasskeyUnlockSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: 'Invalid request.' };
  if (!(await getUserCryptoRepository().exists(user.id)))
    return { ok: false, message: 'Encryption is not set up.' };
  await getPasskeyWrapRepository().create({
    id: ulid(),
    userId: user.id,
    credentialId: parsed.data.credentialId,
    prfSalt: parsed.data.prfSalt,
    wrap: parsed.data.wrap,
    label: parsed.data.label,
  });
  revalidatePath('/', 'layout');
  return { ok: true };
}
```

- [ ] **Step 4: Write `disablePasskeyUnlock.ts`**

```ts
'use server';
import { requireUser } from '@/lib/auth/require-user';
import { getPasskeyWrapRepository } from '@/lib/crypto';
import { disablePasskeyUnlockSchema } from '@/lib/crypto/passkeyWrapSchema';
import { rateLimit, WRITE, RATE_LIMIT_MESSAGE } from '@/lib/rate-limit';
import { revalidatePath } from 'next/cache';

type Result = { ok: true } | { ok: false; message: string };

export async function disablePasskeyUnlockAction(
  input: unknown
): Promise<Result> {
  const user = await requireUser();
  if (!rateLimit(WRITE, user.id).allowed)
    return { ok: false, message: RATE_LIMIT_MESSAGE };
  const parsed = disablePasskeyUnlockSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: 'Invalid request.' };
  await getPasskeyWrapRepository().deleteByCredential(
    user.id,
    parsed.data.credentialId
  );
  revalidatePath('/', 'layout');
  return { ok: true };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm test features/crypto/actions/passkeyUnlock.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add features/crypto/actions/enablePasskeyUnlock.ts features/crypto/actions/disablePasskeyUnlock.ts features/crypto/actions/passkeyUnlock.test.ts
git commit -m "feat(crypto): enable/disable passkey unlock server actions"
```

---

### Task 8: Client flows — build-wrap (enable) and unlock-with-passkey

**Files:**
- Create: `features/crypto/lib/passkeyFlow.ts`
- Create: `features/crypto/lib/passkeyFlow.test.ts`

**Interfaces:**
- Consumes: `derivePrfKek`, `wrapDek`, `unwrapDek`, `toBase64` (clientCrypto); `assertPrfForCredential`, `assertPrfAny` (webauthn); `getMaterial` (cryptoMaterial); `postDek` (unlockFlow).
- Produces:
  - `type EnablePasskeyInput = { credentialId: string; prfSalt: string; wrap: string; label: string }`
  - `buildPasskeyWrap(dek: Uint8Array, credentialId: string, label: string): Promise<EnablePasskeyInput>`
  - `unlockWithPasskey(): Promise<void>`

- [ ] **Step 1: Write the failing test**

Create `features/crypto/lib/passkeyFlow.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  generateDek,
  derivePrfKek,
  wrapDek,
  toBase64,
} from './clientCrypto';

const assertPrfForCredential = vi.fn();
const assertPrfAny = vi.fn();
const getMaterial = vi.fn();
const postDek = vi.fn();

vi.mock('./webauthn', () => ({ assertPrfForCredential, assertPrfAny }));
vi.mock('./cryptoMaterial', () => ({ getMaterial }));
vi.mock('./unlockFlow', () => ({ postDek }));

import { buildPasskeyWrap, unlockWithPasskey } from './passkeyFlow';

beforeEach(() => vi.clearAllMocks());

describe('buildPasskeyWrap', () => {
  it('asserts PRF and returns a wrap of the DEK', async () => {
    const prf = new Uint8Array(32).fill(3);
    assertPrfForCredential.mockResolvedValue({ credentialId: 'cred-A', prfOutput: prf });
    const dek = generateDek();
    const out = await buildPasskeyWrap(dek, 'cred-A', 'Laptop');
    expect(out.credentialId).toBe('cred-A');
    expect(out.label).toBe('Laptop');
    expect(out.prfSalt.length).toBeGreaterThan(0);
    expect(out.wrap.length).toBeGreaterThan(0);
  });
});

describe('unlockWithPasskey', () => {
  it('unwraps with the responding credential and posts the DEK', async () => {
    // Arrange: enroll cred-B with a known PRF output.
    const prf = new Uint8Array(32).fill(5);
    const dek = generateDek();
    const wrap = await wrapDek(dek, await derivePrfKek(prf));
    getMaterial.mockResolvedValue({
      passkeys: [
        { credentialId: 'cred-A', prfSalt: toBase64(new Uint8Array(32).fill(1)), wrap: 'x' },
        { credentialId: 'cred-B', prfSalt: toBase64(new Uint8Array(32).fill(2)), wrap },
      ],
    });
    assertPrfAny.mockResolvedValue({ credentialId: 'cred-B', prfOutput: prf });

    await unlockWithPasskey();

    expect(postDek).toHaveBeenCalledTimes(1);
    const posted = postDek.mock.calls[0][0] as Uint8Array;
    expect(Array.from(posted)).toEqual(Array.from(dek));
  });

  it('throws when no passkeys are enrolled', async () => {
    getMaterial.mockResolvedValue({ passkeys: [] });
    await expect(unlockWithPasskey()).rejects.toThrow(/no passkey/i);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test features/crypto/lib/passkeyFlow.test.ts`
Expected: FAIL — cannot find module `./passkeyFlow`.

- [ ] **Step 3: Implement the flows**

Create `features/crypto/lib/passkeyFlow.ts`:

```ts
import {
  derivePrfKek,
  fromBase64,
  toBase64,
  unwrapDek,
  wrapDek,
} from './clientCrypto';
import { getMaterial } from './cryptoMaterial';
import { postDek } from './unlockFlow';
import { assertPrfAny, assertPrfForCredential } from './webauthn';

export type EnablePasskeyInput = {
  credentialId: string;
  prfSalt: string;
  wrap: string;
  label: string;
};

/**
 * Build the wrap for a passkey. The caller must already hold the DEK (obtained
 * via obtainDek with a passphrase/recovery authorizer). Generates a fresh PRF
 * salt, asserts the passkey to read its PRF output, and wraps the DEK with the
 * derived KEK. The result is POSTed to enablePasskeyUnlockAction.
 */
export const buildPasskeyWrap = async (
  dek: Uint8Array,
  credentialId: string,
  label: string
): Promise<EnablePasskeyInput> => {
  const salt = crypto.getRandomValues(new Uint8Array(32));
  const { prfOutput } = await assertPrfForCredential(credentialId, salt);
  const wrap = await wrapDek(dek, await derivePrfKek(prfOutput));
  return { credentialId, prfSalt: toBase64(salt), wrap, label };
};

/** Unlock the session using any enrolled passkey. */
export const unlockWithPasskey = async (): Promise<void> => {
  const m = await getMaterial();
  if (!m.passkeys.length) throw new Error('No passkey is set up for unlock.');
  const { credentialId, prfOutput } = await assertPrfAny(
    m.passkeys.map((p) => ({ credentialId: p.credentialId, prfSalt: p.prfSalt }))
  );
  const match = m.passkeys.find((p) => p.credentialId === credentialId);
  if (!match) throw new Error('Passkey is not enrolled for unlock.');
  const dek = await unwrapDek(match.wrap, await derivePrfKek(prfOutput)).catch(
    () => {
      throw new Error('Passkey unlock failed.');
    }
  );
  await postDek(dek);
};
```

(Note: `fromBase64` is imported for parity with other flow files; remove it if lint flags it as unused.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test features/crypto/lib/passkeyFlow.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add features/crypto/lib/passkeyFlow.ts features/crypto/lib/passkeyFlow.test.ts
git commit -m "feat(crypto): client passkey enable + unlock flows"
```

---

### Task 9: Settings → Security — Passkey unlock card

**Files:**
- Create: `features/settings/PasskeyUnlockCard.tsx`
- Modify: `features/settings/SecuritySection.tsx`
- Modify: `features/settings/actions/index.ts` (re-export the two actions, matching the existing barrel pattern)

**Interfaces:**
- Consumes: `authClient.passkey.listUserPasskeys()`; `getMaterial`; `obtainDek` (rewrapFlow); `buildPasskeyWrap` (passkeyFlow); `enablePasskeyUnlockAction`, `disablePasskeyUnlockAction`.
- Produces: `<PasskeyUnlockCard />` default export.

- [ ] **Step 1: Re-export the actions from the settings barrel**

Add to `features/settings/actions/index.ts`:

```ts
export { enablePasskeyUnlockAction } from '@/features/crypto/actions/enablePasskeyUnlock';
export { disablePasskeyUnlockAction } from '@/features/crypto/actions/disablePasskeyUnlock';
```

(If the existing barrel re-exports crypto actions differently, follow that file's established style.)

- [ ] **Step 2: Write the card**

Create `features/settings/PasskeyUnlockCard.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  disablePasskeyUnlockAction,
  enablePasskeyUnlockAction,
} from './actions';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authClient } from '@/lib/auth-client';
import { getMaterial } from '@/features/crypto/lib/cryptoMaterial';
import { buildPasskeyWrap } from '@/features/crypto/lib/passkeyFlow';
import { obtainDek, type Authorizer } from '@/features/crypto/lib/rewrapFlow';

type Row = { credentialId: string; name: string; enabled: boolean };

const PasskeyUnlockCard = () => {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [useForgot, setUseForgot] = useState(false);
  const [secret, setSecret] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const [list, material] = await Promise.all([
        authClient.passkey.listUserPasskeys(),
        getMaterial(),
      ]);
      const enabled = new Set(material.passkeys.map((p) => p.credentialId));
      const passkeys = list.data ?? [];
      setRows(
        passkeys.map((p) => ({
          credentialId: p.credentialID,
          name: p.name ?? 'Passkey',
          enabled: enabled.has(p.credentialID),
        }))
      );
    } catch {
      setError('Could not load your passkeys.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function handleEnable(row: Row) {
    setError(null);
    if (!secret) {
      setError('Enter your passphrase or recovery code first.');
      return;
    }
    const authorizer: Authorizer = useForgot
      ? { kind: 'recovery', code: secret }
      : { kind: 'passphrase', passphrase: secret };
    setBusyId(row.credentialId);
    try {
      const dek = await obtainDek(authorizer);
      const input = await buildPasskeyWrap(dek, row.credentialId, row.name);
      const res = await enablePasskeyUnlockAction(input);
      if (!res.ok) {
        setError(res.message);
        return;
      }
      toast.success(`${row.name} can now unlock your journal.`);
      setSecret('');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not enable passkey unlock.');
    } finally {
      setBusyId(null);
    }
  }

  async function handleDisable(row: Row) {
    setError(null);
    setBusyId(row.credentialId);
    try {
      const res = await disablePasskeyUnlockAction({ credentialId: row.credentialId });
      if (!res.ok) {
        setError(res.message);
        return;
      }
      toast.success(`${row.name} can no longer unlock your journal.`);
      await refresh();
    } catch {
      setError('Could not disable passkey unlock.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Unlock with a passkey</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-muted-foreground text-sm">
          Let a passkey unlock your encrypted journal, alongside your passphrase
          and recovery code. Enabling a passkey requires your passphrase (or
          recovery code) to prove it&apos;s you.
        </p>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="passkey-secret">
              {useForgot ? 'Recovery code' : 'Current passphrase'}
            </Label>
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground text-xs underline-offset-2 transition-colors hover:underline"
              onClick={() => {
                setUseForgot((v) => !v);
                setSecret('');
                setError(null);
              }}
            >
              {useForgot ? 'Use passphrase instead' : 'Forgot? Use recovery code'}
            </button>
          </div>
          <Input
            id="passkey-secret"
            type={useForgot ? 'text' : 'password'}
            autoComplete={useForgot ? 'off' : 'current-password'}
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
          />
        </div>

        {loading ? (
          <p className="text-muted-foreground text-sm">Loading passkeys…</p>
        ) : rows.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            You have no passkeys yet. Add one under{' '}
            <a className="underline" href="/settings/passkeys">
              Passkeys
            </a>{' '}
            first.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {rows.map((row) => (
              <li
                key={row.credentialId}
                className="flex items-center justify-between gap-3 rounded-md border p-3"
              >
                <span className="text-sm font-medium">{row.name}</span>
                {row.enabled ? (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busyId === row.credentialId}
                    onClick={() => handleDisable(row)}
                  >
                    {busyId === row.credentialId ? 'Removing…' : 'Disable unlock'}
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    disabled={busyId === row.credentialId || !secret}
                    onClick={() => handleEnable(row)}
                  >
                    {busyId === row.credentialId ? 'Enabling…' : 'Enable unlock'}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
};

export default PasskeyUnlockCard;
```

- [ ] **Step 3: Wire into `SecuritySection`**

Edit `features/settings/SecuritySection.tsx`: import the card and render it after `RotateRecoveryCard`:

```tsx
import ChangePassphraseCard from './ChangePassphraseCard';
import PasskeyUnlockCard from './PasskeyUnlockCard';
import ResetEncryptionCard from './ResetEncryptionCard';
import RotateRecoveryCard from './RotateRecoveryCard';
// ...
  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-lg font-semibold">Security</h2>
      <ChangePassphraseCard />
      <RotateRecoveryCard />
      <PasskeyUnlockCard />
      <ResetEncryptionCard />
    </div>
  );
```

- [ ] **Step 4: Verify the build compiles**

Run: `pnpm type-check && pnpm lint`
Expected: PASS. (No unit test for the card — it is exercised in live acceptance. If `authClient.passkey.listUserPasskeys` has a different exact name in the installed version, fix it now; the endpoint is `/passkey/list-user-passkeys` returning `Passkey[]` with `credentialID` + `name`.)

- [ ] **Step 5: Commit**

```bash
git add features/settings/PasskeyUnlockCard.tsx features/settings/SecuritySection.tsx features/settings/actions/index.ts
git commit -m "feat(crypto): Settings → Security passkey unlock card"
```

---

### Task 10: Unlock screen — "Unlock with passkey" button

**Files:**
- Modify: `features/crypto/UnlockScreen.tsx`

**Interfaces:**
- Consumes: `unlockWithPasskey` (passkeyFlow); `getMaterial`; `finalizeEncryption`.
- Produces: a passkey unlock affordance on `/crypto/unlock`, shown only when ≥1 passkey is enrolled.

- [ ] **Step 1: Add passkey state + handler to `UnlockForm`**

In `features/crypto/UnlockScreen.tsx`, extend the `UnlockForm` component. Add imports at the top of the file:

```ts
import { unlockWithPasskey } from '@/features/crypto/lib/passkeyFlow';
import { getMaterial } from '@/features/crypto/lib/cryptoMaterial';
import { useEffect } from 'react';
```

Inside `UnlockForm`, after the existing `useState` declarations, add:

```ts
const [hasPasskey, setHasPasskey] = useState(false);

useEffect(() => {
  void getMaterial()
    .then((m) => setHasPasskey(m.passkeys.length > 0))
    .catch(() => setHasPasskey(false));
}, []);

async function handlePasskey() {
  setError(null);
  setPending(true);
  try {
    await unlockWithPasskey();
    await finalizeEncryption().catch(() => {});
    window.location.assign(resolveCallback());
  } catch (err) {
    setError(
      err instanceof Error ? err.message : CRYPTO_COPY.errors.unlockFailed
    );
    setPending(false);
  }
}
```

- [ ] **Step 2: Render the button**

In `UnlockForm`'s returned JSX, immediately after the `</form>` closing tag (before the switch-mode paragraph), add:

```tsx
{hasPasskey && (
  <button
    type="button"
    className="au-btn au-btn--ghost"
    onClick={handlePasskey}
    disabled={pending}
  >
    Unlock with passkey
  </button>
)}
```

- [ ] **Step 3: Verify the build compiles**

Run: `pnpm type-check && pnpm lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add features/crypto/UnlockScreen.tsx
git commit -m "feat(crypto): passkey unlock button on the unlock screen"
```

---

### Task 11 (optional, recommended): Setup-wizard passkey step

> Deliverable: after setting the recovery code, the wizard offers "Also unlock with this device's passkey?". Reuses `buildPasskeyWrap` + `enablePasskeyUnlockAction` while the freshly-generated DEK is still in `dekRef`. Skippable — passphrase + recovery already work. Cut this task if it risks destabilizing the wizard's state machine; the feature is complete without it.

**Files:**
- Modify: `features/crypto/SetupWizard.tsx`

**Interfaces:**
- Consumes: `dekRef.current` (the in-memory DEK); `authClient.passkey.listUserPasskeys`; `buildPasskeyWrap`; `enablePasskeyUnlockAction`.

- [ ] **Step 1: Add an optional passkey step between `recovery` and `encrypting`**

Extend the `Step` union with `'passkey'` and `STEP_ORDER`/`STEP_LABELS` accordingly. Add a `PasskeyStep` component that:
- lists the user's passkeys (`authClient.passkey.listUserPasskeys()`),
- on "Enable", reads `dekRef.current`, calls `buildPasskeyWrap(dek, credentialId, name)` then `enablePasskeyUnlockAction(input)`,
- offers a "Skip" button.

Both "Enable+continue" and "Skip" advance to `handleRecoveryNext()` (which unlocks the session via `postDek(dekRef.current)` and finalizes). Wire the new step into the render switch and the `RecoveryStep`'s `onNext` to go to `'passkey'` instead of directly calling `handleRecoveryNext`.

Follow the existing `au-*` styling and the in-memory-DEK guard pattern already used in `handleRecoveryNext` (if `dekRef.current` is null, route to `/crypto/unlock`).

- [ ] **Step 2: Verify the build compiles**

Run: `pnpm type-check && pnpm lint`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add features/crypto/SetupWizard.tsx
git commit -m "feat(crypto): optional passkey step in the setup wizard"
```

---

### Task 12: Full suite + live acceptance checklist

- [ ] **Step 1: Run the full suite**

Run: `pnpm test && pnpm type-check && pnpm lint`
Expected: all PASS (existing suite + the new repository/crypto/action/flow tests).

- [ ] **Step 2: Record the live acceptance checklist in the PR body**

WebAuthn cannot run headless. Add to the PR body (folds into the crypto e2e already owed for P2/P3 on a real Postgres + Garage env):

```
- [ ] Register a passkey (sign-in passkey); confirm PRF results are returned at assertion (if not, the starter dropped registration.extensions — patch it).
- [ ] Settings → Security → Enable unlock (prove with passphrase). Lock. Unlock via Touch ID/PIN → journal decrypts.
- [ ] Enable a second passkey on another device; both unlock independently.
- [ ] Disable one passkey → it no longer unlocks; the other still does; passphrase + recovery still work.
- [ ] (If Task 11 shipped) Fresh-user wizard passkey step enables unlock from day one.
```

- [ ] **Step 3: Open the PR**

```bash
git push -u origin encrypted-journals-passkey
gh pr create --title "feat(crypto): encrypted journals — passkey (PRF) unlock" --body "<summary + the acceptance checklist above>"
```

---

## Self-Review

**Spec coverage:**
- Reuse login passkeys via PRF → Task 1 (registration extension), Tasks 5/8 (assertion + flows). ✓
- New `cryptoPasskeyWrap` one-to-many table → Task 2. ✓
- KEK = PRF → HKDF(`ledger-passkey-v1`) → AES-GCM → Task 4. ✓
- Enable flow (proof-before-mutation) → Tasks 8 (`buildPasskeyWrap`) + 9 (card obtains DEK via `obtainDek`) + 7 (action). ✓
- Unlock flow (`evalByCredential`, no server verify) → Tasks 5 (`assertPrfAny`) + 8 (`unlockWithPasskey`) + 10 (button). ✓
- Disable flow, no last-method guard → Task 7 + 9. ✓
- Material contract extension → Task 6. ✓
- Setup-wizard touchpoint → Task 11 (optional). ✓
- Orphan handling (tolerate; no FK on credentialId) → Task 2 schema comment + Task 9 cross-reference hides orphans. ✓
- Testing (unit/repo/action/flow + live e2e) → Tasks 3,4,5,7,8,12. ✓

**Placeholder scan:** No TBD/TODO; every code step shows complete code. Task 11 is intentionally described at component-shape level (not full code) because it is optional and must adapt to the wizard's evolving state machine — flagged as such, not a hidden gap.

**Type consistency:** `EnablePasskeyInput` (Task 8) matches `enablePasskeyUnlockSchema` fields (Task 6) and the action's `create` call (Task 7). `PasskeyMaterial` (Task 6) matches what `assertPrfAny`/`unlockWithPasskey` consume. `credentialId` is base64url end-to-end (better-auth `credentialID` → schema → material → `cred.id`). Action result shape `{ ok } | { ok:false; message }` matches the card's `res.ok`/`res.message` usage.
