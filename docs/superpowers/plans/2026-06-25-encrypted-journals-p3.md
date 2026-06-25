# Encrypted Journals — P3: Settings → Security — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax. The UI task pairs with frontend-design and the shadcn settings conventions.

**Goal:** Let a user manage their encryption from Settings → Security: change passphrase (with a recovery-code fallback for "forgot passphrase"), rotate the recovery code, and reset encryption (destructive).

**Architecture:** All re-wrapping is **client-side** and zero-knowledge: to change the passphrase or rotate the recovery code, the browser re-obtains the DEK by unwrapping it with the user's *current* passphrase (or recovery code) — exactly as unlock does — then wraps the same DEK under a new KEK and uploads only the new opaque wrap. The DEK never changes, so journal data is never re-encrypted. The server stores only opaque wraps; the in-RAM session DEK is unaffected by a re-wrap. Reset-encryption wipes the (now-unreadable) ciphertext journal + the `userCrypto` row and recreates an empty journal, without deleting the account.

**Tech Stack:** TypeScript, Next.js 16, WebCrypto + `hash-wasm` (reused from P2), Drizzle + Postgres, Vitest. UI in the shadcn system used by the rest of `/settings` (NOT au-*).

## Global Constraints

- **Zero-knowledge preserved:** the current/new passphrase and recovery code never leave the browser; only opaque wraps (+ salt + Argon params) are uploaded. Never log secrets/DEK/wraps. The DEK is re-obtained client-side by unwrapping with a user secret — the server never hands the DEK back.
- **The DEK never changes** across passphrase change / recovery rotation — only the wrap of it changes; no journal re-encryption.
- **Re-wrap requires proof of the current secret:** change-passphrase and rotate-recovery require the user to enter their current passphrase OR recovery code (to unwrap the DEK). A wrong secret fails the unwrap → friendly error, no server mutation.
- **Reuse P2 verbatim:** `getMaterial` (GET `/api/crypto/material` → `{passSalt, argonParams, wrapPassphrase, wrapRecovery}`), `derivePassphraseKek`, `recoveryHkdfKey`, `unwrapDek`, `wrapDek`, `generateRecoveryCode`, `parseRecoveryCode`, `toBase64`/`fromBase64` from `features/crypto/lib/`. `getUserCryptoRepository()` from `@/lib/crypto`. Argon params for new wraps: `{ m: 65536, t: 3, p: 1 }`, 16-byte salt.
- **Reset is destructive and irreversible:** it deletes the encrypted journal (unreadable without the key) + the `userCrypto` row → user returns to `cryptoStatus === 'unset'` and the gate routes them to `/crypto/setup`. Rate-limit with `DESTRUCTIVE`; gate behind a typed-confirmation dialog. **(Open decision — see end of plan: typed-confirmation vs the email-code flow used by account deletion.)**
- **Reset must NOT delete the user account** (unlike `purgeUserData`); model on it but stop short of `db.delete(user)`.
- Server actions: `requireUser` → rate-limit → validate → mutate → `revalidatePath('/', 'layout')` → discriminated result. Follow `features/settings/actions/setSavedBaseCurrency.ts`.
- **Test command:** `pnpm test`. **Type-check:** `pnpm type-check`. **Lint:** `pnpm lint`. Pre-commit husky + commitlint (lowercase subjects). No live dev env in the worktree (no `DATABASE_URL`) — UI visual + e2e acceptance is deferred to the user; verify in-worktree via tests + type-check + lint.

## File Structure

**Create:**
- `lib/crypto/rewrapSchema.ts` — Zod schemas for the change-passphrase / rotate-recovery payloads (shared with the actions).
- `features/crypto/lib/rewrapFlow.ts` — client orchestration: `obtainDek(authorizer)`, `changePassphrase(authorizer, newPassphrase)`, `rotateRecovery(authorizer)`.
- `lib/crypto/resetEncryption.ts` — server `resetUserEncryption(userId, db, deps?)` (clearRemote + rm dir + repo.delete + dropSessionDek + ensureLayout).
- `db/schema/encryptionResetChallenge.ts` (+ migration) and `lib/crypto/resetChallenge/` (repository + service + schema) — emailed-code challenge for reset, modelled on `lib/account-deletion/`.
- `features/settings/actions/changePassphrase.ts`, `rotateRecovery.ts`, `requestEncryptionReset.ts`, `confirmEncryptionReset.ts` — server actions.
- `features/settings/SecuritySection.tsx` (+ `ChangePassphraseCard.tsx`, `RotateRecoveryCard.tsx`, `ResetEncryptionCard.tsx`) — the Security UI.
- Tests alongside each.

**Modify:**
- `lib/crypto/userCryptoRepository.ts` — add `updateWrapPassphrase`, `updateWrapRecovery`, `delete`.
- `features/settings/actions/index.ts` — export the new actions.
- `features/settings/Settings.tsx` — render `<SecuritySection/>`.
- `app/settings/page.tsx` — pass whether the user is encryption-enabled (so the Security section renders only when set up).

---

## Task 1: `userCryptoRepository` re-wrap + delete methods

**Files:** Modify `lib/crypto/userCryptoRepository.ts`; extend `lib/crypto/userCryptoRepository.test.ts`.

**Interfaces — Produces:**
- `updateWrapPassphrase(userId: string, wrapPassphrase: string, passSalt: string, argonParams: ArgonParams): Promise<void>`
- `updateWrapRecovery(userId: string, wrapRecovery: string): Promise<void>` (also bumps `recoveryCreatedAt` to now)
- `delete(userId: string): Promise<void>`

- [ ] **Step 1: Write the failing tests** (append to the existing describe in `userCryptoRepository.test.ts`)

```ts
it('updateWrapPassphrase replaces the passphrase wrap fields', async () => {
  await repo.create({
    userId: 'alice', wrapPassphrase: 'w1', passSalt: 's1',
    argonParams: { m: 65536, t: 3, p: 1 }, wrapRecovery: 'r1',
  });
  await repo.updateWrapPassphrase('alice', 'w2', 's2', { m: 19456, t: 2, p: 1 });
  const row = await repo.get('alice');
  expect(row?.wrapPassphrase).toBe('w2');
  expect(row?.passSalt).toBe('s2');
  expect(row?.argonParams).toEqual({ m: 19456, t: 2, p: 1 });
  expect(row?.wrapRecovery).toBe('r1'); // recovery wrap untouched
});

it('updateWrapRecovery replaces the recovery wrap and bumps recoveryCreatedAt', async () => {
  await repo.create({
    userId: 'alice', wrapPassphrase: 'w1', passSalt: 's1',
    argonParams: { m: 65536, t: 3, p: 1 }, wrapRecovery: 'r1',
  });
  const before = (await repo.get('alice'))!.recoveryCreatedAt;
  await repo.updateWrapRecovery('alice', 'r2');
  const row = await repo.get('alice');
  expect(row?.wrapRecovery).toBe('r2');
  expect(row?.wrapPassphrase).toBe('w1'); // passphrase wrap untouched
  expect(row!.recoveryCreatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
});

it('delete removes the row', async () => {
  await repo.create({
    userId: 'alice', wrapPassphrase: 'w1', passSalt: 's1',
    argonParams: { m: 65536, t: 3, p: 1 }, wrapRecovery: 'r1',
  });
  await repo.delete('alice');
  expect(await repo.exists('alice')).toBe(false);
});
```

- [ ] **Step 2: Run — expect FAIL** `pnpm test lib/crypto/userCryptoRepository.test.ts`.

- [ ] **Step 3: Implement** — add to `UserCryptoRepository` (import `ArgonParams` from `@/db/schema/userCrypto`; `eq`/`userCrypto` already imported):

```ts
async updateWrapPassphrase(
  userId: string,
  wrapPassphrase: string,
  passSalt: string,
  argonParams: ArgonParams
): Promise<void> {
  await this.db
    .update(userCrypto)
    .set({ wrapPassphrase, passSalt, argonParams })
    .where(eq(userCrypto.userId, userId));
}

async updateWrapRecovery(userId: string, wrapRecovery: string): Promise<void> {
  await this.db
    .update(userCrypto)
    .set({ wrapRecovery, recoveryCreatedAt: new Date() })
    .where(eq(userCrypto.userId, userId));
}

async delete(userId: string): Promise<void> {
  await this.db.delete(userCrypto).where(eq(userCrypto.userId, userId));
}
```

- [ ] **Step 4: Run — expect PASS**, then **Commit** `git add lib/crypto/userCryptoRepository.ts lib/crypto/userCryptoRepository.test.ts && git commit -m "feat(crypto): userCrypto re-wrap + delete repository methods"`

---

## Task 2: Client re-wrap orchestration (`features/crypto/lib/rewrapFlow.ts`)

**Files:** Create `features/crypto/lib/rewrapFlow.ts`, `features/crypto/lib/rewrapFlow.test.ts`.

**Interfaces — Produces:**
- `type Authorizer = { kind: 'passphrase'; passphrase: string } | { kind: 'recovery'; code: string }`
- `obtainDek(authorizer: Authorizer): Promise<Uint8Array>` — fetch material, derive KEK from the authorizer, unwrap the DEK. Throws `'Incorrect passphrase.'` / `'Incorrect recovery code.'` on failure.
- `changePassphrase(authorizer: Authorizer, newPassphrase: string): Promise<{ wrapPassphrase: string; passSalt: string; argonParams: {m:number;t:number;p:number} }>` — obtain DEK, derive new KEK, wrap, return the new wrap material (the caller posts it via the action).
- `rotateRecovery(authorizer: Authorizer): Promise<{ wrapRecovery: string; code: string }>` — obtain DEK, generate a new recovery code, wrap, return `{ wrapRecovery, code }` (code shown once).

- [ ] **Step 1: Write the failing test** (build the material fixture with a REAL clientCrypto round-trip so unwrap is genuinely exercised; mock `fetch` for `getMaterial`)

```ts
// features/crypto/lib/rewrapFlow.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  derivePassphraseKek, fromBase64, generateDek, generateRecoveryCode,
  recoveryHkdfKey, toBase64, unwrapDek, wrapDek,
} from './clientCrypto';
import { changePassphrase, obtainDek, rotateRecovery } from './rewrapFlow';

const ARGON = { m: 512, t: 2, p: 1 };

async function fixtureMaterial(dek: Uint8Array, passphrase: string, recoveryBytes: Uint8Array) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const wrapPassphrase = await wrapDek(dek, await derivePassphraseKek(passphrase, salt, ARGON));
  const wrapRecovery = await wrapDek(dek, await recoveryHkdfKey(recoveryBytes));
  return { passSalt: toBase64(salt), argonParams: ARGON, wrapPassphrase, wrapRecovery };
}
function stubFetch(material: unknown) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url === '/api/crypto/material') return new Response(JSON.stringify(material), { status: 200 });
    return new Response(null, { status: 204 }); // unused here
  }));
}
afterEach(() => vi.unstubAllGlobals());

describe('rewrapFlow', () => {
  it('obtainDek returns the DEK for a correct passphrase', async () => {
    const dek = generateDek();
    const { code, bytes } = generateRecoveryCode();
    stubFetch(await fixtureMaterial(dek, 'right', bytes));
    const out = await obtainDek({ kind: 'passphrase', passphrase: 'right' });
    expect([...out]).toEqual([...dek]);
    void code;
  });

  it('obtainDek throws on a wrong passphrase', async () => {
    const dek = generateDek();
    const { bytes } = generateRecoveryCode();
    stubFetch(await fixtureMaterial(dek, 'right', bytes));
    await expect(obtainDek({ kind: 'passphrase', passphrase: 'wrong' })).rejects.toThrow('Incorrect passphrase.');
  });

  it('changePassphrase produces a wrap the new passphrase can unwrap to the same DEK', async () => {
    const dek = generateDek();
    const { bytes } = generateRecoveryCode();
    stubFetch(await fixtureMaterial(dek, 'old', bytes));
    const next = await changePassphrase({ kind: 'passphrase', passphrase: 'old' }, 'brand-new');
    const kek = await derivePassphraseKek('brand-new', fromBase64(next.passSalt), next.argonParams);
    expect([...(await unwrapDek(next.wrapPassphrase, kek))]).toEqual([...dek]);
  });

  it('rotateRecovery produces a new code+wrap that unwraps the same DEK', async () => {
    const dek = generateDek();
    const { bytes } = generateRecoveryCode();
    stubFetch(await fixtureMaterial(dek, 'pw', bytes));
    const { wrapRecovery, code } = await rotateRecovery({ kind: 'passphrase', passphrase: 'pw' });
    const { parseRecoveryCode } = await import('./clientCrypto');
    const kek = await recoveryHkdfKey(parseRecoveryCode(code));
    expect([...(await unwrapDek(wrapRecovery, kek))]).toEqual([...dek]);
  });
});
```

- [ ] **Step 2: Run — expect FAIL** `pnpm test features/crypto/lib/rewrapFlow.test.ts`.

- [ ] **Step 3: Implement**

```ts
// features/crypto/lib/rewrapFlow.ts
import {
  derivePassphraseKek, generateRecoveryCode, parseRecoveryCode,
  recoveryHkdfKey, toBase64, unwrapDek, wrapDek, fromBase64,
} from './clientCrypto';

const ARGON = { m: 65536, t: 3, p: 1 } as const;

type Material = {
  passSalt: string;
  argonParams: { m: number; t: number; p: number };
  wrapPassphrase: string;
  wrapRecovery: string;
};

export type Authorizer =
  | { kind: 'passphrase'; passphrase: string }
  | { kind: 'recovery'; code: string };

const getMaterial = async (): Promise<Material> => {
  const res = await fetch('/api/crypto/material');
  if (!res.ok) throw new Error('Encryption is not set up.');
  return res.json();
};

/** Re-obtain the DEK client-side by unwrapping with the current secret. */
export const obtainDek = async (authorizer: Authorizer): Promise<Uint8Array> => {
  const m = await getMaterial();
  if (authorizer.kind === 'passphrase') {
    const kek = await derivePassphraseKek(authorizer.passphrase, fromBase64(m.passSalt), m.argonParams);
    return unwrapDek(m.wrapPassphrase, kek).catch(() => {
      throw new Error('Incorrect passphrase.');
    });
  }
  const kek = await recoveryHkdfKey(parseRecoveryCode(authorizer.code));
  return unwrapDek(m.wrapRecovery, kek).catch(() => {
    throw new Error('Incorrect recovery code.');
  });
};

export const changePassphrase = async (
  authorizer: Authorizer,
  newPassphrase: string
): Promise<{ wrapPassphrase: string; passSalt: string; argonParams: { m: number; t: number; p: number } }> => {
  const dek = await obtainDek(authorizer);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const wrapPassphrase = await wrapDek(dek, await derivePassphraseKek(newPassphrase, salt, ARGON));
  return { wrapPassphrase, passSalt: toBase64(salt), argonParams: { ...ARGON } };
};

export const rotateRecovery = async (
  authorizer: Authorizer
): Promise<{ wrapRecovery: string; code: string }> => {
  const dek = await obtainDek(authorizer);
  const { code, bytes } = generateRecoveryCode();
  const wrapRecovery = await wrapDek(dek, await recoveryHkdfKey(bytes));
  return { wrapRecovery, code };
};
```

- [ ] **Step 4: Run — expect PASS**, then **Commit** `git add features/crypto/lib/rewrapFlow.ts features/crypto/lib/rewrapFlow.test.ts && git commit -m "feat(crypto): client re-wrap orchestration (change passphrase, rotate recovery)"`

---

## Task 3: Change-passphrase + rotate-recovery server actions

**Files:** Create `lib/crypto/rewrapSchema.ts`, `features/settings/actions/changePassphrase.ts`, `features/settings/actions/rotateRecovery.ts`, and a test for each; modify `features/settings/actions/index.ts`.

**Interfaces — Produces:**
- `changePassphraseAction(input): Promise<{ ok: true } | { ok: false; message: string }>` — validates `{wrapPassphrase, passSalt, argonParams}`, `requireUser`, `WRITE` rate-limit, requires an existing `userCrypto` row, calls `updateWrapPassphrase`, `revalidatePath`.
- `rotateRecoveryAction(input): Promise<{ ok: true } | { ok: false; message: string }>` — validates `{wrapRecovery}`, same gating, calls `updateWrapRecovery`.

- [ ] **Step 1: Schema**

```ts
// lib/crypto/rewrapSchema.ts
import { z } from 'zod';

const b64 = z.string().regex(/^[A-Za-z0-9+/]+={0,2}$/).min(1).max(512);
export const changePassphraseSchema = z.object({
  wrapPassphrase: b64,
  passSalt: z.string().regex(/^[A-Za-z0-9+/]+={0,2}$/).min(1).max(64),
  argonParams: z.object({
    m: z.number().int().positive(),
    t: z.number().int().positive(),
    p: z.number().int().positive(),
  }),
});
export const rotateRecoverySchema = z.object({ wrapRecovery: b64 });
```

- [ ] **Step 2: Failing tests** (mirror `setupCrypto.test.ts`: `setupTestDb`, mock `requireUser` + `getUserCryptoRepository` to a test-DB-backed repo; assert the row's wrap fields change, and that a missing row / malformed payload is rejected). Write one test file per action. Example assertions: after `repo.create(...)`, calling `changePassphraseAction(valid)` updates `wrapPassphrase`/`passSalt`/`argonParams`; calling it for a user with no row returns `{ok:false}`.

- [ ] **Step 3: Implement actions**

```ts
// features/settings/actions/changePassphrase.ts
'use server';
import { requireUser } from '@/lib/auth/require-user';
import { getUserCryptoRepository } from '@/lib/crypto';
import { changePassphraseSchema } from '@/lib/crypto/rewrapSchema';
import { rateLimit, WRITE, RATE_LIMIT_MESSAGE } from '@/lib/rate-limit';
import { revalidatePath } from 'next/cache';

type Result = { ok: true } | { ok: false; message: string };

export async function changePassphraseAction(input: unknown): Promise<Result> {
  const user = await requireUser();
  if (!rateLimit(WRITE, user.id).allowed) return { ok: false, message: RATE_LIMIT_MESSAGE };
  const parsed = changePassphraseSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: 'Invalid request.' };
  const repo = getUserCryptoRepository();
  if (!(await repo.exists(user.id))) return { ok: false, message: 'Encryption is not set up.' };
  await repo.updateWrapPassphrase(user.id, parsed.data.wrapPassphrase, parsed.data.passSalt, parsed.data.argonParams);
  revalidatePath('/', 'layout');
  return { ok: true };
}
```

```ts
// features/settings/actions/rotateRecovery.ts
'use server';
import { requireUser } from '@/lib/auth/require-user';
import { getUserCryptoRepository } from '@/lib/crypto';
import { rotateRecoverySchema } from '@/lib/crypto/rewrapSchema';
import { rateLimit, WRITE, RATE_LIMIT_MESSAGE } from '@/lib/rate-limit';
import { revalidatePath } from 'next/cache';

type Result = { ok: true } | { ok: false; message: string };

export async function rotateRecoveryAction(input: unknown): Promise<Result> {
  const user = await requireUser();
  if (!rateLimit(WRITE, user.id).allowed) return { ok: false, message: RATE_LIMIT_MESSAGE };
  const parsed = rotateRecoverySchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: 'Invalid request.' };
  const repo = getUserCryptoRepository();
  if (!(await repo.exists(user.id))) return { ok: false, message: 'Encryption is not set up.' };
  await repo.updateWrapRecovery(user.id, parsed.data.wrapRecovery);
  revalidatePath('/', 'layout');
  return { ok: true };
}
```

Export both from `features/settings/actions/index.ts`.

- [ ] **Step 4: Run tests — expect PASS**, type-check, **Commit** `git add lib/crypto/rewrapSchema.ts features/settings/actions/changePassphrase.ts features/settings/actions/rotateRecovery.ts features/settings/actions/*.test.ts features/settings/actions/index.ts && git commit -m "feat(crypto): change-passphrase + rotate-recovery server actions"`

---

## Task 4: Reset-encryption — wipe service (`resetUserEncryption`)

**Files:** Create `lib/crypto/resetEncryption.ts`, `lib/crypto/resetEncryption.test.ts`.

**Interfaces — Produces:**
- `resetUserEncryption(userId: string, db: DbInstance, deps?: {...}): Promise<void>` — `clearRemote(userId)` + `fs.rm(getJournalDir(userId), {recursive,force})` + `userCryptoRepository.delete(userId)` (via a repo bound to `db`) + `dropSessionDek(userId)` + `journalRepository.ensureLayout(userId)` (recreate empty stub). Inject `clearRemote`/`removeLocalJournal` for tests (mirror `purgeUserData`'s `PurgeDeps`).

- [ ] **Step 1: Failing test for `resetUserEncryption`** (setupTestDb; create a userCrypto row + a journal dir; inject a fake `clearRemote`/`removeLocalJournal`; assert the row is gone, the injected wipes were called, the DEK dropped, and an empty stub journal exists afterward).

- [ ] **Step 2: Implement `resetUserEncryption`**

```ts
// lib/crypto/resetEncryption.ts
import { promises as fs } from 'fs';
import { UserCryptoRepository } from './userCryptoRepository';
import { dropSessionDek } from './sessionKeys';
import { clearRemote as clearRemoteDefault } from '@/lib/storage/sync';
import { getJournalDir } from '@/lib/journal/layout';
import { journalRepository } from '@/lib/journal';
import type { DbInstance } from '@/lib/db/connection';

type ResetDeps = {
  clearRemote?: (userId: string) => Promise<void>;
  removeLocalJournal?: (userId: string) => Promise<void>;
};

export async function resetUserEncryption(
  userId: string,
  db: DbInstance,
  deps: ResetDeps = {}
): Promise<void> {
  const clearRemote = deps.clearRemote ?? clearRemoteDefault;
  const removeLocalJournal =
    deps.removeLocalJournal ??
    ((id: string) => fs.rm(getJournalDir(id), { recursive: true, force: true }));

  await clearRemote(userId);                      // wipe encrypted objects in Garage
  await removeLocalJournal(userId);               // wipe local working dir
  await new UserCryptoRepository(db).delete(userId); // remove crypto metadata → status 'unset'
  dropSessionDek(userId);                         // clear any in-RAM DEK
  await journalRepository.ensureLayout(userId);   // recreate an empty plaintext stub
}
```

> **Note for reviewer:** order matters — delete the `userCrypto` row (so `cryptoStatus` is `'unset'`) and drop the DEK; `ensureLayout` recreates a plaintext stub so the (now un-encrypted) account renders an empty journal and the gate routes to `/crypto/setup`. Deleting the row also clears `migratedAt`.

- [ ] **Step 3: Run — expect PASS**, **Commit** `git add lib/crypto/resetEncryption.ts lib/crypto/resetEncryption.test.ts && git commit -m "feat(crypto): resetUserEncryption wipe service (keeps account)"`

---

## Task 4b: Reset-encryption — emailed-code challenge + actions

**Decision (locked):** reset is guarded by an **emailed 6-digit code**, equal in strength to account deletion. Build a **parallel, self-contained** challenge modelled on `lib/account-deletion/` — do NOT reuse `accountDeletionChallenge` (a deletion code must not authorize a reset) and do NOT modify the shipped account-deletion feature.

**Files:** Create `db/schema/encryptionResetChallenge.ts` (+ barrel export + drizzle migration), `lib/crypto/resetChallenge/` (`repository.ts`, `service.ts`, `schema.ts`, `index.ts` + tests), `features/settings/actions/requestEncryptionReset.ts`, `features/settings/actions/confirmEncryptionReset.ts` (+ tests); modify `features/settings/actions/index.ts`.

**Model precisely on these existing files** (read them; mirror structure, hashing, expiry, attempt-cap, and the email transport):
- `db/schema/accountDeletionChallenge.ts` → `encryptionResetChallenge` (identical columns: `userId` PK→user cascade, `codeHash`, `expiresAt`, `attempts`, `createdAt`).
- `lib/account-deletion/{schema.ts,repository.ts,service.ts}` → the reset-challenge schema (6-digit `resetCodeSchema`), repository (upsert challenge / get / increment attempts / delete), and service (`requestReset` = generate code → hash → upsert → email; `verifyAndReset` = load → check expiry/attempts/hash → on success call `resetUserEncryption(userId, db)` from Task 4 → delete challenge; on failure increment attempts, return remaining). Reuse the SAME pure code-gen + hashing helpers account-deletion uses (import them if exported; otherwise mirror).
- `features/settings/actions/requestAccountDeletion.ts` + `deleteAccount.ts` → `requestEncryptionResetAction()` (`requireUser`, `DESTRUCTIVE` rate-limit, require a `userCrypto` row exists, call `resetChallengeService.requestReset(user.id, user.email)`) and `confirmEncryptionResetAction(code)` (`requireUser`, `DESTRUCTIVE` rate-limit, validate code, call `verifyAndReset` → returns `{ ok:true } | { ok:false, reason:'too-many-attempts'|'invalid'|'not-set-up', remaining? }`). `revalidatePath('/', 'layout')` after a successful reset.

- [ ] **Step 1:** Create the `encryptionResetChallenge` schema (mirror `accountDeletionChallenge.ts`), export from `db/schema/index.ts`, add to `drizzle.config.ts` `tablesFilter`, run `pnpm db:generate`, confirm the migration creates only that table.
- [ ] **Step 2:** Write the reset-challenge schema/repository/service with failing tests first, mirroring `lib/account-deletion/` (request → hashed code stored + emailed; verify → expiry/attempt/hash checks → `resetUserEncryption` on success). Use the injected-deps pattern from `account-deletion/service.test.ts` so tests don't send real email and don't wipe real storage.
- [ ] **Step 3:** Write the two actions with tests (mock `requireUser`; assert request is gated on an existing `userCrypto` row + rate-limited; confirm rejects bad/expired codes and, on a valid code, invokes the reset).
- [ ] **Step 4:** Run tests + type-check, **Commit** `git add db/schema/encryptionResetChallenge.ts db/schema/index.ts drizzle.config.ts db/migrations lib/crypto/resetChallenge features/settings/actions/requestEncryptionReset.ts features/settings/actions/confirmEncryptionReset.ts features/settings/actions/*.test.ts features/settings/actions/index.ts && git commit -m "feat(crypto): emailed-code challenge for reset-encryption"`

---

## Task 5: Settings → Security UI

**Files:** Create `features/settings/SecuritySection.tsx` + `ChangePassphraseCard.tsx` + `RotateRecoveryCard.tsx` + `ResetEncryptionCard.tsx`; modify `features/settings/Settings.tsx` + `app/settings/page.tsx`.

**Design task — shadcn (match the existing `Settings.tsx`/`DangerZone.tsx` conventions, NOT au-*). Pair with frontend-design for polish.**

- [ ] **Step 1:** `app/settings/page.tsx` — also fetch `cryptoStatus(user.id)` (from `@/lib/crypto/gate`) or `getUserCryptoRepository().exists(user.id)` and pass `encryptionEnabled` to `<Settings>`. (When `false`, the Security section can show a short "encryption not set up" note or hide — but in practice the gate forces setup, so an authenticated settings visitor is always enabled; render the section when enabled.)
- [ ] **Step 2:** `Settings.tsx` — render `<SecuritySection enabled={encryptionEnabled} />` below the base-currency card and above `<DangerZone/>`.
- [ ] **Step 3:** `SecuritySection.tsx` — a `<Card>` titled "Security" containing the three cards/sub-forms:
  - **ChangePassphraseCard** — fields: current passphrase (with a "Forgot? use recovery code" toggle that swaps to a recovery-code field), new passphrase + confirm (match + min-length, reuse the wizard's strength hint if cheap). On submit: build the authorizer, call `changePassphrase(authorizer, newPassphrase)` (Task 2), then `changePassphraseAction(result)` (Task 3); show success/error via `Alert`/toast. Errors from `obtainDek` ("Incorrect passphrase." / "Incorrect recovery code.") surface inline.
  - **RotateRecoveryCard** — authorizer field (current passphrase, with recovery toggle) → on submit call `rotateRecovery(authorizer)` then `rotateRecoveryAction({wrapRecovery})`; on success display the NEW recovery code once (grouped, copy + download, like the wizard's recovery step) with a "I've saved it" acknowledgement.
  - **ResetEncryptionCard** — a destructive card modelled on `DangerZone`'s **two-phase emailed-code** flow: explains it permanently deletes the encrypted journal and cannot be undone; "Reset encryption" → calls `requestEncryptionResetAction()` (emails a code) → reveals a 6-digit code input + Resend; on confirm calls `confirmEncryptionResetAction(code)`; on success `window.location.assign('/crypto/setup')` (hard nav so the gate re-routes). Surface `too-many-attempts`/`invalid`/remaining-attempts inline like `DangerZone`.
- [ ] **Step 4: Verify (no live env):** `pnpm type-check` clean, `pnpm lint` clean, `pnpm test` (full suite — confirm no regression from the settings-page change). The live visual + e2e acceptance (each flow against a real unlocked session) is the user's pass — note it in the report.
- [ ] **Step 5: Commit** `git add features/settings/SecuritySection.tsx features/settings/ChangePassphraseCard.tsx features/settings/RotateRecoveryCard.tsx features/settings/ResetEncryptionCard.tsx features/settings/Settings.tsx app/settings/page.tsx && git commit -m "feat(crypto): settings security section (change passphrase, rotate recovery, reset)"`

---

## Task 6: Full-suite + acceptance handoff

- [ ] **Step 1:** `pnpm test` (full suite green), `pnpm type-check`, `pnpm lint` clean.
- [ ] **Step 2:** End-to-end manual smoke (USER, live env): change passphrase (via current, and via recovery "forgot" path) → re-unlock with the new passphrase; rotate recovery → old code rejected, new code unlocks; reset encryption → journal wiped, routed to `/crypto/setup`, can re-set-up. Confirm the DEK/journal data integrity (a passphrase change does NOT re-encrypt or corrupt the journal — reports render identically after).
- [ ] **Step 3:** Commit any fixups (`fix(crypto): …`).

---

## Resolved decision

**Reset-encryption confirmation = emailed 6-digit code** (locked by the user) — equal in strength to account deletion. Implemented as a parallel, self-contained challenge in Task 4b (do not reuse the account-deletion challenge; do not modify account deletion).

## Out of scope (later)

- Passkey-PRF unlock (the remaining fast-follow): add/remove passkey would also belong in this Security section once PRF lands.

## Self-Review

**Spec coverage (P3 slice of the v2 design):** change passphrase → Tasks 2/3/5; forgot-passphrase (recovery) → folded into change-passphrase's recovery authorizer (Tasks 2/5); rotate recovery code → Tasks 2/3/5; reset encryption (emailed-code, wipe-but-keep-account) → Tasks 4 (wipe service) + 4b (challenge + actions) + 5 (two-phase card). Re-wrap keeps the DEK unchanged (no journal re-encryption) → Task 2 design. ✓

**Placeholder scan:** Task 3 Step 2 and Task 4 Steps 1/3 describe test/impl shape with concrete assertions and full action code; the UI task specifies fixed orchestration (which client+action functions each card calls) + shadcn acceptance rather than full JSX (iterative UI, paired with frontend-design). No TBDs.

**Type consistency:** `updateWrapPassphrase`/`updateWrapRecovery`/`delete` (Task 1) consumed by Tasks 3/4; `obtainDek`/`changePassphrase`/`rotateRecovery`/`Authorizer` (Task 2) consumed by Task 5; `changePassphraseAction`/`rotateRecoveryAction` (Task 3) + `resetEncryptionAction` (Task 4) consumed by Task 5; reuses P2's `clientCrypto`/`getMaterial`, `getUserCryptoRepository`, `dropSessionDek`, `clearRemote`, `getJournalDir`, `journalRepository.ensureLayout`, `purgeUserData`-style `PurgeDeps` injection — all as they exist on the P2 branch (incl. the user's `migratedAt` additions; reset deletes the row so `migratedAt` is cleared with it). ✓

**Verification points for implementers:** (a) confirm `journalRepository` is exported from `@/lib/journal` and `ensureLayout` recreates the stub; (b) confirm the `DbInstance` reachable by `resetEncryptionAction` (production `db` from `@/lib/db`) and how the singleton is exercised in the action test (mirror `setupCrypto.test.ts` / `purge` tests).
