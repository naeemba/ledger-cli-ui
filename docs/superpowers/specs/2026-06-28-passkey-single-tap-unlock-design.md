# Single-tap passkey login + journal unlock

**Date:** 2026-06-28
**Branch:** `feat/passkey-single-tap-unlock`
**Status:** Approved design — proceeding to implementation plan.

## Problem

A passkey user currently taps their authenticator twice: once to log in
(`authClient.signIn.passkey()` in `features/auth/AuthForm.tsx`), and again to
unlock their encrypted journal (`unlockWithPasskey` in
`features/crypto/lib/passkeyFlow.ts`, surfaced on `UnlockScreen`). The two are
cryptographically distinct outputs of the *same* credential — a signature for
login, a PRF output for key derivation — but they are obtained in two separate
WebAuthn ceremonies.

A single `navigator.credentials.get()` can return both at once: pass the PRF
`eval` salt into the assertion and read `getClientExtensionResults().prf.results.first`
off the same response that authenticates the user. The blocker today is salt
timing: the PRF salt is random per passkey and stored server-side
(`cryptoPasskeyWrap.prfSalt`), fetched from `/api/crypto/material` which requires
an authenticated session — so it cannot be known *before* the login ceremony.

## Goal

One biometric tap performs both login and journal unlock. Fall back cleanly to
the existing passphrase / standalone-passkey unlock whenever PRF is unavailable.

## Key decisions

- **Fixed versioned PRF salt.** Replace the per-passkey random salt with a single
  constant, `PRF_SALT = TextEncoder().encode('ledger-prf-v1')`, known at build
  time. This is safe: the PRF output is already uniquely bound to (authenticator
  hardware secret, rpId) by the authenticator; the salt is an application-chosen
  input label, not entropy or a secret (it was already sent to the client in
  plaintext). Domain separation is already handled by HKDF's fixed
  `info: 'ledger-passkey-v1'` in `derivePrfKek`. The version in the name leaves a
  rotation handle for the future.
- **Drop the `prfSalt` column.** With a fixed salt the stored value is redundant.
  Remove it from the table, the enroll schema, the material payload, and the
  client flows. (Decided over keeping a constant-valued column.)
- **No migration of existing wraps.** There are no real users on the server. The
  salt change invalidates existing wraps, so they are deleted; users re-enroll
  passkey unlock. Login passkey credentials themselves are untouched.
- **Full single-tap merge now** (not a phased foundation-first).

## Approach

### 1. Fixed salt constant — `features/crypto/lib/clientCrypto.ts`
Add `export const PRF_SALT = new TextEncoder().encode('ledger-prf-v1');`.
`derivePrfKek` is unchanged (it already uses an empty HKDF salt + fixed info).

### 2. WebAuthn assertions use the fixed salt — `features/crypto/lib/webauthn.ts`
- `assertPrfForCredential(credentialId)` — drop the `salt` parameter; use
  `eval: { first: PRF_SALT }`. Used at enrollment.
- `assertPrfAny(credentialIds: string[])` — drop the per-credential `prfSalt`;
  use a single `eval: { first: PRF_SALT }` for all listed credentials (still sets
  `allowCredentials`). Used by the standalone unlock path.
- `readPrf` unchanged.

### 3. Shared unlock helper + login merge — `features/crypto/lib/passkeyFlow.ts`
- New `unlockWithPrfOutput(credentialId: string, prfOutput: Uint8Array)`: fetch
  material, find the wrap whose `credentialId` matches, `derivePrfKek` →
  `unwrapDek` → `postDek`. Throws if no matching wrap. This is the shared core.
- `unlockWithPasskey()` (standalone, used by `UnlockScreen` for users who logged
  in via magic link / Google) refactors onto `assertPrfAny` + `unlockWithPrfOutput`.
- `buildPasskeyWrap` / `enrollPasskeyForUnlock`: drop the generated salt and the
  `prfSalt` field from `EnablePasskeyInput`; call `assertPrfForCredential(credentialId)`.

### 4. Merge into login — `features/auth/AuthForm.tsx`
`onPasskey` calls:
```ts
authClient.signIn.passkey({
  extensions: { prf: { eval: { first: PRF_SALT } } },
  returnWebAuthnResponse: true,
})
```
On success the result is `{ webauthn: { response, clientExtensionResults }, data, error: null }`.
After auth succeeds, **best-effort** unlock: read
`webauthn.clientExtensionResults.prf?.results?.first` and `webauthn.response.id`;
if both present, call `unlockWithPrfOutput(id, new Uint8Array(first))` wrapped in
try/catch. Any failure (no encryption set up, passkey not enrolled for unlock,
device returned no PRF) is swallowed — then redirect to the callback URL exactly
as today. Net effect: enrolled users land unlocked; everyone else lands exactly
where they do now.

`runAttempt` is widened minimally so the passkey path can capture the full
result (the webauthn object) — e.g. close over a local variable in `call` and
read it in `onSuccess`, or have the passkey path bypass `runAttempt`'s
result-discarding. Keep the existing `{ error }`-based state dispatch.

### 5. Schema + data — `db/schema/cryptoPasskeyWrap.ts` + migration
- Remove the `prfSalt` column and its comment.
- `pnpm db:generate` to produce the drop-column migration; manually prepend
  `DELETE FROM "cryptoPasskeyWrap";` so stale (now-undecryptable) wraps don't
  linger.

### 6. Server-side ripple (drop `prfSalt`)
- `lib/crypto/passkeyWrapSchema.ts` — remove `prfSalt` from `enablePasskeyUnlockSchema`.
- `lib/crypto/setupSchema.ts` — remove `prfSalt` from `PasskeyMaterial`.
- `enablePasskeyUnlock` action + repository insert — stop writing `prfSalt`.
- `/api/crypto/material` route — stop selecting/returning `prfSalt`.

## Out of scope / untouched
Envelope encryption (random DEK wrapped per authorizer), passphrase (Argon2id)
and recovery-code unlock paths, the server-side zero-knowledge property (server
still only stores opaque blobs and never unwraps).

## Edge cases & fallbacks
- **Device without PRF support** (e.g. Safari + YubiKey): login still succeeds;
  PRF result absent → unlock skipped → user unlocks via passphrase on the unlock
  screen. Never block login on PRF.
- **Modal, not conditional UI.** Keep the passkey login as a modal prompt (the
  current button), not autofill (`autoFill`), because PRF return during
  conditional mediation is unreliable across platforms.
- **Magic-link / Google login** users are unaffected; they unlock via the
  standalone `UnlockScreen` passkey button or passphrase.

## Testing (TDD)
- `webauthn.test.ts` — assertions send `eval.first === PRF_SALT`; `assertPrfAny`
  uses one shared salt across listed credentials.
- `passkeyFlow.test.ts` — `unlockWithPrfOutput` finds the right wrap, unwraps,
  posts the DEK; throws when the credential has no wrap. `unlockWithPasskey`
  still unwraps + posts via the refactored path. Updated material shape (no
  `prfSalt`).
- `AuthForm` — `onPasskey` with mocked `signIn.passkey` returning PRF results
  unlocks then redirects; with PRF absent (or unlock throwing) it still redirects
  without surfacing an error.
- Server: enroll action / material route tests updated for the dropped field.
