# Encrypted User Journals — Design Spec

**Date:** 2026-06-22
**Phase:** 7 (Multi-user hardening)
**Status:** Approved design (no implementation scheduled — captured for later)

## Summary

Encrypt each user's ledger journal so that data at rest (Postgres rows + on-disk
files + backups) is useless without a secret only the user holds. The scheme is
**envelope encryption with session-scoped decryption**: one per-user Data
Encryption Key (DEK) encrypts the journal; that DEK is wrapped by one or more
unlock methods (passphrase, recovery code, optional passkey-PRF). On login the
user unlocks client-side, the raw DEK is handed to the server, and the server
holds it **in RAM only** for the life of the session to run the `ledger` binary.

This is **zero-knowledge at rest**, not full end-to-end. The distinction is
deliberate and is the central design decision (see below).

## Why session-scoped, not full E2E

The app's entire compute model is server-side: journals are stored as files
under `getJournalDir(userId)` (`lib/journal/repository.ts`) and every balance,
register, and report is produced by shelling out to the real `ledger` binary
(`utils/runLedger.ts`, `utils/runLedgerForUser.ts`, `lib/journal/verify.ts`).
The browser only renders results.

True E2E (the server *never* sees plaintext) would require running `ledger` in
the browser (WASM or a reimplementation) — effectively a rewrite of the compute
layer, and the loss of the real binary's behavior. Rejected.

**Chosen model — session-scoped decryption:** the DEK reaches the server only in
memory, only while the user is logged in, and is never persisted. This defeats
the realistic threats for a self-hosted app:

| Threat | Defended? |
| --- | --- |
| Stolen Postgres dump | ✅ only Argon2-wrapped DEK copies + ciphertext |
| Stolen disk / journal files | ✅ ciphertext only |
| Stolen backup `.zip` | ✅ ciphertext only |
| Offline / cold server compromise | ✅ no key material at rest |
| Curious DBA / operator (data at rest) | ✅ |
| **Live-rooted server during an active session** | ❌ (would require full E2E) |

## Decisions (locked during brainstorming)

1. **Threat model:** zero-knowledge at rest; server-side `ledger` preserved.
2. **Baseline unlock:** passphrase + one-time recovery code, with passkey-PRF as
   an optional convenience wrap. (Matches the 1Password / Bitwarden convention:
   a user secret is the always-available baseline, a recovery code is the offline
   fallback, passkey/biometric is a convenience layer — never the only path.)
3. **Lock policy:** unlock once per login session; stays unlocked until logout,
   session expiry, or server restart (RAM clears). Plus a manual **Lock** button
   so the user can drop the key on demand.

## Key hierarchy — one DEK, many wraps

```
                     ┌─────────── DEK (random 256-bit) ───────────┐
                     │      encrypts all journal files at rest      │
                     └──────────────────────────────────────────────┘
                          ▲              ▲                  ▲
          wrap_pass ──────┘   wrap_recovery ──┘   wrap_prf[per-passkey] ─┘
    KEK = Argon2id(passphrase)  KEK = HKDF(recovery code)  KEK = HKDF(PRF output)
```

- The **DEK** is generated once at setup and **never changes** — so changing the
  passphrase, rotating the recovery code, or adding/removing a passkey re-wraps a
  copy of the DEK but never re-encrypts journal data.
- Each unlock method derives a **KEK** that AES-256-GCM-encrypts (wraps) a copy
  of the DEK. All wraps decrypt to the same DEK.
- **Correctness check** is the GCM auth tag: a wrong passphrase fails to decrypt
  its wrap. No separate password hash/verifier is stored (nothing extra to
  brute-force).

## Unlock & session flow

1. User authenticates (Google / magic link / passkey) — better-auth, identity only.
2. Browser fetches the relevant wrap + salt for the chosen unlock method.
3. Browser derives the KEK **locally** and AES-GCM-decrypts the wrap to recover
   the DEK. The passphrase / recovery code / PRF output **never leaves the browser.**
4. Browser `POST`s the **raw DEK** to the server over TLS (`/crypto/unlock`); the
   server stores it in an in-memory map keyed by session id (TTL = session).
   The browser then **discards** its copy of the DEK.
5. On unlock, the server decrypts the journal into a per-session **tmpfs**
   (RAM-backed) working directory and runs `ledger` against it for the session.
6. **Writes** (journal edits) update the tmpfs working copy and re-encrypt back to
   the at-rest store via the repository layer.
7. **Lock / logout / expiry / restart:** shred the tmpfs working dir and drop the
   DEK from the in-memory map. Subsequent requests see a `locked` state and the
   client re-unlocks (one tap with passkey-PRF, or re-type passphrase).

Because the browser never persists the DEK (only holds it transiently during
step 3–4), post-unlock XSS cannot exfiltrate a stored browser key.

## Storage at rest (Postgres + Drizzle)

- **`user_crypto`** (1 row/user): `user_id`, `wrap_passphrase`, `pass_salt`,
  `argon_params`, `wrap_recovery`, `recovery_created_at`, `kdf_version`,
  `created_at`. Never stores: cleartext DEK, passphrase, or recovery code.
- **`passkey_prf_wrap`** (1 row per PRF-enabled passkey): `credential_id` (FK to
  the better-auth passkey table), `user_id`, `prf_salt`, `wrap_prf`.
- **Journal files on disk:** each file (main, `include`s, price DB) encrypted with
  AES-256-GCM under a per-file subkey `HKDF(DEK, info = relative_path)`, with the
  path bound as **AAD** so ciphertexts can't be swapped between files. Random
  96-bit nonce per write. File layout: `[nonce][ciphertext][tag]`.

## Recovery & key-management flows

- **Forgot passphrase:** authenticate → enter recovery code → client unwraps DEK
  via `wrap_recovery` → prompt new passphrase → re-wrap → upload new
  `wrap_passphrase`. Optionally rotate the recovery code.
- **Change passphrase:** unlock (DEK in hand) → derive new KEK → re-wrap → upload.
  No data re-encryption.
- **Add passkey:** while unlocked, register passkey with the PRF extension →
  derive `KEK_prf` from the PRF output → wrap DEK → store `passkey_prf_wrap` row.
- **Remove passkey:** delete its `passkey_prf_wrap` row (and the credential).
- **Lost all passkeys but know passphrase:** just use the passphrase.
- **Lost everything (no passphrase, no recovery code, no passkey):** data is
  unrecoverable by design. Offer an explicit, destructive **reset crypto** =
  wipe journals + crypto rows and start fresh. No server-side escrow.

## Crypto primitives

- **KDF (passphrase):** Argon2id, client-side via a WASM lib (e.g. `hash-wasm`).
  Params stored per-user for forward-compat (start ~`m=64MB, t=3, p=1`,
  `kdf_version` for future bumps). WebCrypto lacks Argon2; PBKDF2-SHA256 is the
  zero-dependency fallback if WASM is undesirable.
- **Symmetric:** AES-256-GCM — WebCrypto in the browser, Node `crypto` server-side.
- **PRF output → key:** HKDF-SHA256 (WebCrypto native).
- **Recovery code:** 256-bit random, shown once as grouped Base32, used as key
  material via HKDF; never stored server-side.
- **Passkey PRF transport:** `@better-auth/passkey` already forwards arbitrary
  WebAuthn extensions (`optionsJSON.extensions`) and surfaces
  `clientExtensionResults` only when called with `returnWebAuthnResponse: true`,
  while stripping it from the body sent to the server. Register with
  `extensions: { prf: {} }` (check `clientExtensionResults.prf.enabled`), then on
  unlock use `extensions: { prf: { eval: { first: <prf_salt> } } }` and read
  `clientExtensionResults.prf.results.first`.

## Migration & rollout

Existing journals are plaintext on disk and cannot be pre-encrypted server-side
(no key exists yet — that's the point). Migration is **per-user, on first unlock
setup:**

1. Gate the app behind a one-time "Set up encryption" onboarding after login.
2. On setup: generate DEK, set passphrase, generate + show recovery code, write
   wraps, encrypt existing plaintext files, then delete the plaintext.
3. Until a user completes setup, their journal remains plaintext (transition
   state); after setup it is encrypted.

The Phase-7 backup/restore `.zip` then contains ciphertext — restore works, and
the user needs their passphrase/recovery code to read it.

## Error handling & edge cases

- **Server restart / new instance mid-session:** RAM DEK is gone → API returns
  `locked` → client re-unlocks gracefully.
- **Horizontal scaling:** an in-memory DEK is not shared across instances. v1
  assumes single-instance / sticky sessions; a shared encrypted-DEK cache (e.g.
  Redis wrapped by a server ephemeral key) is a future concern and is explicitly
  out of scope here.
- **PRF unsupported (authenticator/browser):** detect `prf.enabled === false` at
  registration; don't offer the passkey-unlock wrap, fall back to passphrase.
- **GCM nonces:** random 96-bit per write; acceptable at this volume.

## Testing strategy

- **Unit:** wrap/unwrap round-trip per method; wrong passphrase fails on the GCM
  tag; recovery flow; passphrase change preserves the DEK; add/remove passkey wrap.
  Inject the RNG for deterministic vectors.
- **Integration:** unlock → `ledger` compute succeeds; lock → compute returns
  `locked`; server-restart → `locked` state path.
- **Migration:** plaintext journal → encrypted on first unlock; plaintext removed.

## Non-goals (v1)

- Full client-side E2E / browser-side `ledger`.
- Server-side key escrow or any account-recovery path that lets the server (or a
  third party such as Google) decrypt.
- Cross-instance shared session keys (horizontal scale).
- Per-field / per-transaction encryption (whole-file granularity only).
