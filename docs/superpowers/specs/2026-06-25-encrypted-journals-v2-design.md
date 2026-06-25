# Encrypted User Journals — Design Spec (v2)

**Date:** 2026-06-25
**Phase:** 7 (Multi-user hardening)
**Status:** Approved design — implementation scheduled
**Supersedes:** `2026-06-22-encrypted-journals-design.md` (pre-Garage; assumed local
disk was the source of truth and a passphrase+passkey baseline). This v2 reconciles
the design with the now-merged Garage object-storage layer and the app's
passwordless email login, and fixes the v1 scope.

## Summary

Encrypt each user's ledger journal so that **data at rest** — Garage (S3) objects,
backup `.zip`s, and any on-disk cache — is useless without a secret only the user
holds. The scheme is **envelope encryption with session-scoped decryption**: one
per-user Data Encryption Key (DEK) encrypts the journal; that DEK is wrapped by one
or more unlock methods. On login the user unlocks client-side, hands the raw DEK to
the server, and the server holds it **in RAM only** for the life of the session so it
can run the `ledger` binary.

This is **zero-knowledge at rest**, not full end-to-end. The server necessarily sees
plaintext *while a session is active* (it must, to run `ledger`); it never sees
plaintext, the DEK, the passphrase, or the recovery code **at rest**. That trade is
deliberate and accepted (see Threat model).

## What changed from v1 (2026-06-22)

1. **Garage is the durable source of truth.** The object-storage layer (PR #23) made
   Garage (S3-compatible) authoritative; the local disk dir `getJournalDir(userId)`
   is a re-pullable cache. Encryption therefore sits at the **push/pull sync seam**,
   not at a notional "tmpfs working dir." Garage/backups hold ciphertext; the local
   working dir holds plaintext only while unlocked.
2. **Login is passwordless (email magic-link).** Zero-knowledge requires a user-held
   secret the server never sees; email login cannot be that secret (the server can
   authenticate you on demand). So the encryption **passphrase is a genuinely new,
   separate secret** introduced by an onboarding wizard — not "the password you
   already have."
3. **v1 scope is passphrase + recovery code.** Passkey-PRF unlock is a **fast-follow**
   (additive: one extra wrap + one table, no journal re-encryption, because the DEK
   never changes).

## Threat model

| Threat | Defended in v1? |
| --- | --- |
| Stolen Postgres dump | ✅ only Argon2-wrapped DEK copies + ciphertext |
| Stolen Garage data / disk snapshot at rest | ✅ ciphertext only |
| Stolen backup `.zip` | ✅ ciphertext only |
| Offline / cold server compromise | ✅ no key material at rest |
| Curious operator / DBA (data at rest) | ✅ |
| **Live-rooted server during an active session** | ❌ accepted — server must see plaintext to run `ledger` |

Rationale for accepting the last row: the app's whole compute model is server-side
`ledger`. True E2E (browser-side `ledger` via WASM/reimpl) is a rewrite of the compute
layer and the loss of the real binary's behavior. Rejected. On a self-hosted single
box the operator already runs `ledger` over plaintext, so the realistic wins are all
at-rest, and those are fully defended.

## Storage seam — where encryption lives

```
Garage (S3)  ── ciphertext ──┐                 backups (.zip) ── ciphertext
                             │
                   pull: download → DECRYPT → write plaintext to local dir
                   push: read local plaintext → ENCRYPT → upload ciphertext
                             │
              local working dir  ── plaintext, ephemeral (shredded on lock) ──
                             │
              runLedger / runLedgerForUser / verify / repository  ── UNCHANGED
                             │
                          ledger binary
```

- Encrypt/decrypt are added **only** to `lib/storage/sync.ts` (`pull`, `push`) and the
  download/save helpers, all already inside `withUserLock(userId, …)`. No plaintext
  escapes the lock.
- `utils/runLedger.ts`, `utils/runLedgerForUser.ts`, `lib/journal/verify.ts`, and
  `lib/journal/repository.ts` are **untouched** — they keep reading/writing plaintext
  local files exactly as today.
- **Manifest/ETag conflict detection is unaffected:** ETags are computed over the
  ciphertext objects in Garage. GCM's random nonce makes each push's ciphertext
  unique, but `save.ts` already re-uploads all local files per push, so there is no
  regression.
- **Files excluded from encryption:** the `.manifest.json` itself (storage
  bookkeeping, no journal content) stays plaintext. Every journal file (main,
  `include`s, `price-db.ledger`) is encrypted.

### Local plaintext locality (decision)

Plaintext lives on the **ordinary local working dir** (`getJournalDir(userId)`), treated
as disposable: **shredded on lock / logout / session-expiry / restart**, re-pulled and
decrypted on next unlock. In the common at-rest state (no active session) there is **no
plaintext on disk**, so "stolen disk → ciphertext only" holds. The plaintext-on-disk
window equals the active-session window already conceded above.

`getJournalDir` is left pointing at the normal dir, so an operator who wants RAM-only
plaintext can **mount that dir on tmpfs at the infra layer with zero code change** —
documented as optional hardening, not built as code. (We do *not* build a separate
tmpfs working-dir abstraction; it adds path-resolution churn for a threat that
collapses into the conceded live-server case on a single box.)

## Key model — one DEK, many wraps

```
                     ┌─────────── DEK (random 256-bit) ───────────┐
                     │      encrypts all journal files at rest      │
                     └──────────────────────────────────────────────┘
                          ▲                    ▲                ▲
          wrap_passphrase ┘     wrap_recovery ─┘   wrap_prf[per-passkey] ┘  (fast-follow)
   KEK = Argon2id(passphrase)  KEK = HKDF(recovery code)   KEK = HKDF(PRF output)
```

- The **DEK** is generated once at setup and **never changes** — so changing the
  passphrase, rotating the recovery code, or (later) adding/removing a passkey re-wraps
  a copy of the DEK but never re-encrypts journal data.
- Each unlock method derives a **KEK** that AES-256-GCM-encrypts (wraps) a copy of the
  DEK. All wraps decrypt to the same DEK.
- **Correctness check** is the GCM auth tag: a wrong passphrase fails to decrypt its
  wrap. No separate password hash/verifier is stored.
- **Per-file encryption:** each file encrypted with AES-256-GCM under a per-file subkey
  `HKDF(DEK, info = relative_path)`, with the relative path bound as **AAD** so
  ciphertexts can't be swapped between files. Random 96-bit nonce per write. On-disk
  layout per file: `[magic "LEJ1"(4)][version(1)][nonce(12)][ciphertext][tag(16)]`.
  The magic+version header lets reads and the migration unambiguously distinguish a
  ciphertext file from a legacy plaintext ledger file (which never starts with `LEJ1`),
  and is bound into the GCM AAD alongside the relative path.

## Crypto primitives

- **KDF (passphrase):** Argon2id, **client-side** via WASM (`hash-wasm`). Params stored
  per-user for forward-compat (start ~`m=64MB, t=3, p=1`; `kdfVersion` for future
  bumps). WebCrypto lacks Argon2; PBKDF2-SHA256 is the zero-dependency fallback if WASM
  proves undesirable.
- **Symmetric:** AES-256-GCM — WebCrypto in the browser (wrap/unwrap), Node `crypto`
  server-side (per-file journal encryption).
- **KEK from recovery / PRF:** HKDF-SHA256.
- **Recovery code:** 256-bit random, shown **once** as grouped Base32, used as key
  material via HKDF; never stored server-side.

## Unlock & session flow

1. User authenticates (email magic-link / passkey / Google) — better-auth, **identity only**.
2. If `userCrypto` row is absent → route to the **setup wizard** (§Onboarding).
3. If the DEK is **not** in the server's in-RAM map for this user → route to the
   **unlock screen**. Otherwise proceed into the app.
4. Unlock: the browser fetches the wrap + salt for the chosen method, derives the KEK
   **locally**, AES-GCM-decrypts the wrap to recover the DEK. The passphrase / recovery
   code **never leaves the browser.**
5. Browser `POST`s the **raw DEK** to the server over TLS (`POST /api/crypto/unlock`);
   the server stores it in an in-memory map keyed by `userId` (see §Session DEK). The
   browser then **discards** its copy.
6. Subsequent `pull`/`push` decrypt/encrypt using that DEK. `ledger` runs against the
   decrypted local working dir.
7. **Lock / logout / expiry / restart:** drop the DEK from the map and shred the local
   working dir. Next request sees `locked` and the client re-unlocks.

Because the browser never persists the DEK (only holds it transiently in steps 4–5),
post-unlock XSS cannot exfiltrate a stored browser key.

**Unlock ≠ login.** Even when logged in by email magic-link, the per-session unlock is a
separate step (type passphrase now; in the fast-follow, a passkey PRF tap also works
regardless of how you logged in).

## Session DEK management

New module **`lib/crypto/session-keys.ts`** — an in-process `Map<userId, Uint8Array>`
(sibling to `lib/journal/mutex.ts`; the only other in-RAM per-user state). API roughly:

```ts
setSessionDek(userId: string, dek: Uint8Array): void   // on /api/crypto/unlock
getSessionDek(userId: string): Uint8Array | undefined  // read by pull/push
dropSessionDek(userId: string): void                   // on lock / logout
```

- `pull`/`push` call `getSessionDek`; if `undefined`, they throw a typed `LockedError`
  that callers map to a `locked` UI state.
- DEK is dropped on: explicit Lock button, sign-out (hook better-auth's sign-out),
  and implicitly on process restart (RAM clears). Session-expiry is best-effort: a
  request arriving after the session cookie expired is rejected by `requireSession`
  before reaching journal code, and the next valid login re-unlocks.
- **Multi-session:** multiple sessions for one user share the single `userId`-keyed DEK
  (it is the same key). Last unlock wins; any Lock/sign-out drops it for all — acceptable
  for v1 (single-user / sticky-session deployment).
- **Horizontal scaling** (shared DEK cache across instances) is explicitly out of scope.

## Storage at rest (Postgres + Drizzle)

Follow the `db/schema/userSetting.ts` convention (pgTable, `userId` text PK referencing
`user.id` with `onDelete: 'cascade'`, timestamps).

- **`userCrypto`** (1 row/user): `userId` (PK→user), `wrapPassphrase`, `passSalt`,
  `argonParams` (json), `wrapRecovery`, `recoveryCreatedAt`, `kdfVersion`, `createdAt`,
  `updatedAt`. Never stores cleartext DEK / passphrase / recovery code.
- **`passkeyPrfWrap`** *(fast-follow)* (1 row per PRF-enabled passkey): `credentialId`
  (FK→ better-auth passkey table), `userId`, `prfSalt`, `wrapPrf`.

`purgeUserData` (account deletion) and the `onDelete: cascade` FKs remove these rows
with the user.

## Onboarding wizard (one-time, gated)

A hard gate: until `userCrypto` exists, the app routes every page to the wizard.
Built in the **`au-*` editorial design system** (`features/auth/auth.css`) — Fraunces
display + JetBrains Mono, emerald glow, the `AuthScreen` two-column editorial layout,
`au-card` panels, `au-rise` staggered entrance — so it reads as a continuation of
sign-in, not a generic shadcn form. Lives under `features/crypto/` (new feature dir).

Steps:

1. **Why** — plain-language explanation of zero-knowledge at rest: your books are
   encrypted in storage and backups; the server can read them only while you're signed
   in and using the app; a stolen disk, database, or backup is useless without your
   secret. Sets expectations (you'll create a passphrase + save a recovery code).
2. **Create passphrase** — passphrase + confirm, strength hint, client-side Argon2id.
3. **Recovery code** — generated, shown **once** as grouped Base32, copy/download,
   "I've saved it" confirm checkbox before continuing.
4. **Encrypting** — one-time migration of existing plaintext journal → ciphertext with
   progress; on completion the wizard releases the gate and lands on `/dashboard`.

The wizard's DEK is generated client-side in step 2–3, wrapped (passphrase + recovery),
the wraps + salts uploaded to `userCrypto`, then the DEK posted to `/api/crypto/unlock`
so the session is immediately unlocked for the migration and first use.

## Per-session unlock screen

Lightweight single-`au-card` screen (same design system), shown after login when the
DEK isn't in RAM: passphrase field + (fast-follow) "Unlock with passkey" button + a
"Forgot passphrase? Use recovery code" link. A manual **Lock** control in the app
header / settings drops the DEK on demand.

## Settings → Security (shadcn, matches `/settings`)

- **Change passphrase:** unlock (DEK in hand) → derive new KEK → re-wrap → upload new
  `wrapPassphrase`/`passSalt`. No data re-encryption.
- **Forgot passphrase:** authenticate → enter recovery code → unwrap DEK via
  `wrapRecovery` → set new passphrase → re-wrap. Optionally rotate the recovery code.
- **Rotate recovery code:** while unlocked, generate new code → re-wrap → replace
  `wrapRecovery` + `recoveryCreatedAt`. Show the new code once.
- **Reset encryption (destructive):** explicit confirm → wipe journals + crypto rows →
  start fresh via the wizard. No server-side escrow, no recovery path for "lost
  everything."
- *(fast-follow)* **Add passkey:** while unlocked, register passkey with PRF extension →
  derive `KEK_prf` → wrap DEK → insert `passkeyPrfWrap`. **Remove passkey:** delete the
  row (and credential).

## Migration & rollout

Existing journals are plaintext in Garage/disk and cannot be pre-encrypted server-side
(no key exists yet). Migration is **per-user, on first wizard completion:**

1. Generate DEK, set passphrase, generate + show recovery code, write wraps.
2. With the DEK in RAM, read each plaintext journal file, encrypt in place
   (`[nonce][ct][tag]`), `push` ciphertext to Garage, and overwrite the local copy.
3. **Idempotent / resumable:** a crash mid-migration leaves a mix of encrypted and
   plaintext files; re-running detects each file's state (a small magic prefix /
   length+tag check distinguishes ciphertext from plaintext) and skips already-encrypted
   files. The journal is considered migrated once every tracked file is ciphertext.

After setup, the Phase-7 backup/restore `.zip` contains ciphertext — restore works, and
the user needs their passphrase or recovery code to read it.

**File-format detection:** ciphertext files begin with a 4-byte magic (`LEJ1`) +
version, so reads/migration can unambiguously tell ciphertext from a legacy plaintext
ledger file (which never starts with that magic).

## Error handling & edge cases

- **Server restart / new instance mid-session:** RAM DEK gone → API returns `locked`
  → client re-unlocks.
- **Wrong passphrase / recovery code:** GCM tag fails → "incorrect"; no server lockout
  (the work is offline-equivalent; rate-limit `/api/crypto/unlock` lightly to blunt
  online guessing).
- **Lost passphrase, have recovery code:** recovery flow. **Lost everything:** destructive
  reset only.
- **Migration interrupted:** idempotent/resumable as above.
- **GCM nonces:** random 96-bit per write; acceptable at this volume.
- **Concurrency:** all encrypt/decrypt happens inside `withUserLock`, so no concurrent
  plaintext/ciphertext races.

## Build phasing (one spec, sequenced; each phase shippable & tested)

- **P1 — Crypto core + storage seam (no UI), behind a flag.**
  `lib/crypto/` (DEK/KEK, wrap/unwrap, per-file AES-GCM, Argon2id binding, recovery
  codes, magic-prefix format) + `lib/crypto/session-keys.ts`; `userCrypto` table +
  migration; encrypt/decrypt wired into `lib/storage/sync.ts` pull/push; `/api/crypto/unlock`.
  Fully unit- + integration-tested against the memory object store.
- **P2 — Onboarding wizard + unlock screen + journal migration.**
  `features/crypto/` wizard (au-* design), per-session unlock screen, Lock control, the
  hard gate, and the one-time plaintext→ciphertext migration. End of P2 = passphrase-based
  zero-knowledge is fully usable.
- **P3 — Settings → Security:** change passphrase, forgot-passphrase (recovery), rotate
  recovery code, reset encryption.
- **Fast-follow — Passkey-PRF unlock:** `passkeyPrfWrap` table, WebAuthn PRF
  register/eval plumbing (`@better-auth/passkey` forwards `extensions`/
  `clientExtensionResults`), capability detection + fallback, add/remove-passkey flows,
  "Unlock with passkey" on the unlock screen. Additive — DEK unchanged.

## Testing strategy

- **Unit:** wrap/unwrap round-trip per method; wrong passphrase fails on the GCM tag;
  recovery flow; passphrase change preserves the DEK; per-file AAD rejects a swapped
  ciphertext; magic-prefix detection; injected RNG for deterministic vectors.
- **Integration:** unlock → `ledger` compute succeeds; lock → compute returns `locked`;
  server-restart → `locked` path; `pull`/`push` round-trip ciphertext through the memory
  object store; conflict-detection still fires on ciphertext ETags.
- **Migration:** plaintext journal → encrypted on first setup; plaintext removed/overwritten;
  interrupted-then-resumed migration converges; backup `.zip` contains ciphertext.

## Non-goals (v1)

- Full client-side E2E / browser-side `ledger`.
- Server-side key escrow or any recovery path that lets the server (or a third party
  such as Google) decrypt.
- Cross-instance shared session keys (horizontal scale).
- Per-field / per-transaction encryption (whole-file granularity only).
- Passkey-PRF unlock (scheduled as the fast-follow, not v1).
