# Encryption wizard: recovery-gate hardening + inline passkey step

Date: 2026-06-26
Status: Approved (design)
Area: `features/crypto` (encryption onboarding wizard)

## Background

The encryption onboarding wizard (`app/crypto/setup` → `features/crypto/SetupWizard.tsx`)
walks a new user through enabling zero-knowledge encrypted journals. Today it has
four steps: **why → passphrase → recovery → encrypting**.

Two gaps motivate this work, both rooted in the same risk: a user can lose access
to their journal forever if they lose *all* unlock methods at once (passphrase +
recovery code, with no passkey). The encryption is zero-knowledge by design — the
server holds only opaque wrapped keys, so there is no operator backdoor. The only
defences are (a) making sure the recovery code is genuinely saved, and (b) making
a second convenient unlock method (passkey) easy to add during onboarding.

1. **The recovery-code gate is too soft.** `RecoveryStep` shows the one-time code
   with Copy/Download buttons and a checkbox "I have saved my recovery code" that
   disables Continue until ticked (`SetupWizard.tsx:567-588`). But the box can be
   ticked without ever copying or downloading anything.
2. **Passkey enrollment lives only in Settings, after the fact.** Passkey-PRF
   unlock shipped (PR #31) but is enrollable only via Settings → Security
   (`features/settings/PasskeyUnlockCard.tsx`), which enrolls *existing* passkeys
   and points users to `/settings/passkeys` to add one. A brand-new user who
   signed up via magic-link has no passkey at all, so they finish onboarding with
   exactly one fallback (the recovery code) unless they later hunt through
   Settings. The wizard's deferred "Task 11" passkey step closes this.

## Goals

- Force the user to interact with their recovery code (copy or download) before
  they can confirm they saved it.
- Add an optional passkey step to the wizard that works for **every** user,
  including those with no passkey yet — registering one inline if needed.
- Keep the change additive: the DEK never changes, the recovery code remains the
  mandatory fallback, and the passkey step is always skippable.

## Non-goals

- Re-encrypting the journal or rotating the DEK (passkey enrollment is an extra
  wrap of the same DEK).
- Adding inline passkey *registration* to the Settings card (it can adopt the new
  shared helper later; out of scope here).
- Server-side WebAuthn assertion verification (unchanged: PRF unwraps client-side
  or it does not).

## Decisions (locked during brainstorming, 2026-06-26)

- **Recovery gate strength:** require the user to click **Copy** or **Download**
  at least once *and* tick the checkbox. (Chosen over re-typing the code, which
  risks frustrating users who saved it to a password manager.)
- **Passkey step behaviour:** register a new passkey inline when the user has
  none, *and* offer to enroll any existing passkeys. (Chosen over enrolling only
  existing passkeys, which would be a no-op for most new — magic-link — users.)

## Design

### Part 1 — Recovery-gate hardening

Entirely within `RecoveryStep` in `SetupWizard.tsx`:

- Add an `interacted` state flag, set to `true` inside both `handleCopy` and
  `handleDownload` (on success; copy still tolerates clipboard failure but a
  click still counts as interaction — the user can read/transcribe the visible
  code).
- The "I have saved my recovery code" checkbox gains `disabled={!interacted}`.
  The user must copy or download before they can even tick it.
- "Enable encryption" remains `disabled` until `interacted && saved`.
- When `!interacted`, show a hint line beneath the Copy/Download buttons:
  *"Copy or download your code first."* New string `cryptoCopy.recovery.saveFirstHint`.

No new files, no logic outside this component. No change to the recovery code
generation or the `runSetup` flow.

### Part 2 — Inline passkey step

#### Flow change (`SetupWizard` root)

Insert a new `'passkey'` step between `recovery` and `encrypting`:

```
Step type:   'why' | 'passphrase' | 'recovery' | 'passkey' | 'encrypting'
STEP_ORDER:  why → passphrase → recovery → passkey → encrypting
STEP_LABELS: …, passkey: 'Passkey', …
```

- `handleRecoveryNext` no longer unlocks/finalizes. It just advances:
  `setStep('passkey')`. (The DEK is already in `dekRef.current` and the
  `userCrypto` row already exists from the passphrase step's `runSetup`.)
- New `handlePasskeyNext` performs what `handleRecoveryNext` used to do —
  `postDek(dek)` then `finalizeEncryption()` then `window.location.assign('/dashboard')`,
  with the same fatal-error/retry handling (`fatalRetryStep` becomes `'passkey'`).
  Both **Skip for now** and **Continue** invoke it; enrolling a passkey is purely
  additive and complete before this point.
- The reload guard is preserved: if `dekRef.current` is null when
  `handlePasskeyNext` runs, route to `/crypto/unlock` (the row exists; unlock
  reconciles migration). Passkeys can still be added later in Settings.

Ordering rationale: `enablePasskeyUnlockAction` requires only
`getUserCryptoRepository().exists(user.id)` and an authenticated user — **not** an
unlocked session (`enablePasskeyUnlock.ts:22-23`). So the passkey step can enroll
before the session is unlocked at finalize.

#### New component `PasskeyStep` (au-* styled, in `SetupWizard.tsx`)

Props: `{ dek: Uint8Array; onNext: () => void }`.

- On mount: fetch existing login passkeys via
  `GET /api/auth/passkey/list-user-passkeys` (same call the Settings card uses).
  Track which `credentialId`s have been enrolled this session in local state
  (fresh setup starts with none).
- Render (au-card / au-btn, matching the rest of the wizard — **not** shadcn):
  - **"Add this device"** button → `registerPasskey(defaultName)` →
    `enrollPasskeyForUnlock(dek, newCredentialId, name)` → mark enrolled, refresh
    list. Copy notes "You'll be asked to confirm twice."
  - For each existing passkey: an **"Enable unlock"** button →
    `enrollPasskeyForUnlock(dek, credentialId, label)`. Enrolled rows show a ✓ and
    a disabled state.
  - **Skip for now** and **Continue** both call `onNext`. "Continue" is the label
    once at least one passkey is enrolled; "Skip for now" otherwise (cosmetic).
- Errors surface inline via the wizard's `au-error` pattern; the step is optional
  so the user can always proceed via Skip.

#### New shared helpers (`features/crypto/lib/passkeyFlow.ts`)

Keep the component thin and the logic unit-testable:

```ts
// Registers a new PRF-capable passkey via better-auth and resolves its
// credentialId. PRF is requested at registration by the server config
// (lib/auth.ts: passkey.registration.extensions.prf = {}), so the created
// credential supports PRF. If addPasskey does not return the credential id,
// re-fetch the passkey list and diff against the known set to find the new one.
export const registerPasskey = async (name: string): Promise<{ credentialId: string }>

// buildPasskeyWrap + enablePasskeyUnlockAction in one step. The caller holds the
// DEK directly (wizard: dekRef; no authorizer needed since the session already
// proved identity at login and the DEK is in memory).
export const enrollPasskeyForUnlock = async (
  dek: Uint8Array,
  credentialId: string,
  label: string,
): Promise<void>
```

`enrollPasskeyForUnlock` reuses the existing `buildPasskeyWrap` (which generates a
PRF salt, asserts the credential, and wraps the DEK) and calls the existing
`enablePasskeyUnlockAction`. `registerPasskey` is the only genuinely new
client-side capability (the Settings card never registered passkeys; the starter's
`PasskeyManagerPage` does it internally via `authClient.passkey.addPasskey`).

### Part 3 — Edge cases, copy, tests

**Edge cases**

- **Device lacks PRF / no platform authenticator / user dismisses prompt:**
  `registerPasskey` or the PRF assert throws; show inline error, user Skips.
  `readPrf` already throws "This device does not support passkey unlock."
- **Two biometric prompts** for a fresh passkey (register, then PRF assert):
  acknowledged in copy ("You'll be asked to confirm twice.").
- **Reload mid-step:** `dekRef` lost → `handlePasskeyNext` routes to
  `/crypto/unlock`; unlock reconciles the (idempotent) migration. No data risk —
  finalize/migration has not run yet, journal is still plaintext-at-rest, row
  exists.
- **Register succeeds but enroll fails:** the new passkey is valid for login and
  now appears in the list as un-enrolled "Enable unlock"; the user retries or
  Skips and enrolls later in Settings.
- **Rate limit:** `enablePasskeyUnlockAction` is behind the per-user WRITE limiter
  already; enrolling several passkeys in quick succession could hit it — surface
  the existing `RATE_LIMIT_MESSAGE` inline.

**Copy (`features/crypto/cryptoCopy.ts`)**

- `recovery.saveFirstHint`: "Copy or download your code first."
- New `passkey` block: `heading`, `body` (mentions optional + twice-prompt),
  `addLabel` ("Add this device"), `enableLabel` ("Enable unlock"),
  `enrolledLabel`, `skipLabel` ("Skip for now"), `continueLabel` ("Continue"),
  and error strings (`unsupported`, `registerFailed`, `enrollFailed`).
- Brand-panel feature tick: add "Unlock with a passkey" (or fold into the existing
  "Passphrase + recovery code" tick).

**Tests**

- Unit tests for `registerPasskey` and `enrollPasskeyForUnlock` in
  `passkeyFlow.test.ts`, mocking `authClient.passkey.addPasskey`,
  `navigator.credentials`, and the server action — following the existing
  `passkeyFlow.test.ts` / `webauthn.test.ts` mock patterns.
- `buildPasskeyWrap` and `enablePasskeyUnlockAction` already have coverage; no new
  server-action logic.
- Component-level wizard transition testing stays light (consistent with current
  repo coverage, which unit-tests the crypto libs rather than the wizard UI).

## Affected files

- `features/crypto/SetupWizard.tsx` — recovery-gate hardening; new `'passkey'`
  step + `PasskeyStep` component; flow rewiring (`handleRecoveryNext` /
  `handlePasskeyNext`); StepIndicator order/labels.
- `features/crypto/lib/passkeyFlow.ts` — `registerPasskey`, `enrollPasskeyForUnlock`.
- `features/crypto/lib/passkeyFlow.test.ts` — tests for the two new helpers.
- `features/crypto/cryptoCopy.ts` — recovery hint + `passkey` copy block.

## Acceptance (live, manual — needs a real Postgres + Garage dev env)

1. Fresh user → wizard recovery step: Continue stays disabled until Copy or
   Download is clicked *and* the checkbox is ticked.
2. Passkey step: "Add this device" registers a passkey (Touch ID), prompts again
   for PRF, shows it enrolled; Continue → dashboard; journal encrypted at rest.
3. Lock → unlock with the new passkey (Touch ID) decrypts the journal.
4. Skip the passkey step → onboarding still completes with passphrase + recovery.
5. Existing-passkey user: the step lists it with "Enable unlock"; enabling works.
6. Device without PRF: clear inline error; Skip still completes setup.
```
