# Encrypted journals — passkey (PRF) unlock

**Date:** 2026-06-25
**Status:** Design approved, pending spec review
**Phase:** 7 (multi-user hardening) — encrypted-journals fast-follow
**Supersedes / extends:** `2026-06-25-encrypted-journals-v2-design.md` (P1–P3, all merged: PR #28/#29/#30)

## Summary

Add a **third way to unlock an encrypted journal: the user's passkey**, alongside
the existing passphrase and one-time recovery code. Unlock is the per-session step
that hands the server the Data Encryption Key (DEK) in RAM so it can decrypt the
journal for the duration of the session.

This is **purely additive**. The DEK never changes; passphrase and recovery wraps
are untouched. A passkey simply carries an *additional wrap* of the same DEK,
derived from the passkey's **WebAuthn PRF** output. Multiple passkeys are
supported — each carries its own wrap.

## Background / current state

From P1–P3 (all merged to `main`):

- One random 32-byte **DEK** per user encrypts the journal at the Garage push/pull
  seam (`LEJ1` ciphertext at rest; plaintext only on the ephemeral local working
  dir during an unlocked session).
- The DEK is stored **wrapped** (AES-GCM) in the `userCrypto` table, today as two
  fixed columns:
  - `wrapPassphrase` — KEK = Argon2id(passphrase, `passSalt`, `argonParams`)
  - `wrapRecovery` — KEK = HKDF-SHA256(recovery-code bytes, info=`ledger-recovery-v1`)
- **Zero-knowledge:** all wraps are opaque base64 blobs created client-side; the
  server never unwraps them. The server sees the raw DEK only in session RAM,
  posted to `POST /api/crypto/unlock` after the client unwraps it locally.
- Unlock (`features/crypto/lib/unlockFlow.ts`): fetch wrap material via
  `getMaterial()` (`GET /api/crypto/material`), derive the KEK, `unwrapDek`,
  `postDek`.
- Rewrap (`features/crypto/lib/rewrapFlow.ts`): `obtainDek(authorizer)` re-derives
  the DEK from a passphrase **or** recovery authorizer (proof-before-mutation);
  `changePassphrase` / `rotateRecovery` re-wrap without re-encrypting the journal.
- Login already uses passkeys via `@better-auth/passkey` (plus magic-link), with a
  manager UI at `/settings/passkeys` (`PasskeyManagerPage` from `@naeemba/next-starter`).
  An account can already have multiple passkeys.

**Verified capabilities** (`node_modules/@better-auth/passkey`):
- The passkey plugin accepts WebAuthn extensions at registration
  (`opts.registration.extensions`) and authentication (`opts.authentication.extensions`),
  plus per-call client `extensions`, and returns `clientExtensionResults`. So the
  **PRF / hmac-secret extension can be enabled at credential creation** and
  evaluated during an assertion.
- The application has **no real users yet**, so there are no PRF-less credentials
  to migrate — enabling PRF on registration from now on is sufficient.

## Decision: reuse login passkeys (not dedicated credentials)

The same passkey the user signs in with also unlocks the journal. Rejected
alternative: dedicated encryption-only passkeys (cleaner isolation, but a second
passkey per device and no migration upside given zero existing users).

### Key property: no server-side assertion verification

PRF-based unlock needs **no challenge/verify round-trip**. Security comes entirely
from "does the PRF-derived key unwrap the DEK" — identical in spirit to the
passphrase path (derive key, try to unwrap, succeed or fail). The WebAuthn
assertion can therefore use a random client-generated challenge and is **never
sent to the server for verification**. The unlock ceremony is stateless: assert →
read PRF → unwrap locally → `postDek`.

## Data model

New one-to-many table (today's wraps are fixed columns; passkeys need many):

```
cryptoPasskeyWrap
  id            text  PK              -- ULID
  userId        text  → user.id (onDelete: cascade)
  credentialId  text                  -- the better-auth passkey credential id (base64url)
  prfSalt       text                  -- random 32 bytes, base64; input to the authenticator PRF
  wrap          text                  -- DEK wrapped by the PRF-derived KEK (opaque base64)
  label         text                  -- mirrors the passkey's name, for the UI
  createdAt     timestamptz  default now()
  UNIQUE (userId, credentialId)
```

Migration `0005`.

**Orphan handling** (passkey removed via the passkey manager): prefer a foreign key
`credentialId → <better-auth passkey credential-id column>` with `onDelete: cascade`
**if** that column is unique in the better-auth schema. If it is not cleanly
FK-able, tolerate orphan wraps — an orphan credential can never assert, so its wrap
is unusable and harmless, and it simply won't appear as an actionable passkey in the
Settings list (which cross-references the live passkey list). The choice is
confirmed against the actual passkey schema during implementation.

The server stores only opaque wraps + salts. Zero-knowledge is preserved.

## KEK derivation

Mirrors the recovery path, new domain-separation info string:

```
PRF output (32 bytes)
  → HKDF-SHA256(salt = empty, info = "ledger-passkey-v1")
  → AES-GCM-256 KEK
  → wrap / unwrap DEK   (existing wrapDek / unwrapDek)
```

New client helper `derivePrfKek(prfOutput: Uint8Array): Promise<CryptoKey>` next to
`recoveryHkdfKey` in `features/crypto/lib/clientCrypto.ts`. The PRF input (`first`)
is the per-credential `prfSalt`.

## Flows

### 1. Enable passkey unlock (Settings → Security; proof-before-mutation)

1. User proves identity with **passphrase or recovery** → `obtainDek(authorizer)`
   returns the DEK client-side (same as `changePassphrase`).
2. Generate random `prfSalt` (32 bytes).
3. `navigator.credentials.get({ publicKey: { challenge: random, allowCredentials:
   [credentials not yet enabled], userVerification: 'required', extensions: { prf:
   { eval: { first: prfSalt } } } } })`.
4. Read `assertion.getClientExtensionResults().prf.results.first` → PRF output. If
   absent → throw "this device doesn't support passkey unlock."
5. `derivePrfKek` → `wrapDek(dek, kek)` → wrap.
6. POST `{ credentialId: assertion.id, prfSalt, wrap, label }` to the
   `enablePasskeyUnlock` server action → insert `cryptoPasskeyWrap` row.

### 2. Unlock with passkey (`/crypto/unlock`)

1. `getMaterial()` now also returns `passkeys: [{ credentialId, prfSalt, wrap }]`.
2. `navigator.credentials.get` over **all** the user's enabled credentials, using
   `extensions: { prf: { evalByCredential: { [credentialId]: { first: prfSalt }, … } } }`
   (per-credential salts), `userVerification: 'required'`, random challenge.
3. Identify the responding credential by `assertion.id`; take its `wrap`.
4. Read PRF output → `derivePrfKek` → `unwrapDek(wrap, kek)` → `postDek(dek)`
   (existing endpoint, server stores DEK in session RAM).

### 3. Disable passkey unlock (Settings → Security)

- Delete the `cryptoPasskeyWrap` row for that credential. The login passkey is
  untouched.
- **No "last unlock method" guard needed** — passphrase + recovery always exist, so
  a passkey is never the only way in. (Simpler than P3's recovery-rotation guard.)

### 4. Setup-wizard touchpoint (recommended, additive)

During the setup wizard the freshly generated DEK is already in hand client-side —
the only moment a passkey can be enabled **without** re-entering the passphrase.
Add an optional final wizard step: *"Also unlock with this device's passkey?"* →
one PRF assertion → wrap → store. Reuses the enable flow. Makes passkey unlock work
from day one without a separate Settings visit.

## Auth / PRF configuration

Enable PRF at registration so new passkeys are PRF-capable:

```ts
// lib/auth.ts
passkey: { rpName: APP_NAME, registration: { extensions: { prf: {} } } }
```

Confirm `@naeemba/next-starter`'s `createAuth` forwards the `registration` option to
the passkey plugin. If it only forwards `rpName`, add the forwarding in the starter
(user owns it) or wire the plugin option directly — a small change, surfaced when
hit.

## Components & files

- `db/schema/cryptoPasskeyWrap.ts` + barrel export; migration `0005`.
- Repository: `PasskeyWrapRepository` (or methods on `UserCryptoRepository`) —
  `listByUser`, `create`, `deleteByCredential`.
- `features/crypto/lib/clientCrypto.ts` — add `derivePrfKek`.
- `features/crypto/lib/passkeyFlow.ts` — `enablePasskeyUnlock` (assert+wrap) and
  `unlockWithPasskey` (assert+unwrap+postDek) client flows; small WebAuthn helpers
  for base64url ↔ ArrayBuffer on credential ids.
- `lib/crypto/setupSchema.ts` — extend `CryptoMaterial` with optional `passkeys`.
- `app/api/crypto/material/route.ts` — include the passkey wrap list.
- `features/crypto/actions/enablePasskeyUnlock.ts`,
  `features/crypto/actions/disablePasskeyUnlock.ts` (one action per file;
  rate-limited per the existing pattern).
- `features/settings/PasskeyUnlockCard.tsx` — list passkeys (cross-reference
  better-auth list + our wraps), Enable / Disable; added to `SecuritySection`.
- `features/crypto/UnlockScreen.tsx` — "Unlock with passkey" button, shown when
  `material.passkeys.length > 0`.
- `features/crypto/SetupWizard.tsx` — optional final passkey step.
- `lib/auth.ts` — PRF registration extension.

## Error handling

- **PRF unsupported** → clear message on enable; passkey options hidden on the
  unlock screen when no wraps exist.
- **User cancels the WebAuthn prompt** → surfaced inline, no state change.
- **Wrong authorizer on enable** → existing `obtainDek` error messages ("Incorrect
  passphrase." / "Incorrect recovery code.").
- **Orphan wrap** → unusable, harmless; cleaned by cascade or ignored (see Data model).
- Server actions never see plaintext DEK or PRF output — only opaque wraps + salts.

## Testing

- **Unit:** `derivePrfKek` determinism; wrap/unwrap round-trip with a PRF-derived
  key; `enablePasskeyUnlock` / `unlockWithPasskey` flows with mocked
  `navigator.credentials` + `getMaterial`.
- **Repository:** `cryptoPasskeyWrap` CRUD.
- **Actions:** enable / disable with mocked deps and the established
  `@/lib/rate-limit` mock.
- **Migration:** `0005` applies.
- **Live e2e acceptance** (WebAuthn can't run headless — folds into the crypto e2e
  already owed for P2/P3):
  1. Enable passkey unlock (proving with passphrase) in Settings → Security.
  2. Lock, then unlock via the passkey (Touch ID / device PIN); journal decrypts.
  3. Register/enable a second passkey on another device; both unlock independently.
  4. Disable one passkey → it no longer unlocks; the other still does; passphrase +
     recovery still work.
  5. Setup-wizard passkey step (fresh user) enables unlock from day one.

## Scope / non-goals

- One cohesive PR, built via SDD (schema/repo → client crypto → material+actions →
  auth PRF config → UI + wizard → tests), matching P1–P3.
- **Not** dedicated encryption-only passkeys.
- **Not** changing the DEK, the at-rest format, or the passphrase/recovery paths.
- **Not** server-side assertion verification (unnecessary for PRF unlock).
```
