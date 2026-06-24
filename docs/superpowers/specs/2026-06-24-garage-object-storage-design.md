# Garage Object Storage for Ledger Files — Design

**Date:** 2026-06-24
**Status:** Approved (brainstorming) — pending implementation plan
**Branch:** TBD (off `main`)

## Problem

Ledger journal files are the source of truth for all financial data. They
currently live on the local filesystem at `${DATA_DIR}/journals/<userId>/`
(`main.ledger` + any `include`d files), accessed through `JournalRepository`
(`lib/journal/repository.ts`) and read by the `ledger` CLI via
`execFile('ledger', ['-f', mainPath, ...])`.

Now that the app is moving to Postgres + Coolify containers, local disk is
ephemeral — journal files have no durable home in a container. We want
**Garage** (self-hosted, S3-compatible object storage by Deuxfleurs) to hold
the canonical journal files so containers can stay stateless.

The hard constraint: the `ledger` CLI reads files **only from a real local
filesystem path** — it cannot read from S3. So the design must bridge object
storage and the local filesystem around every `ledger` invocation.

## Decisions (locked)

- **Garage is the source of truth; local disk is an ephemeral cache.** On read,
  sync canonical files down to a local working dir (skipping unchanged objects
  by ETag), then run `ledger`. On write, mutate locally, verify, then upload to
  Garage.
- **Host:** Garage runs on the existing `new-raxel` Coolify host
  (`45.92.156.98`), not yet deployed — this work stands it up.
- **Data:** fresh start, no migration of existing files (consistent with the
  Postgres migration decision). A simple upload/import path for new files is
  enough.
- **Bridge mechanism:** prefix-mirror via `ListObjectsV2` + ETags (Approach A
  below).

## Approach (chosen): prefix-mirror via ListObjectsV2 + ETags

Treat each user's `journals/<userId>/` prefix as a directory.

- **Read:** one `ListObjectsV2` returns every object's key + ETag; download only
  objects whose ETag differs from the local copy; delete locally-stale files;
  run `ledger` on the local `main.ledger`. The sorted list of `(key, ETag)`
  pairs hashes into a **fingerprint** that becomes the query cache key,
  replacing the current mtime-based key.
- **Write:** mutate the local file, verify with the `ledger` CLI, then
  `PutObject` conditionally (`If-Match` on the known ETag), then update the local
  manifest.

Mirroring the whole prefix gets `main.ledger` + every `include`d file in one
shot, so the sync layer never has to parse the include graph. ETags give exact,
cheap change detection and map cleanly onto the existing `JournalRepository`
and `unstable_cache` seams.

**Rejected alternatives:**
- *Include-graph-follow sync* — reintroduces a chicken-and-egg (must read a file
  to know what to read next) and duplicates parser logic, with no benefit at
  this scale.
- *FUSE / s3fs mount* — adds an opaque kernel/daemon dependency in the container
  with weak consistency semantics and hard-to-debug failures. Overkill.

## Architecture

### Single storage directory: `lib/storage/`

All Garage actions live in one directory, split by action. `lib/journal/` holds
no storage code; `JournalRepository` imports from `lib/storage`.

```
lib/storage/
  objectStore.ts        # ObjectStore interface (list/get/put/delete + ETags)
  client.ts             # Garage S3 client config + backend factory (STORAGE_BACKEND)
  s3ObjectStore.ts      # S3ObjectStore — real Garage backend (@aws-sdk/client-s3)
  memoryObjectStore.ts  # in-memory fake (content-hash ETags) for tests / no-infra dev
  save.ts               # save/upload a file to Garage (conditional PutObject)
  download.ts           # download/pull object(s) from Garage to the local working dir
  sync.ts               # ensureLocal(userId): list + diff + download + manifest + fingerprint
  manifest.ts           # read/write local .manifest.json (relPath -> etag)
  index.ts              # public surface re-exported for the journal layer
```

### ObjectStore interface

```
list(prefix): Promise<{ key, etag, size }[]>
get(key): Promise<{ body: Buffer, etag }>
put(key, body, { ifMatch? }): Promise<{ etag }>
delete(key): Promise<void>
deletePrefix(prefix): Promise<void>
```

- **`S3ObjectStore`** — `@aws-sdk/client-s3`, path-style addressing, region
  `garage`, configured from env. The prod backend; works against Garage.
- **`MemoryObjectStore`** — in-memory map with content-hash ETags. Used by the
  test suite and `STORAGE_BACKEND=memory` local dev, so neither needs a real
  Garage.
- **`client.ts`** factory selects the backend from `STORAGE_BACKEND`.

### Sync layer (`sync.ts`, `save.ts`, `download.ts`, `manifest.ts`)

- **`ensureLocal(userId): Promise<Fingerprint>`** — `ListObjectsV2` on
  `journals/<userId>/`, diff remote ETags against the local manifest
  (`${DATA_DIR}/journals/<userId>/.manifest.json`), download only changed
  objects, delete locally-stale ones, rewrite the manifest. Returns the
  fingerprint = hash of sorted `key:etag` pairs.
- **`save(userId, relPath, content)`** — conditional `PutObject`
  (`If-Match` on known ETag), then manifest update.
- **`download`** — fetch one or many objects into the local working dir.
- **`manifest`** — read/write the local `.manifest.json` (relPath → etag).

### Wiring into existing seams (minimal change)

- `JournalRepository` (`lib/journal/repository.ts`) gains a dependency on the
  storage layer. Reads (`readFile`, `list`) call `ensureLocal` first; writes
  (`appendFile`, `writeFileAtomic`) write local then `save`. `emptyJournalDir`
  clears both store (`deletePrefix`) and local.
- `getMaxMtime()` is **replaced** by the sync fingerprint.
- `utils/runLedger.ts` — `unstable_cache` key becomes `(userId, fingerprint,
  args)` instead of `(userId, mtime, args)`. `ledger` still runs on the local
  `main.ledger`, unchanged.
- `lib/journal/verify.ts` stays put — it's a ledger-CLI concern, not storage.

## Data flow

**Read (every report page):**
1. service → repo → `ensureLocal(userId)`: `ListObjectsV2` → diff → download
   changed → write manifest → fingerprint.
2. `runLedger` keyed on `(userId, fingerprint, args)` via `unstable_cache` →
   `execFile('ledger', ['-f', localMain, ...])`.

**Write (add/edit/delete tx):**
1. Acquire per-user mutex (already exists).
2. `ensureLocal` — so we don't clobber a newer canonical version.
3. Mutate local file (`appendFile` / `writeFileAtomic`).
4. **Verify** via the `ledger` CLI locally.
5. On success → `save` (conditional `PutObject`) → manifest update. Cache
   invalidates naturally because the fingerprint changes.
6. On verify failure **or** a `412` conditional-put conflict → **rollback the
   local mutation** and throw.

The ordering change vs today (append-then-verify): the new order is
**mutate → verify → push**, so a bad or conflicting write never reaches Garage,
and a failed push never leaves local ahead of canonical.

**Import (single file / ZIP):** write all entries locally, verify, then `save`
each (or `deletePrefix` then upload for a full replace).

## Config / env

In `lib/env/index.ts` (+ `.env.example`):

- `STORAGE_BACKEND`: `s3 | memory`, default `memory` (tests + local dev need no
  infra; prod sets `s3`).
- S3 group — **required only when `STORAGE_BACKEND=s3`** via a Zod `superRefine`
  conditional, matching the existing fail-fast pattern:
  - `S3_ENDPOINT`
  - `S3_REGION` (default `garage`)
  - `S3_BUCKET` (e.g. `ledger`)
  - `S3_ACCESS_KEY_ID`
  - `S3_SECRET_ACCESS_KEY`
  - `S3_FORCE_PATH_STYLE` (default `true`)
- `DATA_DIR` keeps its name but is now an **ephemeral cache**, not the source of
  truth — noted in `.env.example`.

## Garage deployment on new-raxel

Deliverables here are a `docs/` runbook + `garage.toml`. Actually clicking
deploy in Coolify is the user's step (the host isn't reachable from this agent).

- Run `dxflrs/garage` as a Coolify service with two persistent volumes
  (`/var/lib/garage/data`, `/var/lib/garage/meta`).
- `garage.toml`: `rpc_secret`, S3 API bound on an internal port,
  `s3_region = "garage"`, path-style.
- One-time provisioning (documented commands):
  - `garage layout assign` (single node, replication factor 1)
  - `garage bucket create ledger`
  - `garage key create ledger-app`
  - `garage bucket allow --read --write ledger --key ledger-app`
- Expose the S3 endpoint **only on Coolify's internal network** to the app
  container (not public). App env points `S3_ENDPOINT` at it. Consistent with
  the locked-down admin-ports posture on that box (see new-raxel server notes).

## Failure behavior when Garage is unreachable

- **Reads:** if `ListObjectsV2` fails but a local cache + manifest exist → serve
  from cache and log a warning (availability wins for a single-user app). If the
  cache is cold → fail loudly with a clear error. (Strictness can be made
  configurable later.)
- **Writes:** `ensureLocal` failure or push failure → **rollback the local
  mutation and throw**; never leave local ahead of canonical. A `412` surfaces
  as "modified elsewhere — reload and retry."

## Concurrency / consistency

Single-admin app (locked to `sharp.fk@gmail.com`), so contention is low. The
per-user mutex already serializes writes within an instance. Conditional
`PutObject` (`If-Match`) guards the rare two-instance race; on `412`, re-sync and
surface a retry error.

## Testing

- Unit-test `sync.ts` / `save.ts` / `download.ts` against `MemoryObjectStore`:
  list → diff → download, manifest correctness, fingerprint stability/change,
  conditional-put conflict, rollback-on-verify-failure.
- The existing ~345 tests run with `STORAGE_BACKEND=memory`; the journal
  repo/service suites get the memory backend injected and keep passing with no
  real Garage.
- One optional integration test against a real S3 endpoint, gated behind an env
  flag (skipped in CI unless configured).

## Files

**New:**
- `lib/storage/objectStore.ts`, `client.ts`, `s3ObjectStore.ts`,
  `memoryObjectStore.ts`, `save.ts`, `download.ts`, `sync.ts`, `manifest.ts`,
  `index.ts`
- `docs/<runbook>.md`, `garage.toml`
- Sync test files + fixtures

**Modified:**
- `lib/journal/repository.ts` (inject storage; `ensureLocal` on read, `save` on
  write; `emptyJournalDir` clears store + local; replace `getMaxMtime` with
  fingerprint)
- `lib/journal/service.ts` (write ordering: mutate → verify → push; rollback)
- `utils/runLedger.ts` (fingerprint cache key)
- `lib/env/index.ts`, `.env.example`
- `PLAN.md` (entry under Phase 7 — multi-user hardening / backups)

## Out of scope

- Data migration of existing journal files (fresh start).
- Multi-node Garage / replication beyond factor 1.
- Public exposure of the Garage endpoint.
- Encrypted-at-rest journals (separate Phase 7 item).
