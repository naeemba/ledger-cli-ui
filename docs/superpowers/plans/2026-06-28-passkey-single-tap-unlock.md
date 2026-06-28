# Single-tap passkey login + journal unlock — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make one passkey tap perform both login and encrypted-journal unlock, by capturing the PRF output during the login WebAuthn ceremony using a fixed salt.

**Architecture:** Switch the PRF eval salt from a per-passkey random value (stored server-side, fetched after auth) to a fixed versioned constant known at build time. This lets the login `signIn.passkey()` ceremony request PRF and return its output, which is fed into the existing `derivePrfKek → unwrapDek → postDek` pipeline before redirect. The per-passkey `prfSalt` column/field is removed everywhere. Unlock is best-effort: any failure falls back to today's passphrase/standalone-passkey unlock.

**Tech Stack:** Next.js, TypeScript, better-auth + `@better-auth/passkey` 1.6.10, `@simplewebauthn/browser`, drizzle-orm (Postgres), vitest, WebCrypto (HKDF/AES-GCM).

## Global Constraints

- No self-reference in any artifact (no "Claude"/"Anthropic"/AI mentions in code, comments, commits). Verbatim from user global instructions.
- No `Co-Authored-By` / "Generated with" trailers in commits.
- Fixed PRF salt value: `ledger-prf-v1` (UTF-8 bytes). The HKDF info `ledger-passkey-v1` in `derivePrfKek` is unchanged and remains the domain separator.
- Zero-knowledge invariant preserved: server stores only opaque blobs and never unwraps; the DEK and PRF output exist only client-side except where already POSTed to `/api/crypto/unlock`.
- Passkey login stays a **modal** prompt (no `autoFill` / conditional UI) so PRF is reliably returned.
- TDD, DRY, YAGNI, frequent commits.

---

## File Structure

- `features/crypto/lib/clientCrypto.ts` — add `PRF_SALT` constant (Task 1).
- `features/crypto/lib/webauthn.ts` — assertions use the fixed salt; drop salt params (Task 2).
- `features/crypto/lib/passkeyFlow.ts` — `EnablePasskeyInput` drops `prfSalt`; new `unlockWithPrfOutput` + `tryUnlockFromWebAuthn`; `unlockWithPasskey`/`buildPasskeyWrap` refactored (Task 2).
- `lib/crypto/passkeyWrapSchema.ts`, `lib/crypto/setupSchema.ts`, `lib/crypto/passkeyWrapRepository.ts`, `features/crypto/actions/enablePasskeyUnlock.ts`, `app/api/crypto/material/route.ts` — drop `prfSalt` (Task 2).
- `db/schema/cryptoPasskeyWrap.ts` + generated migration — drop column, wipe stale rows (Task 3).
- `features/auth/AuthForm.tsx` — single-tap wiring (Task 4).
- Tests co-located with each (`*.test.ts`/`*.test.tsx`).

---

## Task 1: Fixed PRF salt constant

**Files:**
- Modify: `features/crypto/lib/clientCrypto.ts`
- Test: `features/crypto/lib/clientCrypto.test.ts` (create if absent; otherwise append)

**Interfaces:**
- Produces: `export const PRF_SALT: Uint8Array` — the fixed PRF eval input, used by `webauthn.ts` and `AuthForm.tsx`.

- [ ] **Step 1: Write the failing test**

Append to `features/crypto/lib/clientCrypto.test.ts` (create the file with this content if it does not exist):

```ts
import { describe, it, expect } from 'vitest';
import { PRF_SALT } from './clientCrypto';

describe('PRF_SALT', () => {
  it('is the fixed versioned salt bytes', () => {
    expect(new TextDecoder().decode(PRF_SALT)).toBe('ledger-prf-v1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run features/crypto/lib/clientCrypto.test.ts`
Expected: FAIL — `PRF_SALT` is not exported.

- [ ] **Step 3: Add the constant**

In `features/crypto/lib/clientCrypto.ts`, directly below the existing `PASSKEY_INFO` line (around line 5), add:

```ts
/**
 * Fixed PRF eval input for passkey-derived KEKs. Not a secret and not entropy:
 * the PRF output is already uniquely bound to (authenticator secret, rpId) by the
 * hardware, and domain separation is handled by derivePrfKek's HKDF info. A fixed
 * value lets the login ceremony request PRF without a pre-auth salt fetch. The
 * version suffix leaves a rotation handle.
 */
export const PRF_SALT: Uint8Array = new TextEncoder().encode('ledger-prf-v1');
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run features/crypto/lib/clientCrypto.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add features/crypto/lib/clientCrypto.ts features/crypto/lib/clientCrypto.test.ts
git commit -m "feat(crypto): add fixed PRF salt constant"
```

---

## Task 2: Switch to fixed salt and drop prfSalt end-to-end

This is one atomic refactor: removing the `prfSalt` field changes a type
(`PasskeyMaterial`, `EnablePasskeyInput`) that flows through client and server, so
all sites move together to keep the tree compiling. It commits in sub-steps but is
one reviewer gate.

**Files:**
- Modify: `features/crypto/lib/webauthn.ts`, `features/crypto/lib/webauthn.test.ts`
- Modify: `features/crypto/lib/passkeyFlow.ts`, `features/crypto/lib/passkeyFlow.test.ts`
- Modify: `lib/crypto/passkeyWrapSchema.ts`
- Modify: `lib/crypto/setupSchema.ts`
- Modify: `lib/crypto/passkeyWrapRepository.ts`, `lib/crypto/passkeyWrapRepository.test.ts`
- Modify: `features/crypto/actions/enablePasskeyUnlock.ts`, `features/crypto/actions/passkeyUnlock.test.ts`
- Modify: `app/api/crypto/material/route.ts`, `app/api/crypto/material/route.test.ts`

**Interfaces:**
- Consumes: `PRF_SALT` from `clientCrypto` (Task 1).
- Produces:
  - `assertPrfForCredential(credentialId: string): Promise<PrfAssertion>` (salt param removed)
  - `assertPrfAny(credentialIds: string[]): Promise<PrfAssertion>` (per-cred salt removed)
  - `unlockWithPrfOutput(credentialId: string, prfOutput: Uint8Array): Promise<void>`
  - `tryUnlockFromWebAuthn(webauthn: WebAuthnResult | undefined): Promise<void>` where
    `WebAuthnResult = { response: { id: string }; clientExtensionResults: { prf?: { results?: { first?: BufferSource } } } }`
  - `EnablePasskeyInput = { credentialId: string; wrap: string; label: string }` (no `prfSalt`)
  - `PasskeyMaterial = { credentialId: string; wrap: string }` (no `prfSalt`)

### 2a. webauthn.ts — fixed salt

- [ ] **Step 1: Update the failing tests**

In `features/crypto/lib/webauthn.test.ts`: change the `assertPrfForCredential` calls to drop the salt arg, change `assertPrfAny` to take a string array, and assert the fixed salt is sent. Replace the `assertPrfForCredential` and `assertPrfAny` describe blocks with:

```ts
import { PRF_SALT } from './clientCrypto';

describe('assertPrfForCredential', () => {
  it('returns the PRF output and sends the fixed salt', async () => {
    const out = new Uint8Array(32).fill(7).buffer;
    let opts: CredentialRequestOptions | undefined;
    stubGet((o) => {
      opts = o;
      return fakeCred('cred-A', out);
    });
    const res = await assertPrfForCredential('cred-A');
    expect(res.credentialId).toBe('cred-A');
    expect(res.prfOutput).toHaveLength(32);
    const first = new Uint8Array(
      opts!.publicKey!.extensions!.prf!.eval!.first as ArrayBuffer
    );
    expect(Array.from(first)).toEqual(Array.from(PRF_SALT));
  });

  it('throws a clear error when PRF is unsupported', async () => {
    stubGet(() => fakeCred('cred-A', undefined));
    await expect(assertPrfForCredential('cred-A')).rejects.toThrow(
      /does not support/i
    );
  });

  it('throws when the prompt is dismissed (null credential)', async () => {
    stubGet(() => null);
    await expect(assertPrfForCredential('cred-A')).rejects.toThrow(/dismissed/i);
  });
});

describe('assertPrfAny', () => {
  it('identifies which credential answered and returns its PRF output', async () => {
    const out = new Uint8Array(32).fill(9).buffer;
    stubGet(() => fakeCred('cred-B', out));
    const res = await assertPrfAny(['cred-A', 'cred-B']);
    expect(res.credentialId).toBe('cred-B');
    expect(res.prfOutput).toHaveLength(32);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run features/crypto/lib/webauthn.test.ts`
Expected: FAIL — argument/signature mismatch.

- [ ] **Step 3: Rewrite webauthn.ts assertions**

Replace the body of `features/crypto/lib/webauthn.ts` from the import line and the two `assertPrf*` functions with:

```ts
import { PRF_SALT } from './clientCrypto';

export const base64urlToBytes = (s: string): Uint8Array<ArrayBuffer> => {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const b64 = (s + pad).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(b64), (c) =>
    c.charCodeAt(0)
  ) as Uint8Array<ArrayBuffer>;
};

export type PrfAssertion = { credentialId: string; prfOutput: Uint8Array };

const readPrf = (cred: PublicKeyCredential): Uint8Array => {
  const first = cred.getClientExtensionResults().prf?.results?.first;
  if (!first) throw new Error('This device does not support passkey unlock.');
  return new Uint8Array(first as ArrayBuffer);
};

const prfExtensions = () => ({
  prf: { eval: { first: PRF_SALT as unknown as BufferSource } },
});

/** Single-credential PRF assertion — used when enabling a specific passkey. */
export const assertPrfForCredential = async (
  credentialId: string
): Promise<PrfAssertion> => {
  const cred = (await navigator.credentials.get({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      allowCredentials: [
        { id: base64urlToBytes(credentialId), type: 'public-key' },
      ],
      userVerification: 'required',
      extensions: prfExtensions(),
    },
  })) as PublicKeyCredential | null;
  if (!cred) throw new Error('Passkey prompt was dismissed.');
  return { credentialId, prfOutput: readPrf(cred) };
};

/** Multi-credential PRF assertion — used by the standalone unlock screen. */
export const assertPrfAny = async (
  credentialIds: string[]
): Promise<PrfAssertion> => {
  const cred = (await navigator.credentials.get({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      allowCredentials: credentialIds.map((id) => ({
        id: base64urlToBytes(id),
        type: 'public-key' as const,
      })),
      userVerification: 'required',
      extensions: prfExtensions(),
    },
  })) as PublicKeyCredential | null;
  if (!cred) throw new Error('Passkey prompt was dismissed.');
  return { credentialId: cred.id, prfOutput: readPrf(cred) };
};
```

Note: the previous `import { fromBase64 } from './clientCrypto';` is gone — `fromBase64` is no longer used here.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run features/crypto/lib/webauthn.test.ts`
Expected: PASS.

### 2b. passkeyFlow.ts — helpers + refactor

- [ ] **Step 5: Update/extend the tests**

In `features/crypto/lib/passkeyFlow.test.ts`:

1. In the `buildPasskeyWrap` test, change the assertion mock call expectation — `assertPrfForCredential` is now called with just `'cred-A'`. The existing assertions on the returned `out` still hold except remove any `prfSalt` expectation (there is none in the current test, so only the call signature matters). Replace its body with:

```ts
  it('asserts PRF and returns a wrap of the DEK', async () => {
    const prf = new Uint8Array(32).fill(3);
    (
      assertPrfForCredential as MockedFunction<typeof assertPrfForCredential>
    ).mockResolvedValue({ credentialId: 'cred-A', prfOutput: prf });
    const dek = generateDek();
    const out = await buildPasskeyWrap(dek, 'cred-A', 'Laptop');
    expect(out).toEqual({
      credentialId: 'cred-A',
      label: 'Laptop',
      wrap: expect.any(String),
    });
    expect(assertPrfForCredential).toHaveBeenCalledWith('cred-A');
  });
```

2. In both `getMaterial` mock objects (the `unlockWithPasskey` success test and the empty test), remove the `prfSalt` properties from each passkey entry so the shape matches the new `PasskeyMaterial`. The success test's `passkeys` becomes:

```ts
      passkeys: [
        { credentialId: 'cred-A', wrap: 'x' },
        { credentialId: 'cred-B', wrap },
      ],
```

3. In the `unlockWithPasskey` success test, change the `assertPrfAny` mock — it is now called with a string array. No change to its `mockResolvedValue` is needed; optionally assert `expect(assertPrfAny).toHaveBeenCalledWith(['cred-A', 'cred-B'])`.

4. Add a new describe block for the two new helpers:

```ts
describe('unlockWithPrfOutput', () => {
  it('unwraps the matching wrap and posts the DEK', async () => {
    const prf = new Uint8Array(32).fill(5);
    const dek = generateDek();
    const wrap = await wrapDek(dek, await derivePrfKek(prf));
    (getMaterial as MockedFunction<typeof getMaterial>).mockResolvedValue({
      passSalt: 'salt',
      argonParams: { m: 19, t: 2, p: 1 },
      wrapPassphrase: 'pp',
      wrapRecovery: 'rec',
      passkeys: [{ credentialId: 'cred-B', wrap }],
    });
    await unlockWithPrfOutput('cred-B', prf);
    const posted = (postDek as MockedFunction<typeof postDek>).mock
      .calls[0][0] as Uint8Array;
    expect(Array.from(posted)).toEqual(Array.from(dek));
  });

  it('throws when the credential has no enrolled wrap', async () => {
    (getMaterial as MockedFunction<typeof getMaterial>).mockResolvedValue({
      passSalt: 'salt',
      argonParams: { m: 19, t: 2, p: 1 },
      wrapPassphrase: 'pp',
      wrapRecovery: 'rec',
      passkeys: [],
    });
    await expect(
      unlockWithPrfOutput('cred-X', new Uint8Array(32))
    ).rejects.toThrow(/not enrolled/i);
  });
});

describe('tryUnlockFromWebAuthn', () => {
  it('unlocks when PRF output is present', async () => {
    const prf = new Uint8Array(32).fill(5);
    const dek = generateDek();
    const wrap = await wrapDek(dek, await derivePrfKek(prf));
    (getMaterial as MockedFunction<typeof getMaterial>).mockResolvedValue({
      passSalt: 'salt',
      argonParams: { m: 19, t: 2, p: 1 },
      wrapPassphrase: 'pp',
      wrapRecovery: 'rec',
      passkeys: [{ credentialId: 'cred-B', wrap }],
    });
    await tryUnlockFromWebAuthn({
      response: { id: 'cred-B' },
      clientExtensionResults: { prf: { results: { first: prf.buffer } } },
    });
    expect(postDek).toHaveBeenCalledTimes(1);
  });

  it('no-ops when PRF output is absent', async () => {
    await tryUnlockFromWebAuthn({
      response: { id: 'cred-B' },
      clientExtensionResults: {},
    });
    expect(postDek).not.toHaveBeenCalled();
  });

  it('swallows unlock errors (not enrolled) without throwing', async () => {
    (getMaterial as MockedFunction<typeof getMaterial>).mockResolvedValue({
      passSalt: 'salt',
      argonParams: { m: 19, t: 2, p: 1 },
      wrapPassphrase: 'pp',
      wrapRecovery: 'rec',
      passkeys: [],
    });
    await expect(
      tryUnlockFromWebAuthn({
        response: { id: 'cred-Z' },
        clientExtensionResults: {
          prf: { results: { first: new Uint8Array(32).buffer } },
        },
      })
    ).resolves.toBeUndefined();
    expect(postDek).not.toHaveBeenCalled();
  });
});
```

Update the import line at the top of the test to include the new exports:

```ts
import {
  buildPasskeyWrap,
  unlockWithPasskey,
  unlockWithPrfOutput,
  tryUnlockFromWebAuthn,
  registerPasskey,
  enrollPasskeyForUnlock,
} from './passkeyFlow';
```

- [ ] **Step 6: Run to verify it fails**

Run: `pnpm vitest run features/crypto/lib/passkeyFlow.test.ts`
Expected: FAIL — new exports undefined / signature mismatches.

- [ ] **Step 7: Rewrite passkeyFlow.ts**

Replace `EnablePasskeyInput`, `buildPasskeyWrap`, and `unlockWithPasskey`, and add the two new helpers. The final `features/crypto/lib/passkeyFlow.ts` relevant sections become:

```ts
export type EnablePasskeyInput = {
  credentialId: string;
  wrap: string;
  label: string;
};
```

```ts
export const buildPasskeyWrap = async (
  dek: Uint8Array,
  credentialId: string,
  label: string
): Promise<EnablePasskeyInput> => {
  const { prfOutput } = await assertPrfForCredential(credentialId);
  const wrap = await wrapDek(dek, await derivePrfKek(prfOutput));
  return { credentialId, wrap, label };
};
```

```ts
/**
 * Unwrap the DEK using a PRF output already obtained from a ceremony and post it
 * to the session. Shared by the standalone unlock and the single-tap login path.
 * Throws if the responding credential has no enrolled wrap.
 */
export const unlockWithPrfOutput = async (
  credentialId: string,
  prfOutput: Uint8Array
): Promise<void> => {
  const m = await getMaterial();
  const match = m.passkeys.find((p) => p.credentialId === credentialId);
  if (!match) throw new Error('Passkey is not enrolled for unlock.');
  const dek = await unwrapDek(match.wrap, await derivePrfKek(prfOutput)).catch(
    () => {
      throw new Error('Passkey unlock failed.');
    }
  );
  await postDek(dek);
};

/** Shape of better-auth's returned WebAuthn assertion (the bits we read). */
export type WebAuthnResult = {
  response: { id: string };
  clientExtensionResults: { prf?: { results?: { first?: BufferSource } } };
};

/**
 * Best-effort unlock from a login ceremony's PRF output. No-ops when PRF is
 * absent (device unsupported / passkey not registered with PRF) and swallows
 * unlock failures (passkey not enrolled for unlock, no encryption set up) so the
 * caller can proceed to the normal passphrase unlock. Never throws.
 */
export const tryUnlockFromWebAuthn = async (
  webauthn: WebAuthnResult | undefined
): Promise<void> => {
  const first = webauthn?.clientExtensionResults?.prf?.results?.first;
  const credentialId = webauthn?.response?.id;
  if (!first || !credentialId) return;
  try {
    await unlockWithPrfOutput(credentialId, new Uint8Array(first as ArrayBuffer));
  } catch {
    // Not enrolled for unlock / no encryption — fall through to passphrase unlock.
  }
};

/** Unlock the session using any enrolled passkey (standalone unlock screen). */
export const unlockWithPasskey = async (): Promise<void> => {
  const m = await getMaterial();
  if (!m.passkeys.length) throw new Error('No passkey is set up for unlock.');
  const { credentialId, prfOutput } = await assertPrfAny(
    m.passkeys.map((p) => p.credentialId)
  );
  await unlockWithPrfOutput(credentialId, prfOutput);
};
```

- [ ] **Step 8: Run to verify it passes**

Run: `pnpm vitest run features/crypto/lib/passkeyFlow.test.ts`
Expected: PASS. (Server files still reference `prfSalt` — typecheck is fixed in 2c; vitest transpiles per-file so this suite passes now.)

### 2c. Server — drop prfSalt

- [ ] **Step 9: Update server tests**

In `features/crypto/actions/passkeyUnlock.test.ts`: remove `prfSalt` from the `validEnable` fixture, and assert `create` is called without it:

```ts
const validEnable = {
  credentialId: 'cred-A',
  wrap: 'd3JhcA==',
  label: 'Laptop',
};
```

In `app/api/crypto/material/route.test.ts`: remove `prfSalt` from any fixtured wrap rows and from the expected `passkeys` shape. Each expected passkey is now `{ credentialId, wrap }`.

In `lib/crypto/passkeyWrapRepository.test.ts`: remove `prfSalt` from any `create` inputs and from `onConflictDoUpdate`/expected `set` assertions.

- [ ] **Step 10: Run to verify they fail**

Run: `pnpm vitest run features/crypto/actions/passkeyUnlock.test.ts app/api/crypto/material/route.test.ts lib/crypto/passkeyWrapRepository.test.ts`
Expected: FAIL (or still pass with extra field) — proceed regardless; the code edits below make them authoritative.

- [ ] **Step 11: Drop prfSalt from schema, type, repo, action, route**

`lib/crypto/passkeyWrapSchema.ts` — remove the `prfSalt: b64,` line from `enablePasskeyUnlockSchema`:

```ts
export const enablePasskeyUnlockSchema = z.object({
  credentialId: b64url,
  wrap: b64,
  label: z.string().min(1).max(100),
});
```

`lib/crypto/setupSchema.ts` — drop `prfSalt` from `PasskeyMaterial`:

```ts
export type PasskeyMaterial = {
  credentialId: string;
  wrap: string;
};
```

`lib/crypto/passkeyWrapRepository.ts` — remove `prfSalt` from the conflict `set`:

```ts
      .onConflictDoUpdate({
        target: [cryptoPasskeyWrap.userId, cryptoPasskeyWrap.credentialId],
        set: { wrap: input.wrap, label: input.label },
      });
```

`features/crypto/actions/enablePasskeyUnlock.ts` — remove `prfSalt` from the `create` call:

```ts
  await getPasskeyWrapRepository().create({
    id: ulid(),
    userId: user.id,
    credentialId: parsed.data.credentialId,
    wrap: parsed.data.wrap,
    label: parsed.data.label,
  });
```

`app/api/crypto/material/route.ts` — drop `prfSalt` from the mapped passkeys:

```ts
    passkeys: wraps.map((w) => ({
      credentialId: w.credentialId,
      wrap: w.wrap,
    })),
```

Note: `NewCryptoPasskeyWrap` still types `prfSalt` as required until Task 3 drops the column, so the `create` input in `enablePasskeyUnlock.ts` will type-error until Task 3. To keep Task 2 self-consistent, complete Task 3's schema edit immediately after Step 11 if running typecheck here; otherwise the vitest suites in Step 12 pass independently and the full typecheck is asserted at the end of Task 3. (Sequence Task 3 right after this step.)

- [ ] **Step 12: Run the affected suites**

Run: `pnpm vitest run features/crypto/actions/passkeyUnlock.test.ts app/api/crypto/material/route.test.ts lib/crypto/passkeyWrapRepository.test.ts`
Expected: PASS.

- [ ] **Step 13: Commit**

```bash
git add features/crypto/lib/webauthn.ts features/crypto/lib/webauthn.test.ts \
  features/crypto/lib/passkeyFlow.ts features/crypto/lib/passkeyFlow.test.ts \
  lib/crypto/passkeyWrapSchema.ts lib/crypto/setupSchema.ts \
  lib/crypto/passkeyWrapRepository.ts lib/crypto/passkeyWrapRepository.test.ts \
  features/crypto/actions/enablePasskeyUnlock.ts features/crypto/actions/passkeyUnlock.test.ts \
  app/api/crypto/material/route.ts app/api/crypto/material/route.test.ts
git commit -m "feat(crypto): use fixed PRF salt and drop per-passkey prfSalt"
```

---

## Task 3: Drop the prfSalt column and wipe stale wraps

**Files:**
- Modify: `db/schema/cryptoPasskeyWrap.ts`
- Create: `db/migrations/00XX_<generated>.sql` (via drizzle-kit) + updated `db/migrations/meta/*`

**Interfaces:**
- Consumes: the schema type `NewCryptoPasskeyWrap` is referenced by `passkeyWrapRepository.ts` and `enablePasskeyUnlock.ts` (Task 2); dropping the column makes `prfSalt` no longer a required insert field, resolving Task 2's pending typecheck.

- [ ] **Step 1: Remove the column from the schema**

In `db/schema/cryptoPasskeyWrap.ts`, delete the line:

```ts
    prfSalt: text('prfSalt').notNull(), // base64, 32 bytes
```

- [ ] **Step 2: Generate the migration**

Run: `pnpm db:generate`
Expected: a new file `db/migrations/00XX_*.sql` containing
`ALTER TABLE "cryptoPasskeyWrap" DROP COLUMN "prfSalt";` and updated snapshot meta.

- [ ] **Step 3: Prepend the data wipe**

Edit the newly generated migration file. Add this line **above** the `ALTER TABLE ... DROP COLUMN` statement (stale wraps were made with random salts and can never decrypt under the fixed salt):

```sql
DELETE FROM "cryptoPasskeyWrap";
--> statement-breakpoint
```

- [ ] **Step 4: Apply the migration and typecheck**

Run: `pnpm db:migrate`
Expected: migration applies cleanly.

Run: `pnpm type-check`
Expected: PASS — no remaining `prfSalt` type errors anywhere (confirms Task 2 + Task 3 are consistent).

- [ ] **Step 5: Full test sweep**

Run: `pnpm vitest run`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add db/schema/cryptoPasskeyWrap.ts db/migrations/
git commit -m "feat(crypto): drop prfSalt column and wipe stale passkey wraps"
```

---

## Task 4: Single-tap wiring in the login form

**Files:**
- Modify: `features/auth/AuthForm.tsx`
- Test: covered by `features/crypto/lib/passkeyFlow.test.ts` (`tryUnlockFromWebAuthn`, Task 2). The form change is thin wiring; `AuthScreen.test.tsx` keeps the render smoke test green.

**Interfaces:**
- Consumes: `PRF_SALT` (Task 1), `tryUnlockFromWebAuthn` + `WebAuthnResult` (Task 2).

- [ ] **Step 1: Add imports**

In `features/auth/AuthForm.tsx`, add to the import block:

```ts
import { PRF_SALT } from '@/features/crypto/lib/clientCrypto';
import {
  tryUnlockFromWebAuthn,
  type WebAuthnResult,
} from '@/features/crypto/lib/passkeyFlow';
```

- [ ] **Step 2: Rewrite onPasskey**

Replace the existing `onPasskey` function (currently lines ~109-119) with:

```ts
  function onPasskey() {
    let webauthn: WebAuthnResult | undefined;
    return runAttempt(
      'passkey',
      async () => {
        const res = await authClient.signIn.passkey({
          extensions: { prf: { eval: { first: PRF_SALT as unknown as BufferSource } } },
          returnWebAuthnResponse: true,
        });
        if (res && 'webauthn' in res && res.webauthn) {
          webauthn = res.webauthn as unknown as WebAuthnResult;
        }
        return res;
      },
      async () => {
        // Best-effort: unlock the journal from the same ceremony's PRF output.
        // Never throws; falls through to passphrase unlock when unavailable.
        await tryUnlockFromWebAuthn(webauthn);
        const callbackURL = resolveCallbackUrl('callbackUrl', CALLBACK_URL);
        window.location.assign(callbackURL);
      }
    );
  }
```

Rationale: `runAttempt`'s `call` still returns `{ error }` for state dispatch; the
full result is captured via the `webauthn` closure variable. `onSuccess` accepts
an async function (its return value is ignored by `runAttempt`), so no change to
`runAttempt` is required. The redirect happens inside `onSuccess` after the
best-effort unlock.

- [ ] **Step 3: Typecheck**

Run: `pnpm type-check`
Expected: PASS.

- [ ] **Step 4: Run the auth + passkey suites**

Run: `pnpm vitest run features/auth features/crypto`
Expected: PASS.

- [ ] **Step 5: Lint**

Run: `pnpm lint`
Expected: PASS (no unused imports; `onSuccess` async accepted).

- [ ] **Step 6: Commit**

```bash
git add features/auth/AuthForm.tsx
git commit -m "feat(auth): unlock journal in the passkey login ceremony"
```

---

## Task 5: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Full typecheck, lint, tests**

Run: `pnpm type-check && pnpm lint && pnpm vitest run`
Expected: all PASS.

- [ ] **Step 2: Manual smoke (documented for the reviewer)**

With a fresh DB (wraps wiped): register a passkey, set up encryption, enroll the
passkey for unlock from Settings, lock, then sign out. Sign back in with the
passkey — verify a **single** prompt and that the dashboard loads unlocked (no
trip to `/crypto/unlock`). Then test fallback: a passphrase-only user signing in
with passkey (not enrolled for unlock) still lands logged-in and is asked for the
passphrase on first encrypted read.

- [ ] **Step 3: Commit (if any doc tweaks)** — otherwise the branch is ready for PR.

---

## Self-Review

**Spec coverage:**
- Fixed salt constant → Task 1. ✓
- Assertions use fixed salt → Task 2a. ✓
- `unlockWithPrfOutput` + `unlockWithPasskey` refactor → Task 2b. ✓
- Drop `prfSalt` (schema/type/repo/action/route) → Task 2c. ✓
- Login merge (`signIn.passkey` + PRF capture + best-effort unlock) → Task 4. ✓
- DB column drop + data wipe → Task 3. ✓
- Fail-soft / modal / magic-link unaffected → encoded in `tryUnlockFromWebAuthn` (Task 2) and onPasskey (Task 4); `unlockWithPasskey` standalone path preserved for magic-link/Google. ✓
- Envelope/passphrase/recovery untouched → confirmed (no edits to those paths). ✓

**Placeholder scan:** none — all steps carry concrete code/commands. The only non-literal is the generated migration filename (`00XX`), which is intrinsic to drizzle-kit and handled by Step 3.2–3.3.

**Type consistency:** `PRF_SALT: Uint8Array`, `assertPrfForCredential(string)`, `assertPrfAny(string[])`, `unlockWithPrfOutput(string, Uint8Array)`, `tryUnlockFromWebAuthn(WebAuthnResult|undefined)`, `EnablePasskeyInput`/`PasskeyMaterial` without `prfSalt` — names/types match across Tasks 2 and 4.
