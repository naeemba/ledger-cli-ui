# Encrypted Journals — P2: Wizard, Unlock, Client Crypto & Migration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. UI tasks (8–10) additionally pair with superpowers' frontend-design guidance and the existing `au-*` design system.

**Goal:** Make zero-knowledge encryption real and usable: a gated onboarding **wizard** that generates the DEK client-side, sets a passphrase + recovery code, and migrates the existing plaintext journal to ciphertext; a per-session **unlock** screen; a **Lock** control; and the **server gate** that routes users into setup/unlock.

**Architecture:** All secret handling is **client-side** (WebCrypto + `hash-wasm` Argon2id). The browser generates a 32-byte DEK, derives KEKs from the passphrase (Argon2id) and a one-time recovery code (HKDF), AES-GCM-wraps the DEK under each KEK, and uploads only the opaque wrap blobs (P1's `userCrypto` table). The raw DEK is POSTed to P1's `/api/crypto/unlock` (in-RAM, session-scoped) so the server can run `ledger`. Migration re-encrypts the existing plaintext journal under `withUserLock` using the in-RAM DEK. A server gate (proxy forwards `x-pathname`; a root-layout server check reads it) redirects un-set-up users to `/crypto/setup` and locked users to `/crypto/unlock`; the data layer's `LockedError` (P1) is the hard correctness backstop.

**Tech Stack:** TypeScript, Next.js 16 app router, WebCrypto (AES-256-GCM, HKDF-SHA256), `hash-wasm` (Argon2id, WASM bundled inline — no bundler config needed), Drizzle + Postgres, Vitest. UI in the `au-*` editorial design system (`features/auth/auth.css`, Fraunces + JetBrains Mono).

## Global Constraints

- **Zero-knowledge:** the passphrase and recovery code NEVER leave the browser. Only opaque wrap blobs + salts + Argon2 params are uploaded; only the raw DEK (over TLS) reaches the server, held in RAM for the session. Never log secrets, the DEK, or wraps.
- **DEK:** 32 random bytes from `crypto.getRandomValues`. Generated once at setup; never changes (changing passphrase / rotating recovery / adding passkey only re-wraps it).
- **Passphrase KEK:** `Argon2id(passphrase, passSalt, params)` → 32 bytes, used directly as the AES-256-GCM wrapping key. Start params `{ m: 65536 /* KiB = 64 MiB */, t: 3, p: 1 }`, `hashLength: 32`. `passSalt` = 16 random bytes (base64).
- **Recovery KEK:** `HKDF-SHA256(recoveryBytes, salt=empty, info="ledger-recovery-v1")` → AES-256-GCM key. Recovery code = 256 random bits shown once as grouped Base32 (Crockford-free standard RFC 4648 Base32, grouped `XXXX-XXXX-…`).
- **Wrap blob format (client-owned, opaque to server):** `base64( nonce(12) ‖ AES-GCM-ciphertext-with-tag )`. WebCrypto appends the 16-byte tag to the ciphertext automatically.
- **`userCrypto` columns (P1, do not change):** `wrapPassphrase`, `passSalt`, `argonParams {m,t,p}`, `wrapRecovery`, `recoveryCreatedAt`, `kdfVersion` (=1), timestamps. No recovery salt column — recovery HKDF uses an empty salt + fixed info (the recovery code is full-entropy).
- **Migration** re-encrypts every journal file under `withUserLock`, idempotent via P1's `isCiphertext` (`LEJ1` magic). Requires the in-RAM DEK; throws `LockedError` if absent.
- **Gate must not touch `/crypto/*`, auth paths, or public paths.** `/crypto/setup` and `/crypto/unlock` render chrome-free (like auth pages).
- **Reuse P1 verbatim:** `DEK_BYTES` from `@/lib/crypto/constants`; `getUserCryptoRepository()` from `@/lib/crypto`; `getSessionDek`/`dropSessionDek`/`LockedError` from `@/lib/crypto/sessionKeys`; `encryptFile`/`isCiphertext` from `@/lib/crypto/fileCrypto`; `decodeDek` contract of `/api/crypto/unlock`.
- **Test command:** `pnpm test`. **Type-check:** `pnpm type-check`. Pre-commit husky runs type-check + lint-staged; commitlint requires lowercase commit subjects (use the `feat(...)` / `chore(...)` messages given per task).

---

## File Structure

**Create — client crypto & shared schema:**
- `features/crypto/lib/clientCrypto.ts` — pure browser crypto: `generateDek`, `derivePassphraseKek`, `wrapDek`, `unwrapDek`, `recoveryHkdfKey`, `generateRecoveryCode`, `parseRecoveryCode`, base64/Base32 helpers.
- `lib/crypto/setupSchema.ts` — Zod schema for the setup payload (shared by the action). Pure, server-importable.

**Create — server actions / routes:**
- `features/crypto/actions/setupCrypto.ts` — `'use server'`: validate payload, `userCryptoRepository.create`, reject if already set up.
- `features/crypto/actions/finalizeEncryption.ts` — `'use server'`: call `journalService.enableEncryption(userId)` after the DEK is unlocked.
- `app/api/crypto/material/route.ts` — `GET`: return the current user's `{ passSalt, argonParams, wrapPassphrase, wrapRecovery }` (opaque; useless without the secret) for unlock.

**Create — gate:**
- `lib/crypto/gate.ts` — `cryptoStatus(userId)` → `'unset' | 'locked' | 'ready'`; `isCryptoPath(pathname)`.
- `components/crypto/CryptoGate.tsx` — server component rendered in the root layout; reads `x-pathname`, redirects.
- `components/AppShell/cryptoPaths.ts` — `CRYPTO_PATHS` (`/crypto/setup`, `/crypto/unlock`), `isCryptoPath`.

**Create — UI:**
- `app/crypto/setup/page.tsx`, `app/crypto/unlock/page.tsx` — chrome-free route pages.
- `features/crypto/SetupWizard.tsx` (+ step subcomponents `StepWhy`, `StepPassphrase`, `StepRecovery`, `StepEncrypting`), `features/crypto/UnlockScreen.tsx`, `features/crypto/LockButton.tsx`, `features/crypto/cryptoCopy.ts`.

**Modify:**
- `lib/journal/service.ts` — add `enableEncryption(userId)`.
- `proxy.ts` — forward `x-pathname` request header.
- `app/layout.tsx` — render `<CryptoGate/>` (server) for the gate.
- `components/AppShell/AppShell.tsx` + `authPaths`/`publicPaths` usage — treat `/crypto/*` as chrome-free.
- `lib/auth-client.ts` or the sign-out call site — drop the DEK on sign-out (POST `/api/crypto/lock`).
- `package.json` / `next.config` — add `hash-wasm`.

---

## Task 1: Add `hash-wasm` + verify WASM bundling

**Files:** Modify `package.json` (+ lockfile); possibly `next.config.js`.

- [ ] **Step 1:** `pnpm add hash-wasm` (it embeds its WASM as inline base64 — no webpack/turbopack config is required; confirm by the build in Step 3).
- [ ] **Step 2:** Write a throwaway node check that imports `argon2id` from `hash-wasm` and hashes a constant, to confirm the dep resolves: `pnpm exec node -e "import('hash-wasm').then(m=>m.argon2id({password:'x',salt:new Uint8Array(16),parallelism:1,iterations:2,memorySize:512,hashLength:32,outputType:'binary'})).then(h=>console.log('ok',h.length))"` → expect `ok 32`.
- [ ] **Step 3:** `pnpm build` (or `pnpm dev` smoke) to confirm no WASM bundling error surfaces. If a turbopack WASM error appears, add to `next.config.js`: `nextConfig.webpack = (c)=>{ c.experiments={...c.experiments, asyncWebAssembly:true}; return c; }` and note it; otherwise leave config untouched.
- [ ] **Step 4: Commit** `git add package.json pnpm-lock.yaml next.config.js 2>/dev/null; git commit -m "chore(crypto): add hash-wasm for client-side argon2id"`

---

## Task 2: Client crypto library (`features/crypto/lib/clientCrypto.ts`)

**Files:** Create `features/crypto/lib/clientCrypto.ts`, `features/crypto/lib/clientCrypto.test.ts`.

**Interfaces — Produces:**
- `generateDek(): Uint8Array` (32 bytes)
- `derivePassphraseKek(passphrase: string, salt: Uint8Array, params: {m:number;t:number;p:number}): Promise<CryptoKey>` (AES-GCM key)
- `recoveryHkdfKey(recovery: Uint8Array): Promise<CryptoKey>` (AES-GCM key via HKDF)
- `wrapDek(dek: Uint8Array, kek: CryptoKey): Promise<string>` (base64 `nonce‖ct+tag`)
- `unwrapDek(wrapB64: string, kek: CryptoKey): Promise<Uint8Array>`
- `generateRecoveryCode(): { code: string; bytes: Uint8Array }` (grouped Base32)
- `parseRecoveryCode(code: string): Uint8Array`
- `toBase64(b: Uint8Array): string`, `fromBase64(s: string): Uint8Array`

- [ ] **Step 1: Write the failing test**

```ts
// features/crypto/lib/clientCrypto.test.ts
import { describe, expect, it } from 'vitest';
import {
  derivePassphraseKek,
  generateDek,
  generateRecoveryCode,
  parseRecoveryCode,
  recoveryHkdfKey,
  unwrapDek,
  wrapDek,
} from './clientCrypto';

const PARAMS = { m: 512, t: 2, p: 1 }; // small for test speed

describe('clientCrypto', () => {
  it('generates a 32-byte DEK', () => {
    expect(generateDek().length).toBe(32);
  });

  it('passphrase wrap/unwrap round-trips and is deterministic for same salt+params', async () => {
    const dek = generateDek();
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const kek1 = await derivePassphraseKek('correct horse', salt, PARAMS);
    const wrap = await wrapDek(dek, kek1);
    const kek2 = await derivePassphraseKek('correct horse', salt, PARAMS);
    const out = await unwrapDek(wrap, kek2);
    expect([...out]).toEqual([...dek]);
  });

  it('wrong passphrase fails to unwrap', async () => {
    const dek = generateDek();
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const wrap = await wrapDek(dek, await derivePassphraseKek('right', salt, PARAMS));
    const wrongKek = await derivePassphraseKek('wrong', salt, PARAMS);
    await expect(unwrapDek(wrap, wrongKek)).rejects.toBeTruthy();
  });

  it('recovery code round-trips and unwraps the DEK', async () => {
    const dek = generateDek();
    const { code, bytes } = generateRecoveryCode();
    expect(parseRecoveryCode(code)).toEqual(bytes);
    const wrap = await wrapDek(dek, await recoveryHkdfKey(bytes));
    const out = await unwrapDek(wrap, await recoveryHkdfKey(parseRecoveryCode(code)));
    expect([...out]).toEqual([...dek]);
  });

  it('recovery code is grouped Base32 of 256 bits', () => {
    const { code, bytes } = generateRecoveryCode();
    expect(bytes.length).toBe(32);
    expect(code).toMatch(/^[A-Z2-7]{4}(-[A-Z2-7]{4})+$/);
  });
});
```

- [ ] **Step 2: Run — expect FAIL** `pnpm test features/crypto/lib/clientCrypto.test.ts` (module not found).

- [ ] **Step 3: Implement**

```ts
// features/crypto/lib/clientCrypto.ts
import { argon2id } from 'hash-wasm';

const GCM_NONCE = 12;
const RECOVERY_INFO = new TextEncoder().encode('ledger-recovery-v1');

export const toBase64 = (b: Uint8Array): string =>
  btoa(String.fromCharCode(...b));
export const fromBase64 = (s: string): Uint8Array =>
  Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export const generateDek = (): Uint8Array =>
  crypto.getRandomValues(new Uint8Array(32));

export const derivePassphraseKek = async (
  passphrase: string,
  salt: Uint8Array,
  params: { m: number; t: number; p: number }
): Promise<CryptoKey> => {
  const raw = await argon2id({
    password: passphrase,
    salt,
    parallelism: params.p,
    iterations: params.t,
    memorySize: params.m, // KiB
    hashLength: 32,
    outputType: 'binary',
  });
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, [
    'encrypt',
    'decrypt',
  ]);
};

export const recoveryHkdfKey = async (
  recovery: Uint8Array
): Promise<CryptoKey> => {
  const base = await crypto.subtle.importKey('raw', recovery, 'HKDF', false, [
    'deriveKey',
  ]);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: RECOVERY_INFO },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
};

export const wrapDek = async (
  dek: Uint8Array,
  kek: CryptoKey
): Promise<string> => {
  const iv = crypto.getRandomValues(new Uint8Array(GCM_NONCE));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, kek, dek)
  );
  const blob = new Uint8Array(iv.length + ct.length);
  blob.set(iv, 0);
  blob.set(ct, iv.length);
  return toBase64(blob);
};

export const unwrapDek = async (
  wrapB64: string,
  kek: CryptoKey
): Promise<Uint8Array> => {
  const blob = fromBase64(wrapB64);
  const iv = blob.subarray(0, GCM_NONCE);
  const ct = blob.subarray(GCM_NONCE);
  return new Uint8Array(
    await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, kek, ct)
  );
};

// RFC 4648 Base32, grouped XXXX-XXXX for readability.
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const base32Encode = (bytes: Uint8Array): string => {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
};
const base32Decode = (s: string): Uint8Array => {
  const clean = s.replace(/-/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx < 0) throw new Error('Invalid recovery code character');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Uint8Array.from(out);
};

export const generateRecoveryCode = (): { code: string; bytes: Uint8Array } => {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const raw = base32Encode(bytes); // 52 chars for 256 bits
  const code = (raw.match(/.{1,4}/g) ?? []).join('-');
  return { code, bytes };
};

export const parseRecoveryCode = (code: string): Uint8Array =>
  base32Decode(code).subarray(0, 32);
```

- [ ] **Step 4: Run — expect PASS** `pnpm test features/crypto/lib/clientCrypto.test.ts`. (Vitest `environment: 'node'` provides WebCrypto via Node's global `crypto`. If `crypto.subtle` is undefined in the test env, add `// @vitest-environment jsdom` at the top of the test file or import `webcrypto` — report which was needed.)

- [ ] **Step 5: Commit** `git add features/crypto/lib/clientCrypto.ts features/crypto/lib/clientCrypto.test.ts && git commit -m "feat(crypto): client-side dek/kek/wrap + recovery code module"`

---

## Task 3: Setup payload schema + `setupCrypto` server action

**Files:** Create `lib/crypto/setupSchema.ts`, `features/crypto/actions/setupCrypto.ts`, `features/crypto/actions/setupCrypto.test.ts`.

**Interfaces:**
- Consumes: `getUserCryptoRepository()` (P1), `requireUser`.
- Produces: `setupCryptoSchema` (Zod); `setupCrypto(input): Promise<{ ok: true } | { ok: false; error: string }>`.

- [ ] **Step 1: Write the schema**

```ts
// lib/crypto/setupSchema.ts
import { z } from 'zod';

const b64 = z.string().min(1).max(2000);
export const setupCryptoSchema = z.object({
  wrapPassphrase: b64,
  passSalt: b64,
  argonParams: z.object({
    m: z.number().int().positive(),
    t: z.number().int().positive(),
    p: z.number().int().positive(),
  }),
  wrapRecovery: b64,
});
export type SetupCryptoInput = z.infer<typeof setupCryptoSchema>;
```

- [ ] **Step 2: Write the failing test** (uses setupTestDb to verify the row is created and double-setup is rejected)

```ts
// features/crypto/actions/setupCrypto.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UserCryptoRepository } from '@/lib/crypto';
import { setupTestDb, teardownTestDb, type TestDbContext } from '@/lib/test-utils/db';

const repoHolder: { repo: UserCryptoRepository | null } = { repo: null };
vi.mock('@/lib/auth/require-user', () => ({
  requireUser: vi.fn(async () => ({ id: 'alice' })),
}));
vi.mock('@/lib/crypto', async (orig) => ({
  ...(await orig<typeof import('@/lib/crypto')>()),
  getUserCryptoRepository: () => repoHolder.repo,
}));

import { setupCrypto } from './setupCrypto';

const VALID = {
  wrapPassphrase: 'd2FwUA==',
  passSalt: 'c2FsdA==',
  argonParams: { m: 65536, t: 3, p: 1 },
  wrapRecovery: 'd2FwUg==',
};

describe('setupCrypto', () => {
  let ctx: TestDbContext;
  beforeEach(async () => {
    ctx = await setupTestDb('setup-crypto-');
    await ctx.insertUser('alice');
    repoHolder.repo = new UserCryptoRepository(ctx.db);
  });
  afterEach(async () => {
    await teardownTestDb(ctx);
    vi.clearAllMocks();
  });

  it('creates the userCrypto row', async () => {
    const res = await setupCrypto(VALID);
    expect(res.ok).toBe(true);
    expect(await repoHolder.repo!.exists('alice')).toBe(true);
  });

  it('rejects a second setup', async () => {
    await setupCrypto(VALID);
    const res = await setupCrypto(VALID);
    expect(res.ok).toBe(false);
  });

  it('rejects a malformed payload', async () => {
    const res = await setupCrypto({ ...VALID, argonParams: { m: -1, t: 3, p: 1 } });
    expect(res.ok).toBe(false);
  });
});
```

- [ ] **Step 3: Run — expect FAIL** `pnpm test features/crypto/actions/setupCrypto.test.ts`.

- [ ] **Step 4: Implement**

```ts
// features/crypto/actions/setupCrypto.ts
'use server';

import { requireUser } from '@/lib/auth/require-user';
import { getUserCryptoRepository } from '@/lib/crypto';
import { setupCryptoSchema } from '@/lib/crypto/setupSchema';

type Result = { ok: true } | { ok: false; error: string };

export async function setupCrypto(input: unknown): Promise<Result> {
  const user = await requireUser();
  const parsed = setupCryptoSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Invalid setup payload' };

  const repo = getUserCryptoRepository();
  if (await repo.exists(user.id)) {
    return { ok: false, error: 'Encryption is already set up' };
  }
  await repo.create({
    userId: user.id,
    wrapPassphrase: parsed.data.wrapPassphrase,
    passSalt: parsed.data.passSalt,
    argonParams: parsed.data.argonParams,
    wrapRecovery: parsed.data.wrapRecovery,
  });
  return { ok: true };
}
```

- [ ] **Step 5: Run — expect PASS**, then **Commit** `git add lib/crypto/setupSchema.ts features/crypto/actions/setupCrypto.ts features/crypto/actions/setupCrypto.test.ts && git commit -m "feat(crypto): setupCrypto action stores client-created wraps"`

---

## Task 4: `JournalService.enableEncryption` (migration)

**Files:** Modify `lib/journal/service.ts`; create `lib/journal/service.enableEncryption.test.ts` (or extend the existing service test file — match the repo's convention; if `service.test.ts` exists, add a `describe` there).

**Interfaces:**
- Consumes: `withUserLock`, `pull`, `push`, `getJournalDir`, `listLocalRelPaths`, `getSessionDek`/`LockedError`, `encryptFile`/`isCiphertext`.
- Produces: `enableEncryption(userId: string): Promise<{ encrypted: number; alreadyCiphertext: number }>`.

- [ ] **Step 1: Write the failing test**

```ts
// lib/journal/service.enableEncryption.test.ts
import { promises as fs } from 'fs';
import path from 'path';
import { randomBytes } from 'crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isCiphertext } from '@/lib/crypto/fileCrypto';
import { LockedError, __resetSessionKeysForTest, setSessionDek } from '@/lib/crypto/sessionKeys';
import { getJournalDir } from '@/lib/journal/layout';
import { journalService } from '@/lib/journal';
import { MemoryObjectStore } from '@/lib/storage/memoryObjectStore';
import { resetObjectStore, getObjectStore } from '@/lib/storage';
import { keyFor } from '@/lib/storage/manifest';
import { setupTestDb, teardownTestDb, type TestDbContext } from '@/lib/test-utils/db';

// NOTE: confirm the exact helpers to force a MemoryObjectStore in tests
// (resetObjectStore + STORAGE_BACKEND=memory). Mirror an existing storage test's setup.

describe('JournalService.enableEncryption', () => {
  let ctx: TestDbContext;
  beforeEach(async () => {
    ctx = await setupTestDb('enable-enc-');
    await ctx.insertUser('alice');
    resetObjectStore();
  });
  afterEach(async () => {
    __resetSessionKeysForTest();
    await teardownTestDb(ctx);
  });

  it('re-encrypts existing plaintext files and is idempotent', async () => {
    const userId = 'alice';
    const dir = getJournalDir(userId);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'main.ledger'), '2026/01/01 Opening\n  Assets:Cash  $10\n');

    setSessionDek(userId, randomBytes(32));
    const r1 = await journalService.enableEncryption(userId);
    expect(r1.encrypted).toBe(1);

    const remote = await getObjectStore().get(keyFor(userId, 'main.ledger'));
    expect(isCiphertext(remote.body)).toBe(true);

    // idempotent: pulling decrypts to plaintext locally; re-running re-encrypts the same content
    const r2 = await journalService.enableEncryption(userId);
    expect(r2.encrypted + r2.alreadyCiphertext).toBeGreaterThanOrEqual(1);
  });

  it('throws LockedError when no session DEK', async () => {
    const dir = getJournalDir('alice');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'main.ledger'), 'x');
    await expect(journalService.enableEncryption('alice')).rejects.toBeInstanceOf(LockedError);
  });
});
```

- [ ] **Step 2: Run — expect FAIL.** (If the singleton `journalService` can't reach the test DB, the implementer should mirror however the existing `service.test.ts` exercises the singleton — note it in the report. `enableEncryption` itself does NOT touch the DB, so this should be clean.)

- [ ] **Step 3: Implement** — add to `JournalService`:

```ts
async enableEncryption(
  userId: string
): Promise<{ encrypted: number; alreadyCiphertext: number }> {
  return withUserLock(userId, async () => {
    const dek = getSessionDek(userId);
    if (!dek) throw new LockedError();
    await pull(userId); // bring canonical down (decrypts any already-ciphertext)
    const dir = getJournalDir(userId);
    let encrypted = 0;
    let alreadyCiphertext = 0;
    for (const rel of await listLocalRelPaths(dir)) {
      const abs = path.join(dir, rel);
      const body = await fs.readFile(abs);
      if (isCiphertext(body)) {
        alreadyCiphertext++;
        continue;
      }
      await fs.writeFile(abs, encryptFile(dek, rel, body));
      encrypted++;
    }
    await push(userId); // re-encrypts on the seam too (DEK present) — uploads ciphertext
    return { encrypted, alreadyCiphertext };
  });
}
```

Add the necessary imports at the top of `service.ts` (`encryptFile`, `isCiphertext` from `@/lib/crypto/fileCrypto`; `getSessionDek`, `LockedError` from `@/lib/crypto/sessionKeys`; `listLocalRelPaths` from `@/lib/storage/manifest` if not already imported; `pull`/`push` are already used).

> **Design note for the implementer/reviewer:** with the DEK present, P1's `push` seam would itself encrypt plaintext. Writing ciphertext to the local file *before* `push` is intentional belt-and-suspenders so the on-disk working copy is also ciphertext at rest the moment migration completes, and so `alreadyCiphertext` accounting is meaningful on re-run. Both layers produce identical envelopes; the double pass is correct, not redundant encryption of ciphertext (the `isCiphertext` guard prevents re-wrapping).

- [ ] **Step 4: Run — expect PASS**, then **Commit** `git add lib/journal/service.ts lib/journal/service.enableEncryption.test.ts && git commit -m "feat(crypto): JournalService.enableEncryption migrates plaintext journal"`

---

## Task 5: `GET /api/crypto/material` (unlock material) + `finalizeEncryption` action

**Files:** Create `app/api/crypto/material/route.ts`, `app/api/crypto/material/route.test.ts`, `features/crypto/actions/finalizeEncryption.ts`.

**Interfaces:**
- `GET /api/crypto/material` → 200 `{ passSalt, argonParams, wrapPassphrase, wrapRecovery }` or 404 if not set up.
- `finalizeEncryption(): Promise<{ ok: boolean; error?: string }>` — server action wrapping `journalService.enableEncryption(user.id)` (DEK must already be unlocked).

- [ ] **Step 1: Write the material route**

```ts
// app/api/crypto/material/route.ts
import { requireUser } from '@/lib/auth/require-user';
import { getUserCryptoRepository } from '@/lib/crypto';
import { NextResponse } from 'next/server';

export async function GET(): Promise<NextResponse> {
  const user = await requireUser();
  const row = await getUserCryptoRepository().get(user.id);
  if (!row) {
    return NextResponse.json({ error: 'Encryption is not set up.' }, { status: 404 });
  }
  // All four are opaque without the user's secret.
  return NextResponse.json({
    passSalt: row.passSalt,
    argonParams: row.argonParams,
    wrapPassphrase: row.wrapPassphrase,
    wrapRecovery: row.wrapRecovery,
  });
}
```

- [ ] **Step 2: Test the material route** (mock `requireUser` + `getUserCryptoRepository`, assert 200 shape and 404). Mirror the P1 `app/api/crypto/unlock/route.test.ts` mock style.

```ts
// app/api/crypto/material/route.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';
const getMock = vi.fn();
vi.mock('@/lib/auth/require-user', () => ({ requireUser: vi.fn(async () => ({ id: 'alice' })) }));
vi.mock('@/lib/crypto', () => ({ getUserCryptoRepository: () => ({ get: getMock }) }));
import { GET } from './route';
afterEach(() => vi.clearAllMocks());

describe('GET /api/crypto/material', () => {
  it('returns the opaque material when set up', async () => {
    getMock.mockResolvedValue({ passSalt: 's', argonParams: { m: 1, t: 1, p: 1 }, wrapPassphrase: 'wp', wrapRecovery: 'wr' });
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ passSalt: 's', argonParams: { m: 1, t: 1, p: 1 }, wrapPassphrase: 'wp', wrapRecovery: 'wr' });
  });
  it('404s when not set up', async () => {
    getMock.mockResolvedValue(null);
    expect((await GET()).status).toBe(404);
  });
});
```

- [ ] **Step 3: finalizeEncryption action**

```ts
// features/crypto/actions/finalizeEncryption.ts
'use server';
import { requireUser } from '@/lib/auth/require-user';
import { journalService } from '@/lib/journal';
import { LockedError } from '@/lib/crypto/sessionKeys';

export async function finalizeEncryption(): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  try {
    await journalService.enableEncryption(user.id);
    return { ok: true };
  } catch (e) {
    if (e instanceof LockedError) return { ok: false, error: 'Session is locked; unlock and retry.' };
    console.error('finalizeEncryption failed', e);
    return { ok: false, error: 'Could not encrypt your journal. Please retry.' };
  }
}
```

- [ ] **Step 4: Run material test — expect PASS**, then **Commit** `git add app/api/crypto/material features/crypto/actions/finalizeEncryption.ts && git commit -m "feat(crypto): unlock-material route + finalizeEncryption action"`

---

## Task 6: The server gate (proxy header + root-layout check)

**Files:** Modify `proxy.ts`, `app/layout.tsx`; create `lib/crypto/gate.ts`, `components/AppShell/cryptoPaths.ts`, `components/crypto/CryptoGate.tsx`, `lib/crypto/gate.test.ts`.

**Interfaces:**
- `cryptoStatus(userId): Promise<'unset' | 'locked' | 'ready'>` (`unset` = no userCrypto row; `locked` = row exists but no session DEK; `ready` = DEK in RAM).
- `isCryptoPath(pathname): boolean`.
- `<CryptoGate/>` server component: reads `x-pathname` from `headers()`, and for a gated path redirects.

- [ ] **Step 1: `cryptoPaths.ts`**

```ts
// components/AppShell/cryptoPaths.ts
export const CRYPTO_PATHS = new Set(['/crypto/setup', '/crypto/unlock']);
export const isCryptoPath = (pathname: string): boolean =>
  CRYPTO_PATHS.has(pathname);
```

- [ ] **Step 2: `gate.ts` + unit test**

```ts
// lib/crypto/gate.ts
import 'server-only';
import { getUserCryptoRepository } from '@/lib/crypto';
import { hasSessionDek } from '@/lib/crypto/sessionKeys';

export type CryptoStatus = 'unset' | 'locked' | 'ready';

export const cryptoStatus = async (userId: string): Promise<CryptoStatus> => {
  if (!(await getUserCryptoRepository().exists(userId))) return 'unset';
  return hasSessionDek(userId) ? 'ready' : 'locked';
};
```

```ts
// lib/crypto/gate.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { __resetSessionKeysForTest, setSessionDek } from '@/lib/crypto/sessionKeys';
import { randomBytes } from 'crypto';
const existsMock = vi.fn();
vi.mock('@/lib/crypto', () => ({ getUserCryptoRepository: () => ({ exists: existsMock }) }));
import { cryptoStatus } from './gate';
afterEach(() => { __resetSessionKeysForTest(); vi.clearAllMocks(); });

describe('cryptoStatus', () => {
  it('unset when no row', async () => { existsMock.mockResolvedValue(false); expect(await cryptoStatus('a')).toBe('unset'); });
  it('locked when row but no DEK', async () => { existsMock.mockResolvedValue(true); expect(await cryptoStatus('a')).toBe('locked'); });
  it('ready when row and DEK', async () => { existsMock.mockResolvedValue(true); setSessionDek('a', randomBytes(32)); expect(await cryptoStatus('a')).toBe('ready'); });
});
```

- [ ] **Step 3: proxy forwards `x-pathname`** — in `proxy.ts` `withSecurityHeaders`, add to the `requestHeaders` block: `requestHeaders.set('x-pathname', req.nextUrl.pathname);` so server components can read the path.

- [ ] **Step 4: `CryptoGate` server component**

```tsx
// components/crypto/CryptoGate.tsx
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { isAuthPath } from '@/components/AppShell/authPaths';
import { isPublicPath } from '@/components/AppShell/publicPaths';
import { isCryptoPath } from '@/components/AppShell/cryptoPaths';
import { getOptionalUser } from '@/lib/auth/require-user';
import { cryptoStatus } from '@/lib/crypto/gate';

/** Server gate: routes set-up-incomplete users to /crypto/setup and locked
 * users to /crypto/unlock. No-op on auth/public/crypto paths. Correctness is
 * still backstopped by LockedError at the data layer. */
export async function CryptoGate() {
  const pathname = (await headers()).get('x-pathname') ?? '';
  if (!pathname || isAuthPath(pathname) || isPublicPath(pathname) || isCryptoPath(pathname)) {
    return null;
  }
  const user = await getOptionalUser();
  if (!user) return null; // proxy already redirects unauthenticated users
  const status = await cryptoStatus(user.id);
  if (status === 'unset') redirect('/crypto/setup');
  if (status === 'locked') redirect('/crypto/unlock');
  return null;
}
```

- [ ] **Step 5: Render the gate** — in `app/layout.tsx`, render `<CryptoGate />` near the top of `<body>` (it returns `null` or redirects; it must be inside the server layout so `redirect()` works). Keep it above `<AppShell>`.

- [ ] **Step 6: `/crypto/*` chrome-free** — ensure `AppShell` treats `/crypto/setup` and `/crypto/unlock` like auth pages (chrome-free). Modify `AppShell.tsx`: `const isBare = isAuthPath(pathname) || isCryptoPath(pathname);` and use `isBare` where it currently uses `isAuthPage` for the minimal-wrapper branch.

- [ ] **Step 7: Run gate unit test — expect PASS.** Type-check. **Commit** `git add proxy.ts app/layout.tsx lib/crypto/gate.ts lib/crypto/gate.test.ts components/AppShell/cryptoPaths.ts components/crypto/CryptoGate.tsx components/AppShell/AppShell.tsx && git commit -m "feat(crypto): server gate routes users to setup/unlock"`

> **Reviewer note:** the root-layout gate fires on hard loads, not soft client navigations (root layout persists). That's acceptable: post-sign-in landing is a hard navigation, and `LockedError` backstops any soft-nav edge case. Do not add per-page gating.

---

## Task 7: `cryptoCopy.ts` + unlock orchestration hook

**Files:** Create `features/crypto/cryptoCopy.ts` (all wizard/unlock strings), `features/crypto/lib/unlockFlow.ts` (+ test) — the client orchestration that the UI calls.

**Interfaces (`unlockFlow.ts`):**
- `unlockWithPassphrase(passphrase: string): Promise<void>` — fetch material → derive KEK → unwrap DEK → POST `/api/crypto/unlock` → throws on failure.
- `unlockWithRecovery(code: string): Promise<void>` — same via recovery wrap.
- `postDek(dek: Uint8Array): Promise<void>` — POST base64 DEK to `/api/crypto/unlock` (409/400 → throw friendly error).
- `lock(): Promise<void>` — POST `/api/crypto/lock`.

- [ ] **Step 1:** Implement `cryptoCopy.ts` — plain-language strings for: why-encryption explainer (3–4 sentences matching the spec's framing), passphrase step (label, helper, strength hint), recovery step (warning that it's shown once), encrypting step, unlock screen, errors. Keep voice consistent with `features/auth/authCopy.ts`.

- [ ] **Step 2:** Implement `unlockFlow.ts` using `clientCrypto`:

```ts
// features/crypto/lib/unlockFlow.ts
import {
  derivePassphraseKek,
  parseRecoveryCode,
  recoveryHkdfKey,
  toBase64,
  unwrapDek,
  fromBase64,
} from './clientCrypto';

type Material = {
  passSalt: string;
  argonParams: { m: number; t: number; p: number };
  wrapPassphrase: string;
  wrapRecovery: string;
};

const getMaterial = async (): Promise<Material> => {
  const res = await fetch('/api/crypto/material');
  if (!res.ok) throw new Error('Encryption is not set up.');
  return res.json();
};

export const postDek = async (dek: Uint8Array): Promise<void> => {
  const res = await fetch('/api/crypto/unlock', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dek: toBase64(dek) }),
  });
  if (!res.ok) {
    const { error } = await res.json().catch(() => ({ error: 'Unlock failed' }));
    throw new Error(error ?? 'Unlock failed');
  }
};

export const unlockWithPassphrase = async (passphrase: string): Promise<void> => {
  const m = await getMaterial();
  const kek = await derivePassphraseKek(passphrase, fromBase64(m.passSalt), m.argonParams);
  const dek = await unwrapDek(m.wrapPassphrase, kek).catch(() => {
    throw new Error('Incorrect passphrase.');
  });
  await postDek(dek);
};

export const unlockWithRecovery = async (code: string): Promise<void> => {
  const m = await getMaterial();
  const kek = await recoveryHkdfKey(parseRecoveryCode(code));
  const dek = await unwrapDek(m.wrapRecovery, kek).catch(() => {
    throw new Error('Incorrect recovery code.');
  });
  await postDek(dek);
};

export const lock = async (): Promise<void> => {
  await fetch('/api/crypto/lock', { method: 'POST' });
};
```

- [ ] **Step 3:** Test `unlockFlow.ts` by mocking `fetch` (assert it derives + posts the DEK on the happy path, and surfaces "Incorrect passphrase." when the wrap doesn't match). Use a real `clientCrypto` round-trip to build the material fixture so the test exercises actual unwrap.

- [ ] **Step 4: Commit** `git add features/crypto/cryptoCopy.ts features/crypto/lib/unlockFlow.ts features/crypto/lib/unlockFlow.test.ts && git commit -m "feat(crypto): unlock/lock client orchestration + copy"`

---

## Task 8: Unlock screen UI (`/crypto/unlock`)

**Files:** Create `app/crypto/unlock/page.tsx`, `features/crypto/UnlockScreen.tsx`.

**This is a design task — pair with superpowers' frontend-design guidance and match `features/auth/AuthScreen.tsx`.** The logic is fixed; the visual must live in the `au-*` system.

- [ ] **Step 1:** `app/crypto/unlock/page.tsx` — a server page that `requireUser()`s and renders `<UnlockScreen/>`. Chrome-free (the gate + AppShell `isCryptoPath` handle that).
- [ ] **Step 2:** `UnlockScreen.tsx` (`'use client'`):
  - **Logic (fixed):** passphrase field → on submit call `unlockWithPassphrase` → on success `window.location.assign(callbackUrl ?? '/dashboard')` (hard nav so the gate re-evaluates as `ready`). A "Use recovery code instead" toggle swaps to a recovery-code field calling `unlockWithRecovery`. Disable inputs while in-flight; show errors via `au-error`.
  - **Design (acceptance):** reuse the `AuthScreen` two-column shell (`au`, `au-glow`, `au-layer`, `BrandPanel` or a crypto-specific editorial panel), `au-card`, `au-input`, `au-label`, `au-btn--primary`, `au-rise` entrance, Fraunces heading via `au-grad ff-display`. Visually indistinguishable in quality from sign-in. Heading/body from `cryptoCopy`.
- [ ] **Step 3: Acceptance check** — `pnpm dev`, sign in as an encryption-enabled+locked user, confirm `/crypto/unlock` renders in the au-* style, a correct passphrase unlocks and lands on the app, a wrong one shows "Incorrect passphrase.", and the recovery-code path works. (Manual; note results in the report. Add a light component test if feasible, but the manual au-* visual check is the gate.)
- [ ] **Step 4: Commit** `git add app/crypto/unlock features/crypto/UnlockScreen.tsx && git commit -m "feat(crypto): per-session unlock screen (au-* design)"`

---

## Task 9: Setup wizard UI (`/crypto/setup`)

**Files:** Create `app/crypto/setup/page.tsx`, `features/crypto/SetupWizard.tsx` (+ step subcomponents).

**Design task — pair with frontend-design; match `AuthScreen`.** Multi-step, fixed orchestration:

- [ ] **Step 1:** `app/crypto/setup/page.tsx` — server page, `requireUser()`, renders `<SetupWizard/>`. Chrome-free.
- [ ] **Step 2:** `SetupWizard.tsx` (`'use client'`) — a 4-step state machine in the `au-*` shell:
  1. **Why** — `cryptoCopy` explainer + "Get started" (`au-btn--primary`).
  2. **Passphrase** — passphrase + confirm (`au-input`), client-side match + min-length check, strength hint.
  3. **Recovery code** — on entering this step, run the **setup orchestration** (below); display the generated recovery code grouped (`au-card`, `ff-mono`, copy + download buttons), require an "I've saved it" checkbox before continuing.
  4. **Encrypting** — call `finalizeEncryption()`; show progress/spinner; on success `window.location.assign('/dashboard')` (hard nav → gate sees `ready`).
- [ ] **Step 3: Setup orchestration (fixed logic, runs between steps 2→3):**

```ts
// inside SetupWizard (client), on advancing from passphrase to recovery step:
import { generateDek, derivePassphraseKek, wrapDek, recoveryHkdfKey, generateRecoveryCode, toBase64 } from '@/features/crypto/lib/clientCrypto';
import { postDek } from '@/features/crypto/lib/unlockFlow';
import { setupCrypto } from '@/features/crypto/actions/setupCrypto';

const ARGON = { m: 65536, t: 3, p: 1 };

async function runSetup(passphrase: string): Promise<string> {
  const dek = generateDek();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const { code, bytes } = generateRecoveryCode();
  const wrapPassphrase = await wrapDek(dek, await derivePassphraseKek(passphrase, salt, ARGON));
  const wrapRecovery = await wrapDek(dek, await recoveryHkdfKey(bytes));

  const res = await setupCrypto({
    wrapPassphrase, passSalt: toBase64(salt), argonParams: ARGON, wrapRecovery,
  });
  if (!res.ok) throw new Error(res.error);

  await postDek(dek); // unlock this session so migration can run
  return code; // show once
}
// Step 4 then calls finalizeEncryption() to migrate.
```

  Hold `dek`/`code` only in component state; never persist. After step 4 success, drop them (component unmounts on navigation).
- [ ] **Step 4: Acceptance check** — `pnpm dev` as a fresh (un-set-up) user: signing in redirects to `/crypto/setup`; the wizard walks Why → passphrase → recovery (code shown once, copy/download work, gated by the checkbox) → encrypting; afterward the journal reports still render (now backed by ciphertext in Garage); the recovery code and passphrase each unlock a fresh session. Confirm the au-* visual quality matches sign-in. Note results in the report.
- [ ] **Step 5: Commit** `git add app/crypto/setup features/crypto/SetupWizard.tsx features/crypto/Step*.tsx 2>/dev/null && git commit -m "feat(crypto): gated onboarding wizard with journal migration (au-* design)"`

---

## Task 10: Lock control + drop DEK on sign-out

**Files:** Create `features/crypto/LockButton.tsx`; modify the header/user-menu to include it (e.g. `components/Header/AppHeader.tsx` user `DropdownMenu`); modify the sign-out call site (`lib/auth-client.ts` consumers or wherever `signOut` is invoked) to POST `/api/crypto/lock` first.

- [ ] **Step 1:** `LockButton.tsx` (`'use client'`) — calls `lock()` from `unlockFlow`, then `window.location.assign('/crypto/unlock')`. Style as a small ghost button / dropdown item consistent with the header.
- [ ] **Step 2:** Place it in the user `DropdownMenu` in `AppHeader` (near sign-out). Only meaningful for encryption-enabled users — render it unconditionally is fine (a locked/unset user simply won't reach the app chrome).
- [ ] **Step 3:** On sign-out, drop the DEK: wrap the existing `signOut` call so it `await fetch('/api/crypto/lock', { method: 'POST' })` (best-effort, ignore failure) before signing out. Find the current sign-out invocation (header dropdown) and adjust.
- [ ] **Step 4: Acceptance check** — `pnpm dev`: Lock drops to `/crypto/unlock` and the app then requires re-unlock; sign-out + sign-in requires re-unlock (DEK dropped). Note in report.
- [ ] **Step 5: Commit** `git add features/crypto/LockButton.tsx components/Header/AppHeader.tsx lib/auth-client.ts 2>/dev/null && git commit -m "feat(crypto): manual Lock control + drop DEK on sign-out"`

---

## Task 11: Full-suite + end-to-end verification

**Files:** none (verification + any fixups).

- [ ] **Step 1:** `pnpm test` — full suite green (existing 467 + new crypto tests). `pnpm type-check` clean. `pnpm lint` clean.
- [ ] **Step 2:** End-to-end manual smoke in `pnpm dev` with a real Postgres + `STORAGE_BACKEND` configured: fresh user → forced setup → wizard → migration → reports render → Lock → unlock (passphrase) → Lock → unlock (recovery) → sign-out → sign-in → unlock. Confirm Garage/local files are ciphertext (`LEJ1`) at rest and the app behaves identically to before once unlocked.
- [ ] **Step 3:** Confirm a NOT-yet-migrated user (no `userCrypto`) is redirected to setup and cannot reach app pages; confirm an unauthenticated user still goes to `/sign-in` (proxy unchanged).
- [ ] **Step 4: Commit** any fixups with appropriate `fix(crypto): …` messages.

---

## Out of scope for P2 (later)

- **P3:** Settings → Security (change passphrase, rotate recovery code, reset encryption).
- **Fast-follow:** passkey-PRF unlock (`passkeyPrfWrap` table + WebAuthn PRF).
- Deferred P1 Minors still open: add a 32-byte guard in `fileCrypto`; freeze the exported `MAGIC`. Fold these in during P2 if a crypto task touches `fileCrypto`; otherwise carry to P3.

## Self-Review

**Spec coverage (P2 slice of `2026-06-25-encrypted-journals-v2-design.md`):**
- Client-side DEK gen + Argon2id passphrase KEK + recovery-code HKDF + AES-GCM wrap/unwrap → Task 2. ✓
- Setup stores only opaque wraps (zero-knowledge) → Task 3. ✓
- Plaintext→ciphertext migration, idempotent → Task 4. ✓
- Unlock material + finalize → Task 5. ✓
- Gated routing (setup/unlock), data-layer backstop → Task 6. ✓
- Unlock orchestration + copy → Task 7. ✓
- Per-session unlock screen (au-*) → Task 8. ✓
- Gated onboarding wizard (Why → passphrase → recovery → encrypt), au-* design matching sign-in → Task 9. ✓
- Manual Lock + drop-on-sign-out → Task 10. ✓
- Recovery code shown once, copy/download, gated continue → Task 9 step 2/3. ✓

**Placeholder scan:** UI Tasks 8–9 intentionally specify fixed orchestration code + exact copy source + au-* acceptance rather than dictating full JSX (beautiful UI is iterative; implementer pairs with frontend-design). All logic/crypto/server/gate tasks carry complete code. No TBDs.

**Type consistency:** `generateDek`/`derivePassphraseKek`/`wrapDek`/`unwrapDek`/`recoveryHkdfKey`/`generateRecoveryCode`/`parseRecoveryCode`/`toBase64`/`fromBase64` (Task 2) consumed by Tasks 7 & 9; `setupCrypto` (Task 3) by Task 9; `enableEncryption` (Task 4) by `finalizeEncryption` (Task 5) by Task 9; `cryptoStatus`/`isCryptoPath` (Task 6) by the gate; `unlockWithPassphrase`/`unlockWithRecovery`/`postDek`/`lock` (Task 7) by Tasks 8/9/10. P1 imports (`DEK_BYTES`, `getUserCryptoRepository`, `getSessionDek`/`hasSessionDek`/`dropSessionDek`/`LockedError`, `encryptFile`/`isCiphertext`, `decodeDek` contract) referenced as they exist on `main`. ✓

**Known verification points for implementers (flagged, not placeholders):** (a) whether Vitest `node` env exposes `crypto.subtle` or the client-crypto test needs `jsdom` — Task 2 Step 4; (b) how the `journalService` singleton reaches the test DB / MemoryObjectStore in Task 4 — mirror the existing `service.test.ts`; (c) whether `hash-wasm` needs any turbopack WASM flag — Task 1 Step 3.
