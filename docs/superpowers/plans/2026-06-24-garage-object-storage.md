# Garage Object Storage for Ledger Files — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Garage (S3-compatible object storage) the source of truth for ledger journal files, with the local filesystem acting as an ephemeral cache that is synced down before every `ledger` invocation and pushed up after every successful write.

**Architecture:** A single `lib/storage/` directory owns all Garage actions. An `ObjectStore` interface has two backends: `S3ObjectStore` (Garage, prod) and `MemoryObjectStore` (tests + no-infra dev). A sync layer mirrors each user's `journals/<userId>/` prefix to/from a local working dir using `ListObjectsV2` + ETags, producing a content **fingerprint** that replaces the current mtime-based query cache key. `JournalService` pulls before reads, and mutates → verifies → pushes on writes; `runLedger` pulls and keys its cache on the fingerprint.

**Tech Stack:** Next.js (App Router), TypeScript, Drizzle/Postgres, Zod, Vitest, `@aws-sdk/client-s3`, the `ledger` CLI (invoked via `execFile`).

## Global Constraints

- **Single source of truth:** Garage holds canonical journal files; local disk under `DATA_DIR` is an ephemeral cache only.
- **`ledger` CLI reads local paths only** — every read must ensure local files are present/fresh first; every write must verify locally before pushing.
- **Backend selected by env:** `STORAGE_BACKEND` ∈ `{s3, memory}`, default `memory`. S3 vars required only when `STORAGE_BACKEND=s3`.
- **Object key layout:** `journals/<userId>/<relPath>` mirrors the local layout `${DATA_DIR}/journals/<userId>/<relPath>`.
- **ETag is opaque per backend.** The manifest and fingerprint store/compare whatever string the store returns; never assume MD5.
- **Conflict detection lives in the sync layer** (compare remote ETags to the pulled manifest), not via `If-Match` (Garage support is not assumed).
- **Failure policy:** reads serve stale local cache + warn when Garage is unreachable but a manifest exists, else fail loudly; writes roll back the local mutation and throw on any pull/verify/push failure.
- **Patterns:** follow existing repo/service split; tests colocated as `*.test.ts`; use `setupTestDb`/`teardownTestDb` from `@/lib/test-utils/db` where a DB is needed. DRY, YAGNI, TDD, frequent commits.
- **Commands:** test `pnpm test`, single file `pnpm vitest run <path>`, type-check `pnpm type-check`, lint `pnpm lint`.
- **Commit trailer:** end each commit message with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

### Task 1: Config foundation — dependency + env vars

**Files:**
- Modify: `package.json` (add `@aws-sdk/client-s3`)
- Modify: `lib/env/index.ts`
- Modify: `.env.example`
- Test: `lib/env/storage-env.test.ts` (Create)

**Interfaces:**
- Consumes: nothing.
- Produces: `env.STORAGE_BACKEND` (`'s3' | 'memory'`), `env.S3_ENDPOINT`, `env.S3_REGION` (string, default `'garage'`), `env.S3_BUCKET`, `env.S3_ACCESS_KEY_ID`, `env.S3_SECRET_ACCESS_KEY`, `env.S3_FORCE_PATH_STYLE` (boolean, default `true`). When `STORAGE_BACKEND==='s3'`, the four `S3_ENDPOINT/S3_BUCKET/S3_ACCESS_KEY_ID/S3_SECRET_ACCESS_KEY` are required non-empty.

- [ ] **Step 1: Install the AWS S3 client**

Run: `pnpm add @aws-sdk/client-s3`
Expected: `package.json` gains `"@aws-sdk/client-s3"` under dependencies; lockfile updates.

- [ ] **Step 2: Write the failing env test**

Create `lib/env/storage-env.test.ts`. The env module parses `process.env` at import time and throws on invalid config, so each case imports it in isolation via `vitest.resetModules()` + dynamic import.

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// A minimal valid baseline so the rest of the schema passes; we only vary the
// storage-related vars per test.
const BASE_ENV: Record<string, string> = {
  BETTER_AUTH_SECRET: 'x'.repeat(32),
  DATABASE_URL: 'postgres://u:p@localhost:5432/db',
  POSTAL_API_URL: 'https://postal.example.com',
  POSTAL_API_KEY: 'k',
};

const loadEnv = async (overrides: Record<string, string | undefined>) => {
  vi.resetModules();
  const prev = process.env;
  process.env = { ...BASE_ENV, ...overrides } as NodeJS.ProcessEnv;
  try {
    const mod = await import('./index');
    return mod.env;
  } finally {
    process.env = prev;
  }
};

describe('storage env', () => {
  it('defaults STORAGE_BACKEND to memory and needs no S3 vars', async () => {
    const env = await loadEnv({});
    expect(env.STORAGE_BACKEND).toBe('memory');
  });

  it('defaults S3_REGION to garage and S3_FORCE_PATH_STYLE to true', async () => {
    const env = await loadEnv({
      STORAGE_BACKEND: 's3',
      S3_ENDPOINT: 'http://garage:3900',
      S3_BUCKET: 'ledger',
      S3_ACCESS_KEY_ID: 'id',
      S3_SECRET_ACCESS_KEY: 'secret',
    });
    expect(env.S3_REGION).toBe('garage');
    expect(env.S3_FORCE_PATH_STYLE).toBe(true);
  });

  it('throws when STORAGE_BACKEND=s3 but S3 vars are missing', async () => {
    await expect(loadEnv({ STORAGE_BACKEND: 's3' })).rejects.toThrow(
      /S3_ENDPOINT/
    );
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm vitest run lib/env/storage-env.test.ts`
Expected: FAIL — `env.STORAGE_BACKEND` is `undefined` (schema not extended yet).

- [ ] **Step 4: Extend the env schema**

In `lib/env/index.ts`, add inside the `clientEnvSchema.extend({ ... })` object (after the `Prices` block, before the closing `})`):

```ts
  // Object storage (Garage / S3-compatible). DATA_DIR is the local cache;
  // these point at the canonical store. S3_* are required only when
  // STORAGE_BACKEND === 's3' (enforced by the superRefine below).
  STORAGE_BACKEND: z.enum(['s3', 'memory']).default('memory'),
  S3_ENDPOINT: z.string().url().optional(),
  S3_REGION: z.string().default('garage'),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: z
    .union([z.literal('true'), z.literal('false')])
    .default('true')
    .transform((v) => v === 'true'),
```

Then change the schema construction so the conditional check runs. Replace:

```ts
const envSchema = clientEnvSchema.extend({
```

…keep the `.extend({...})` block exactly, and immediately after the closing `})` of `.extend`, append a `.superRefine`:

```ts
}).superRefine((val, ctx) => {
  if (val.STORAGE_BACKEND !== 's3') return;
  const required = [
    'S3_ENDPOINT',
    'S3_BUCKET',
    'S3_ACCESS_KEY_ID',
    'S3_SECRET_ACCESS_KEY',
  ] as const;
  for (const key of required) {
    if (!val[key]) {
      ctx.addIssue({
        code: 'custom',
        path: [key],
        message: `${key} is required when STORAGE_BACKEND=s3`,
      });
    }
  }
});
```

Note: `z.infer` still works on a `ZodEffects` (the result of `.superRefine`); `Env` type and `parsed.data` are unaffected.

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm vitest run lib/env/storage-env.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Document the vars in `.env.example`**

Add a section to `.env.example`:

```bash
# ---- Object storage (ledger files) ----
# Garage holds the canonical journal files; DATA_DIR is an ephemeral local cache.
# STORAGE_BACKEND=memory (default) keeps everything in-process — for local dev/tests.
# Set STORAGE_BACKEND=s3 in production and fill the S3_* vars below.
STORAGE_BACKEND=memory
# S3_ENDPOINT=http://garage:3900
# S3_REGION=garage
# S3_BUCKET=ledger
# S3_ACCESS_KEY_ID=
# S3_SECRET_ACCESS_KEY=
# S3_FORCE_PATH_STYLE=true
```

- [ ] **Step 7: Type-check and commit**

Run: `pnpm type-check` → Expected: clean.

```bash
git add package.json pnpm-lock.yaml lib/env/index.ts lib/env/storage-env.test.ts .env.example
git commit -m "feat(storage): add S3/Garage env vars and aws-sdk dependency"
```

---

### Task 2: ObjectStore interface + MemoryObjectStore

**Files:**
- Create: `lib/storage/objectStore.ts`
- Create: `lib/storage/memoryObjectStore.ts`
- Test: `lib/storage/memoryObjectStore.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type ObjectMeta = { key: string; etag: string; size: number }`
  - `type GetResult = { body: Buffer; etag: string }`
  - `interface ObjectStore { list(prefix: string): Promise<ObjectMeta[]>; get(key: string): Promise<GetResult>; put(key: string, body: Buffer): Promise<{ etag: string }>; delete(key: string): Promise<void>; deletePrefix(prefix: string): Promise<void> }`
  - `class MemoryObjectStore implements ObjectStore` — ETag is `sha256` hex of the body.

- [ ] **Step 1: Write the interface file (no test — pure types)**

Create `lib/storage/objectStore.ts`:

```ts
/** Metadata for one stored object. `etag` is opaque and backend-specific. */
export type ObjectMeta = { key: string; etag: string; size: number };

/** Result of fetching an object's bytes. */
export type GetResult = { body: Buffer; etag: string };

/**
 * Minimal S3-shaped object store. Implementations: S3ObjectStore (Garage) and
 * MemoryObjectStore (tests/dev). Keys are full paths like
 * `journals/<userId>/main.ledger`. Conflict detection is done by the sync layer
 * (comparing ETags), not here.
 */
export interface ObjectStore {
  /** Lists every object whose key starts with `prefix`. */
  list(prefix: string): Promise<ObjectMeta[]>;
  /** Fetches one object. Rejects if the key does not exist. */
  get(key: string): Promise<GetResult>;
  /** Writes one object, returning its new ETag. */
  put(key: string, body: Buffer): Promise<{ etag: string }>;
  /** Deletes one object. No-op if it does not exist. */
  delete(key: string): Promise<void>;
  /** Deletes every object under `prefix`. */
  deletePrefix(prefix: string): Promise<void>;
}
```

- [ ] **Step 2: Write the failing MemoryObjectStore test**

Create `lib/storage/memoryObjectStore.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryObjectStore } from './memoryObjectStore';

describe('MemoryObjectStore', () => {
  let store: MemoryObjectStore;
  beforeEach(() => {
    store = new MemoryObjectStore();
  });

  it('put then get round-trips the body and returns a stable etag', async () => {
    const { etag } = await store.put('a/x.ledger', Buffer.from('hello'));
    const got = await store.get('a/x.ledger');
    expect(got.body.toString()).toBe('hello');
    expect(got.etag).toBe(etag);
  });

  it('etag changes when content changes', async () => {
    const first = await store.put('a/x.ledger', Buffer.from('one'));
    const second = await store.put('a/x.ledger', Buffer.from('two'));
    expect(second.etag).not.toBe(first.etag);
  });

  it('list returns only keys under the prefix with meta', async () => {
    await store.put('a/x.ledger', Buffer.from('1'));
    await store.put('a/sub/y.ledger', Buffer.from('22'));
    await store.put('b/z.ledger', Buffer.from('333'));
    const entries = await store.list('a/');
    expect(entries.map((e) => e.key).sort()).toEqual([
      'a/sub/y.ledger',
      'a/x.ledger',
    ]);
    const x = entries.find((e) => e.key === 'a/x.ledger')!;
    expect(x.size).toBe(1);
    expect(x.etag).toHaveLength(64); // sha256 hex
  });

  it('get rejects for a missing key', async () => {
    await expect(store.get('nope')).rejects.toThrow();
  });

  it('delete removes one key; deletePrefix removes the subtree', async () => {
    await store.put('a/x.ledger', Buffer.from('1'));
    await store.put('a/y.ledger', Buffer.from('2'));
    await store.delete('a/x.ledger');
    expect((await store.list('a/')).map((e) => e.key)).toEqual(['a/y.ledger']);
    await store.deletePrefix('a/');
    expect(await store.list('a/')).toEqual([]);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm vitest run lib/storage/memoryObjectStore.test.ts`
Expected: FAIL — module `./memoryObjectStore` not found.

- [ ] **Step 4: Implement MemoryObjectStore**

Create `lib/storage/memoryObjectStore.ts`:

```ts
import { createHash } from 'crypto';
import type { GetResult, ObjectMeta, ObjectStore } from './objectStore';

const sha256 = (body: Buffer): string =>
  createHash('sha256').update(body).digest('hex');

/** In-memory ObjectStore for tests and no-infra dev. ETag = sha256(body). */
export class MemoryObjectStore implements ObjectStore {
  private readonly objects = new Map<string, Buffer>();

  async list(prefix: string): Promise<ObjectMeta[]> {
    const out: ObjectMeta[] = [];
    for (const [key, body] of this.objects) {
      if (key.startsWith(prefix)) {
        out.push({ key, etag: sha256(body), size: body.length });
      }
    }
    return out;
  }

  async get(key: string): Promise<GetResult> {
    const body = this.objects.get(key);
    if (!body) throw new Error(`MemoryObjectStore: missing key ${key}`);
    return { body, etag: sha256(body) };
  }

  async put(key: string, body: Buffer): Promise<{ etag: string }> {
    this.objects.set(key, Buffer.from(body));
    return { etag: sha256(body) };
  }

  async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }

  async deletePrefix(prefix: string): Promise<void> {
    for (const key of [...this.objects.keys()]) {
      if (key.startsWith(prefix)) this.objects.delete(key);
    }
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm vitest run lib/storage/memoryObjectStore.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add lib/storage/objectStore.ts lib/storage/memoryObjectStore.ts lib/storage/memoryObjectStore.test.ts
git commit -m "feat(storage): ObjectStore interface + in-memory backend"
```

---

### Task 3: S3ObjectStore (Garage backend) + factory

**Files:**
- Create: `lib/storage/s3ObjectStore.ts`
- Create: `lib/storage/client.ts`
- Test: `lib/storage/client.test.ts`

**Interfaces:**
- Consumes: `ObjectStore`, `MemoryObjectStore`, `env`.
- Produces:
  - `class S3ObjectStore implements ObjectStore` — ctor `({ client: S3Client, bucket: string })`.
  - `getObjectStore(): ObjectStore` — memoized; `s3` → S3ObjectStore from env, else MemoryObjectStore.
  - `resetObjectStore(): void` — clears the memo (tests only).

- [ ] **Step 1: Implement S3ObjectStore (thin wrapper; verified via integration, not unit)**

Create `lib/storage/s3ObjectStore.ts`:

```ts
import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  type S3Client,
} from '@aws-sdk/client-s3';
import type { GetResult, ObjectMeta, ObjectStore } from './objectStore';

const stripQuotes = (etag: string | undefined): string =>
  (etag ?? '').replace(/^"|"$/g, '');

/** Garage / S3-compatible ObjectStore. ETag is the server's (md5-based) header. */
export class S3ObjectStore implements ObjectStore {
  constructor(
    private readonly client: S3Client,
    private readonly bucket: string
  ) {}

  async list(prefix: string): Promise<ObjectMeta[]> {
    const out: ObjectMeta[] = [];
    let token: string | undefined;
    do {
      const res = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          ContinuationToken: token,
        })
      );
      for (const obj of res.Contents ?? []) {
        out.push({
          key: obj.Key!,
          etag: stripQuotes(obj.ETag),
          size: obj.Size ?? 0,
        });
      }
      token = res.IsTruncated ? res.NextContinuationToken : undefined;
    } while (token);
    return out;
  }

  async get(key: string): Promise<GetResult> {
    const res = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key })
    );
    const body = Buffer.from(await res.Body!.transformToByteArray());
    return { body, etag: stripQuotes(res.ETag) };
  }

  async put(key: string, body: Buffer): Promise<{ etag: string }> {
    const res = await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body })
    );
    return { etag: stripQuotes(res.ETag) };
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key })
    );
  }

  async deletePrefix(prefix: string): Promise<void> {
    const entries = await this.list(prefix);
    if (entries.length === 0) return;
    await this.client.send(
      new DeleteObjectsCommand({
        Bucket: this.bucket,
        Delete: { Objects: entries.map((e) => ({ Key: e.key })) },
      })
    );
  }
}
```

- [ ] **Step 2: Write the failing factory test**

Create `lib/storage/client.test.ts`:

```ts
import { describe, it, expect, afterEach } from 'vitest';
import { getObjectStore, resetObjectStore } from './client';
import { MemoryObjectStore } from './memoryObjectStore';

afterEach(() => resetObjectStore());

describe('getObjectStore', () => {
  it('returns a MemoryObjectStore when STORAGE_BACKEND is memory (default)', () => {
    // Test env has STORAGE_BACKEND unset → defaults to 'memory'.
    expect(getObjectStore()).toBeInstanceOf(MemoryObjectStore);
  });

  it('memoizes the instance', () => {
    expect(getObjectStore()).toBe(getObjectStore());
  });

  it('resetObjectStore clears the memo', () => {
    const first = getObjectStore();
    resetObjectStore();
    expect(getObjectStore()).not.toBe(first);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm vitest run lib/storage/client.test.ts`
Expected: FAIL — module `./client` not found.

- [ ] **Step 4: Implement the factory**

Create `lib/storage/client.ts`:

```ts
import { S3Client } from '@aws-sdk/client-s3';
import { env } from '@/lib/env';
import { MemoryObjectStore } from './memoryObjectStore';
import type { ObjectStore } from './objectStore';
import { S3ObjectStore } from './s3ObjectStore';

let cached: ObjectStore | null = null;

const buildS3Store = (): ObjectStore => {
  const client = new S3Client({
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY_ID!,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY!,
    },
  });
  return new S3ObjectStore(client, env.S3_BUCKET!);
};

/** Returns the process-wide ObjectStore, building it from env on first call. */
export const getObjectStore = (): ObjectStore => {
  if (cached) return cached;
  cached = env.STORAGE_BACKEND === 's3' ? buildS3Store() : new MemoryObjectStore();
  return cached;
};

/** Test-only: drop the memoized store so the next getObjectStore() rebuilds. */
export const resetObjectStore = (): void => {
  cached = null;
};
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm vitest run lib/storage/client.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add lib/storage/s3ObjectStore.ts lib/storage/client.ts lib/storage/client.test.ts
git commit -m "feat(storage): Garage S3 backend + env-driven store factory"
```

---

### Task 4: Manifest + key helpers + fingerprint

**Files:**
- Create: `lib/storage/manifest.ts`
- Test: `lib/storage/manifest.test.ts`

**Interfaces:**
- Consumes: `getJournalDir` from `@/lib/journal/layout`.
- Produces:
  - `type Manifest = Record<string, string>` (relPath → etag)
  - `userPrefix(userId: string): string` → `journals/<userId>/`
  - `keyFor(userId: string, relPath: string): string`
  - `relPathFromKey(userId: string, key: string): string`
  - `localPathFor(userId: string, relPath: string): string`
  - `readManifest(userId: string): Promise<Manifest>` (`{}` if absent)
  - `writeManifest(userId: string, m: Manifest): Promise<void>`
  - `manifestRelName` constant `'.manifest.json'`
  - `fingerprint(entries: { key: string; etag: string }[]): string`

- [ ] **Step 1: Write the failing test**

Create `lib/storage/manifest.test.ts`:

```ts
import { promises as fs } from 'fs';
import path from 'path';
import { describe, it, expect, afterEach } from 'vitest';
import { getJournalDir } from '@/lib/journal/layout';
import {
  fingerprint,
  keyFor,
  localPathFor,
  readManifest,
  relPathFromKey,
  userPrefix,
  writeManifest,
} from './manifest';

const USER = 'manifest-user';
afterEach(() => fs.rm(getJournalDir(USER), { recursive: true, force: true }));

describe('key helpers', () => {
  it('builds and reverses keys', () => {
    expect(userPrefix(USER)).toBe(`journals/${USER}/`);
    expect(keyFor(USER, 'sub/a.ledger')).toBe(`journals/${USER}/sub/a.ledger`);
    expect(relPathFromKey(USER, `journals/${USER}/sub/a.ledger`)).toBe(
      'sub/a.ledger'
    );
    expect(localPathFor(USER, 'a.ledger')).toBe(
      path.join(getJournalDir(USER), 'a.ledger')
    );
  });
});

describe('manifest io', () => {
  it('returns {} when no manifest exists', async () => {
    expect(await readManifest(USER)).toEqual({});
  });

  it('round-trips a manifest', async () => {
    await writeManifest(USER, { 'main.ledger': 'etag1' });
    expect(await readManifest(USER)).toEqual({ 'main.ledger': 'etag1' });
  });
});

describe('fingerprint', () => {
  it('is order-independent and changes with content', () => {
    const a = fingerprint([
      { key: 'k1', etag: 'e1' },
      { key: 'k2', etag: 'e2' },
    ]);
    const b = fingerprint([
      { key: 'k2', etag: 'e2' },
      { key: 'k1', etag: 'e1' },
    ]);
    const c = fingerprint([
      { key: 'k1', etag: 'eX' },
      { key: 'k2', etag: 'e2' },
    ]);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it('is stable for the empty set', () => {
    expect(fingerprint([])).toBe(fingerprint([]));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run lib/storage/manifest.test.ts`
Expected: FAIL — module `./manifest` not found.

- [ ] **Step 3: Implement manifest.ts**

Create `lib/storage/manifest.ts`:

```ts
import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { getJournalDir } from '@/lib/journal/layout';

/** relPath (within the user's journal dir) → last-seen ETag. */
export type Manifest = Record<string, string>;

export const manifestRelName = '.manifest.json';

/** Garage key prefix for a user, e.g. `journals/<userId>/`. */
export const userPrefix = (userId: string): string => `journals/${userId}/`;

/** Full object key for a file inside the user's journal. POSIX separators. */
export const keyFor = (userId: string, relPath: string): string =>
  userPrefix(userId) + relPath.split(path.sep).join('/');

/** Inverse of keyFor: the relPath (OS separators) for a full key. */
export const relPathFromKey = (userId: string, key: string): string =>
  key.slice(userPrefix(userId).length).split('/').join(path.sep);

/** Absolute local cache path for a relPath inside the user's journal dir. */
export const localPathFor = (userId: string, relPath: string): string =>
  path.join(getJournalDir(userId), relPath);

const manifestPath = (userId: string): string =>
  path.join(getJournalDir(userId), manifestRelName);

export const readManifest = async (userId: string): Promise<Manifest> => {
  try {
    const raw = await fs.readFile(manifestPath(userId), 'utf-8');
    return JSON.parse(raw) as Manifest;
  } catch {
    return {};
  }
};

export const writeManifest = async (
  userId: string,
  m: Manifest
): Promise<void> => {
  await fs.mkdir(getJournalDir(userId), { recursive: true });
  await fs.writeFile(manifestPath(userId), JSON.stringify(m, null, 2), 'utf-8');
};

/** Order-independent content fingerprint of a set of (key, etag) pairs. */
export const fingerprint = (
  entries: { key: string; etag: string }[]
): string => {
  const body = [...entries]
    .map((e) => `${e.key}:${e.etag}`)
    .sort()
    .join('\n');
  return createHash('sha256').update(body).digest('hex');
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run lib/storage/manifest.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/storage/manifest.ts lib/storage/manifest.test.ts
git commit -m "feat(storage): manifest io, key helpers, and content fingerprint"
```

---

### Task 5: download.ts — pull (remote → local mirror)

**Files:**
- Create: `lib/storage/download.ts`
- Test: `lib/storage/download.test.ts`

**Interfaces:**
- Consumes: `ObjectStore`, `MemoryObjectStore`, manifest helpers, `getJournalDir`.
- Produces: `pullToLocal(store: ObjectStore, userId: string): Promise<{ fingerprint: string }>` — mirrors the remote prefix into the local journal dir (downloading only ETag-changed objects, deleting locally-stale files, skipping `.manifest.json`), rewrites the manifest, and returns the fingerprint. On a store error: if a manifest exists, logs a warning and returns the fingerprint computed from the manifest (serve-stale); otherwise rethrows.

- [ ] **Step 1: Write the failing test**

Create `lib/storage/download.test.ts`:

```ts
import { promises as fs } from 'fs';
import path from 'path';
import { describe, it, expect, afterEach } from 'vitest';
import { getJournalDir } from '@/lib/journal/layout';
import { MemoryObjectStore } from './memoryObjectStore';
import { keyFor, readManifest } from './manifest';
import { pullToLocal } from './download';

const USER = 'pull-user';
const dir = () => getJournalDir(USER);
const read = (rel: string) => fs.readFile(path.join(dir(), rel), 'utf-8');
afterEach(() => fs.rm(dir(), { recursive: true, force: true }));

const seed = async (store: MemoryObjectStore, files: Record<string, string>) => {
  for (const [rel, content] of Object.entries(files)) {
    await store.put(keyFor(USER, rel), Buffer.from(content));
  }
};

describe('pullToLocal', () => {
  it('downloads all remote files and writes a manifest', async () => {
    const store = new MemoryObjectStore();
    await seed(store, { 'main.ledger': 'include ./sub.ledger\n', 'sub.ledger': 'x' });
    const { fingerprint } = await pullToLocal(store, USER);
    expect(await read('main.ledger')).toBe('include ./sub.ledger\n');
    expect(await read('sub.ledger')).toBe('x');
    expect(Object.keys(await readManifest(USER)).sort()).toEqual([
      'main.ledger',
      'sub.ledger',
    ]);
    expect(fingerprint).toHaveLength(64);
  });

  it('removes local files no longer present remotely', async () => {
    const store = new MemoryObjectStore();
    await seed(store, { 'main.ledger': 'a', 'gone.ledger': 'b' });
    await pullToLocal(store, USER);
    await store.delete(keyFor(USER, 'gone.ledger'));
    await pullToLocal(store, USER);
    await expect(read('gone.ledger')).rejects.toThrow();
    expect(await read('main.ledger')).toBe('a');
  });

  it('changes the fingerprint when remote content changes', async () => {
    const store = new MemoryObjectStore();
    await seed(store, { 'main.ledger': 'a' });
    const first = (await pullToLocal(store, USER)).fingerprint;
    await store.put(keyFor(USER, 'main.ledger'), Buffer.from('b'));
    const second = (await pullToLocal(store, USER)).fingerprint;
    expect(second).not.toBe(first);
    expect(await read('main.ledger')).toBe('b');
  });

  it('returns a stable fingerprint for an empty remote (new user)', async () => {
    const store = new MemoryObjectStore();
    const { fingerprint } = await pullToLocal(store, USER);
    expect(fingerprint).toHaveLength(64);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run lib/storage/download.test.ts`
Expected: FAIL — module `./download` not found.

- [ ] **Step 3: Implement download.ts**

Create `lib/storage/download.ts`:

```ts
import { promises as fs } from 'fs';
import path from 'path';
import { getJournalDir } from '@/lib/journal/layout';
import {
  fingerprint,
  manifestRelName,
  readManifest,
  relPathFromKey,
  userPrefix,
  writeManifest,
  type Manifest,
} from './manifest';
import type { ObjectStore } from './objectStore';

/** Lists the local journal dir recursively, returning relPaths (excludes the
 * manifest file and any *.tmp scratch files from atomic writes). */
const listLocalRelPaths = async (dir: string): Promise<string[]> => {
  const out: string[] = [];
  const walk = async (abs: string, rel: string): Promise<void> => {
    let entries: import('fs').Dirent[];
    try {
      entries = await fs.readdir(abs, { withFileTypes: true });
    } catch {
      return; // dir does not exist yet
    }
    for (const e of entries) {
      const childRel = rel ? path.join(rel, e.name) : e.name;
      if (e.isDirectory()) {
        await walk(path.join(abs, e.name), childRel);
      } else if (e.name !== manifestRelName && !e.name.endsWith('.tmp')) {
        out.push(childRel);
      }
    }
  };
  await walk(dir, '');
  return out;
};

/**
 * Mirrors the user's remote prefix into the local journal dir. Downloads only
 * objects whose ETag differs from the local manifest, deletes local files no
 * longer present remotely, rewrites the manifest, and returns the fingerprint.
 *
 * If the store is unreachable but a manifest exists, serves the stale local
 * cache (warn + fingerprint from manifest). With no manifest, the error
 * propagates.
 */
export const pullToLocal = async (
  store: ObjectStore,
  userId: string
): Promise<{ fingerprint: string }> => {
  const dir = getJournalDir(userId);
  const prefix = userPrefix(userId);
  const prevManifest = await readManifest(userId);

  let remote;
  try {
    remote = await store.list(prefix);
  } catch (err) {
    if (Object.keys(prevManifest).length > 0) {
      console.warn(
        `[storage] Garage unreachable for ${userId}; serving stale local cache`,
        err
      );
      return {
        fingerprint: fingerprint(
          Object.entries(prevManifest).map(([rel, etag]) => ({
            key: prefix + rel.split(path.sep).join('/'),
            etag,
          }))
        ),
      };
    }
    throw err;
  }

  const nextManifest: Manifest = {};
  const remoteRelSet = new Set<string>();

  for (const obj of remote) {
    const rel = relPathFromKey(userId, obj.key);
    remoteRelSet.add(rel);
    nextManifest[rel] = obj.etag;
    const localAbs = path.join(dir, rel);
    if (prevManifest[rel] === obj.etag) {
      // Unchanged — only download if the local file is missing.
      try {
        await fs.access(localAbs);
        continue;
      } catch {
        // fall through to download
      }
    }
    const { body } = await store.get(obj.key);
    await fs.mkdir(path.dirname(localAbs), { recursive: true });
    await fs.writeFile(localAbs, body);
  }

  // Delete local files that are no longer in the remote set.
  for (const rel of await listLocalRelPaths(dir)) {
    if (!remoteRelSet.has(rel)) {
      await fs.rm(path.join(dir, rel), { force: true });
    }
  }

  await writeManifest(userId, nextManifest);
  return { fingerprint: fingerprint(remote) };
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run lib/storage/download.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/storage/download.ts lib/storage/download.test.ts
git commit -m "feat(storage): pull remote prefix into local cache with fingerprint"
```

---

### Task 6: save.ts — push (local → remote mirror) with conflict detection

**Files:**
- Create: `lib/storage/save.ts`
- Test: `lib/storage/save.test.ts`

**Interfaces:**
- Consumes: `ObjectStore`, manifest helpers, `getJournalDir`, `pullToLocal` (tests only).
- Produces:
  - `class StorageConflictError extends Error`
  - `pushFromLocal(store: ObjectStore, userId: string): Promise<void>` — verifies the remote still matches the pulled manifest (else throws `StorageConflictError`), uploads every local file, deletes remote objects with no local counterpart, and rewrites the manifest with the new ETags.

- [ ] **Step 1: Write the failing test**

Create `lib/storage/save.test.ts`:

```ts
import { promises as fs } from 'fs';
import path from 'path';
import { describe, it, expect, afterEach } from 'vitest';
import { getJournalDir } from '@/lib/journal/layout';
import { MemoryObjectStore } from './memoryObjectStore';
import { pullToLocal } from './download';
import { keyFor, readManifest } from './manifest';
import { StorageConflictError, pushFromLocal } from './save';

const USER = 'push-user';
const dir = () => getJournalDir(USER);
const writeLocal = async (rel: string, content: string) => {
  const abs = path.join(dir(), rel);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, content);
};
afterEach(() => fs.rm(dir(), { recursive: true, force: true }));

describe('pushFromLocal', () => {
  it('uploads new local files and records their etags in the manifest', async () => {
    const store = new MemoryObjectStore();
    await pullToLocal(store, USER); // empty remote → empty manifest
    await writeLocal('main.ledger', 'hello');
    await pushFromLocal(store, USER);
    const remote = await store.get(keyFor(USER, 'main.ledger'));
    expect(remote.body.toString()).toBe('hello');
    expect((await readManifest(USER))['main.ledger']).toBe(remote.etag);
  });

  it('deletes remote objects with no local counterpart', async () => {
    const store = new MemoryObjectStore();
    await store.put(keyFor(USER, 'old.ledger'), Buffer.from('x'));
    await pullToLocal(store, USER); // brings old.ledger local
    await fs.rm(path.join(dir(), 'old.ledger'));
    await writeLocal('main.ledger', 'new');
    await pushFromLocal(store, USER);
    expect((await store.list(keyFor(USER, ''))).map((e) => e.key)).toEqual([
      keyFor(USER, 'main.ledger'),
    ]);
  });

  it('throws StorageConflictError when remote changed since the pull', async () => {
    const store = new MemoryObjectStore();
    await store.put(keyFor(USER, 'main.ledger'), Buffer.from('v1'));
    await pullToLocal(store, USER);
    // Another writer changes the remote out from under us.
    await store.put(keyFor(USER, 'main.ledger'), Buffer.from('v2-elsewhere'));
    await writeLocal('main.ledger', 'v2-mine');
    await expect(pushFromLocal(store, USER)).rejects.toBeInstanceOf(
      StorageConflictError
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run lib/storage/save.test.ts`
Expected: FAIL — module `./save` not found.

- [ ] **Step 3: Implement save.ts**

Create `lib/storage/save.ts`:

```ts
import { promises as fs } from 'fs';
import path from 'path';
import { getJournalDir } from '@/lib/journal/layout';
import {
  keyFor,
  manifestRelName,
  readManifest,
  relPathFromKey,
  userPrefix,
  writeManifest,
  type Manifest,
} from './manifest';
import type { ObjectStore } from './objectStore';

/** Thrown when the remote changed between pull and push (lost-update guard). */
export class StorageConflictError extends Error {
  constructor(message = 'Journal was modified elsewhere; reload and retry.') {
    super(message);
    this.name = 'StorageConflictError';
  }
}

const listLocalRelPaths = async (dir: string): Promise<string[]> => {
  const out: string[] = [];
  const walk = async (abs: string, rel: string): Promise<void> => {
    let entries: import('fs').Dirent[];
    try {
      entries = await fs.readdir(abs, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const childRel = rel ? path.join(rel, e.name) : e.name;
      if (e.isDirectory()) await walk(path.join(abs, e.name), childRel);
      else if (e.name !== manifestRelName && !e.name.endsWith('.tmp'))
        out.push(childRel);
    }
  };
  await walk(dir, '');
  return out;
};

/**
 * Mirrors the local journal dir up to the remote prefix. First confirms the
 * remote still matches the manifest we pulled (else throws StorageConflictError
 * — never blindly overwrite a concurrent change). Then uploads every local
 * file, deletes remote objects with no local counterpart, and rewrites the
 * manifest with the freshly-returned ETags.
 */
export const pushFromLocal = async (
  store: ObjectStore,
  userId: string
): Promise<void> => {
  const dir = getJournalDir(userId);
  const prefix = userPrefix(userId);
  const manifest = await readManifest(userId);

  // Conflict check: remote must equal the snapshot we last pulled.
  const remote = await store.list(prefix);
  const remoteByRel = new Map(
    remote.map((o) => [relPathFromKey(userId, o.key), o.etag])
  );
  const allRels = new Set([
    ...Object.keys(manifest),
    ...remoteByRel.keys(),
  ]);
  for (const rel of allRels) {
    if (manifest[rel] !== remoteByRel.get(rel)) {
      throw new StorageConflictError();
    }
  }

  // Upload every local file; collect new etags.
  const localRels = await listLocalRelPaths(dir);
  const next: Manifest = {};
  for (const rel of localRels) {
    const body = await fs.readFile(path.join(dir, rel));
    const { etag } = await store.put(keyFor(userId, rel), body);
    next[rel] = etag;
  }

  // Delete remote objects that no longer exist locally.
  const localSet = new Set(localRels);
  for (const rel of remoteByRel.keys()) {
    if (!localSet.has(rel)) await store.delete(keyFor(userId, rel));
  }

  await writeManifest(userId, next);
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run lib/storage/save.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/storage/save.ts lib/storage/save.test.ts
git commit -m "feat(storage): push local cache to remote with lost-update guard"
```

---

### Task 7: sync.ts public API + index.ts barrel

**Files:**
- Create: `lib/storage/sync.ts`
- Create: `lib/storage/index.ts`
- Test: `lib/storage/sync.test.ts`

**Interfaces:**
- Consumes: `getObjectStore`/`resetObjectStore`, `pullToLocal`, `pushFromLocal`, `userPrefix`, manifest helpers.
- Produces (bound to the env-configured store):
  - `pull(userId: string): Promise<{ fingerprint: string }>`
  - `push(userId: string): Promise<void>`
  - `clearRemote(userId: string): Promise<void>`
  - `index.ts` re-exports `pull`, `push`, `clearRemote`, `StorageConflictError`, `getObjectStore`, `resetObjectStore`, and the `ObjectStore`/`ObjectMeta` types.

- [ ] **Step 1: Write the failing test**

Create `lib/storage/sync.test.ts`:

```ts
import { promises as fs } from 'fs';
import path from 'path';
import { describe, it, expect, afterEach } from 'vitest';
import { getJournalDir } from '@/lib/journal/layout';
import { resetObjectStore } from './client';
import { pull, push, clearRemote } from './sync';

const USER = 'sync-user';
afterEach(async () => {
  resetObjectStore();
  await fs.rm(getJournalDir(USER), { recursive: true, force: true });
});

describe('sync (memory backend via env default)', () => {
  it('push then pull round-trips through the configured store', async () => {
    await pull(USER); // empty
    const abs = path.join(getJournalDir(USER), 'main.ledger');
    await fs.writeFile(abs, 'data');
    await push(USER);
    await fs.rm(abs); // blow away local cache
    await pull(USER); // should restore from the store
    expect(await fs.readFile(abs, 'utf-8')).toBe('data');
  });

  it('clearRemote empties the user prefix', async () => {
    await pull(USER);
    await fs.writeFile(path.join(getJournalDir(USER), 'main.ledger'), 'd');
    await push(USER);
    await clearRemote(USER);
    await fs.rm(path.join(getJournalDir(USER), 'main.ledger'));
    const after = await pull(USER);
    // Empty remote → only the stable empty-set fingerprint, no restored file.
    await expect(
      fs.access(path.join(getJournalDir(USER), 'main.ledger'))
    ).rejects.toThrow();
    expect(after.fingerprint).toHaveLength(64);
  });
});
```

Note: `pull`/`push` resolve the store via `getObjectStore()`, which memoizes a single `MemoryObjectStore` across calls in one test, so the round-trip works. `resetObjectStore()` in `afterEach` isolates tests.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run lib/storage/sync.test.ts`
Expected: FAIL — module `./sync` not found.

- [ ] **Step 3: Implement sync.ts and index.ts**

Create `lib/storage/sync.ts`:

```ts
import { getObjectStore } from './client';
import { pullToLocal } from './download';
import { userPrefix } from './manifest';
import { pushFromLocal } from './save';

/** Mirror the user's canonical journal down to the local cache. */
export const pull = (userId: string): Promise<{ fingerprint: string }> =>
  pullToLocal(getObjectStore(), userId);

/** Mirror the user's local cache up to the canonical store. */
export const push = (userId: string): Promise<void> =>
  pushFromLocal(getObjectStore(), userId);

/** Delete every canonical object for the user (used before a full import). */
export const clearRemote = (userId: string): Promise<void> =>
  getObjectStore().deletePrefix(userPrefix(userId));
```

Create `lib/storage/index.ts`:

```ts
export { pull, push, clearRemote } from './sync';
export { getObjectStore, resetObjectStore } from './client';
export { StorageConflictError } from './save';
export type { ObjectStore, ObjectMeta, GetResult } from './objectStore';
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run lib/storage/sync.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Type-check the whole storage module and commit**

Run: `pnpm type-check` → Expected: clean.

```bash
git add lib/storage/sync.ts lib/storage/index.ts lib/storage/sync.test.ts
git commit -m "feat(storage): public pull/push/clearRemote sync API + barrel"
```

---

### Task 8: Wire sync into the read path (runLedger + getMaxMtime call sites)

**Files:**
- Modify: `utils/runLedger.ts`
- Modify: `lib/journal/repository.ts` (replace `getMaxMtime` with `getFingerprint`)
- Investigate/Modify: any other `getMaxMtime` caller (e.g. `features/.../Transactions.tsx`)
- Test: `lib/journal/repository.test.ts` (update the `getMaxMtime` describe block to `getFingerprint`)

**Interfaces:**
- Consumes: `pull` from `@/lib/storage`.
- Produces: `JournalRepository.getFingerprint(userId: string): Promise<string>` (pulls from the store, ensures the layout stub exists locally, returns the fingerprint). `getMaxMtime` is removed.

- [ ] **Step 1: Find every getMaxMtime caller**

Run: `grep -rn "getMaxMtime" --include=*.ts --include=*.tsx .`
Expected: at least `utils/runLedger.ts`, `lib/journal/repository.ts`, `lib/journal/repository.test.ts`, and possibly a `Transactions` component. Record the list — every one is updated in this task.

- [ ] **Step 2: Update the repository test (red)**

In `lib/journal/repository.test.ts`, replace the entire `describe('JournalRepository.getMaxMtime', ...)` block with a `getFingerprint` block. Mtime-specific cases no longer apply; assert fingerprint behavior instead:

```ts
import { promises as fs } from 'fs';
import path from 'path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getJournalDir } from './layout';
import { JournalRepository } from './repository';
import { resetObjectStore } from '@/lib/storage';
import {
  setupTestDb,
  teardownTestDb,
  type TestDbContext,
} from '@/lib/test-utils/db';

describe('JournalRepository.getFingerprint', () => {
  let ctx: TestDbContext;
  let repo: JournalRepository;

  beforeEach(async () => {
    ctx = await setupTestDb('repo-fp-');
    await ctx.insertUser('test-user', 'Test', 'test@example.com');
    repo = new JournalRepository(ctx.db);
    resetObjectStore();
    await fs.rm(getJournalDir('test-user'), { recursive: true, force: true });
  });

  afterEach(async () => {
    await teardownTestDb(ctx);
    resetObjectStore();
    await fs.rm(getJournalDir('test-user'), { recursive: true, force: true });
  });

  it('returns a 64-char hex fingerprint for a brand-new user', async () => {
    const fp = await repo.getFingerprint('test-user');
    expect(fp).toMatch(/^[a-f0-9]{64}$/);
  });

  it('changes the fingerprint after a file is added and pushed', async () => {
    const { pull, push } = await import('@/lib/storage');
    const before = await repo.getFingerprint('test-user');
    await pull('test-user');
    await fs.writeFile(
      path.join(getJournalDir('test-user'), 'main.ledger'),
      '2024-01-01 x\n    A  1\n    B\n'
    );
    await push('test-user');
    const after = await repo.getFingerprint('test-user');
    expect(after).not.toBe(before);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm vitest run lib/journal/repository.test.ts`
Expected: FAIL — `repo.getFingerprint` is not a function.

- [ ] **Step 4: Replace getMaxMtime in the repository**

In `lib/journal/repository.ts`:

1. Add the import near the top (after the existing imports):

```ts
import { pull } from '@/lib/storage';
```

2. Replace the entire `getMaxMtime` method (lines ~111-119) with:

```ts
  /** Pulls the canonical journal into the local cache and returns the content
   * fingerprint. Used as the query cache-key input so any change (local or in
   * Garage) invalidates `unstable_cache`. Also guarantees the local stub exists. */
  async getFingerprint(userId: string): Promise<string> {
    const { fingerprint } = await pull(userId);
    await this.ensureLayout(userId);
    return fingerprint;
  }
```

(`resolveIncludes` import in this file is still used elsewhere? It is not — remove `resolveIncludes` from the parser import if it becomes unused; keep `parseJournal`, `ParsedJournal`, `Transaction`.)

- [ ] **Step 5: Update runLedger**

In `utils/runLedger.ts`:

1. Change the cache-key builder signature from `mtimeMs: number` to `fingerprint: string`:

```ts
const buildExecLedger = (tag: string, fingerprint: string) =>
  unstable_cache(
    async (allArgs: string[]): Promise<string> => {
      const { stdout } = await execFilePromise('ledger', allArgs);
      return stdout;
    },
    ['ledger-cli-exec', tag, fingerprint],
    { revalidate: LEDGER_CACHE_TTL_SECONDS, tags: [tag] }
  );
```

2. In `runLedger`, replace the mtime line and the buildExecLedger call:

```ts
  // getFingerprint pulls the canonical journal into the local cache (so the
  // ledger CLI can read it) and returns the content fingerprint for the key.
  const fingerprint = await journalRepository.getFingerprint(user.id);
  const { mainPath, priceDbPath } = await journalRepository.getLayout(user.id);
```

and

```ts
  const execLedger = buildExecLedger(getJournalCacheTag(user.id), fingerprint);
```

- [ ] **Step 6: Update any remaining getMaxMtime caller**

For each non-test file from Step 1 (e.g. a `Transactions` server component), replace `journalRepository.getMaxMtime(userId)` with `journalRepository.getFingerprint(userId)` and use the returned string wherever the number was used in the cache key. Show the concrete edit for the file(s) found (the cache-key array element changes from `String(mtime)` to the fingerprint string).

- [ ] **Step 7: Run tests + type-check**

Run: `pnpm vitest run lib/journal/repository.test.ts` → Expected: PASS.
Run: `pnpm type-check` → Expected: clean (no remaining `getMaxMtime` references).

- [ ] **Step 8: Commit**

```bash
git add utils/runLedger.ts lib/journal/repository.ts lib/journal/repository.test.ts
# plus any Transactions component touched
git commit -m "feat(storage): pull-before-read and fingerprint-keyed ledger cache"
```

---

### Task 9: Wire sync into the write path (service mutations + imports)

**Files:**
- Modify: `lib/journal/service.ts`
- Modify: `lib/journal/repository.ts` (`emptyJournalDir` also clears remote)
- Test: `lib/journal/service.test.ts` and `lib/journal/integration.test.ts` (add sync isolation; assert push happens)

**Interfaces:**
- Consumes: `pull`, `push`, `clearRemote`, `StorageConflictError` from `@/lib/storage`.
- Produces: mutations and imports keep canonical Garage state in sync — pull at the start, push after a successful local verify, and roll back + throw on conflict/failure.

- [ ] **Step 1: Update emptyJournalDir to clear remote too (red via service tests later)**

In `lib/journal/repository.ts`, add to the top imports:

```ts
import { clearRemote } from '@/lib/storage';
```

Replace `emptyJournalDir` so it clears both the local cache and the canonical store:

```ts
  /** Wipes the user's journal locally AND in canonical storage, then recreates
   * the local dir empty. Used by the import flow. */
  async emptyJournalDir(userId: string): Promise<void> {
    const dir = getJournalDir(userId);
    await clearRemote(userId);
    try {
      await fs.rm(dir, { recursive: true, force: true });
    } catch {
      // ignore
    }
    await fs.mkdir(dir, { recursive: true });
  }
```

- [ ] **Step 2: Add pull-before-read in service read passthroughs**

In `lib/journal/service.ts`, add to imports:

```ts
import { pull, push, StorageConflictError } from '@/lib/storage';
```

Update the read passthroughs so the local cache is fresh before the parser runs:

```ts
  async listTransactions(userId: string): Promise<ParsedJournal> {
    await pull(userId);
    return this.repo.list(userId);
  }

  async findTransaction(
    userId: string,
    uid: string
  ): Promise<Transaction | null> {
    await pull(userId);
    return this.repo.find(userId, uid);
  }
```

- [ ] **Step 3: Add pull + push to addTransaction**

In `addTransaction`, add `await pull(userId);` immediately before `const { mainPath } = await this.repo.ensureLayout(userId);`. Then, after the successful verify (replace the `invalidateCache(userId); return { ok: true };` tail) with a push that rolls back local on failure:

```ts
    try {
      await push(userId);
    } catch (e) {
      // Local is ahead of canonical — roll back so we never diverge.
      await this.repo.writeFileAtomic(mainPath, snapshot);
      const formError =
        e instanceof StorageConflictError
          ? e.message
          : 'Failed to save journal to storage.';
      return { ok: false, fieldErrors: {}, formError };
    }
    invalidateCache(userId);
    return { ok: true };
```

- [ ] **Step 4: Add pull (start) + push (after verify) to performEdit**

In `performEdit`, add `await pull(userId);` as the first line of the method body (before the `input.uid !== input.draft.uid` check). After the successful verify, replace `invalidateCache(userId); return { ok: true };` with:

```ts
    try {
      await push(userId);
    } catch (e) {
      await this.repo.writeFileAtomic(tx.file, text); // restore pre-edit content
      return {
        ok: false,
        reason: 'stale',
        message:
          e instanceof StorageConflictError
            ? e.message
            : 'Failed to save journal to storage.',
      };
    }
    invalidateCache(userId);
    return { ok: true };
```

- [ ] **Step 5: Add pull (start) + push (after verify) to performDelete**

Mirror Step 4 in `performDelete`: `await pull(userId);` as the first line, and after the successful verify replace `invalidateCache(userId); return { ok: true };` with the same push-with-rollback block (restoring `text` to `tx.file`).

- [ ] **Step 6: Push after imports**

In `replaceFromSingleFile` and `replaceFromZip`, after `invalidateCache(userId);` (and after the verify) add `await push(userId);` so the imported files reach canonical storage. `emptyJournalDir` already cleared the remote in Step 1, so the push reflects exactly the imported set.

- [ ] **Step 7: Write a failing test asserting canonical sync on add**

Add to `lib/journal/service.test.ts` (follow the file's existing setup; add `resetObjectStore()` to its `beforeEach`/`afterEach` and import `getObjectStore, resetObjectStore` from `@/lib/storage`):

```ts
it('persists an added transaction to canonical storage', async () => {
  // service + repo wired to ctx.db as the existing tests do
  const res = await service.addTransaction(userId, {
    date: '2024-03-01',
    payee: 'Coffee',
    postings: [
      { account: 'Expenses:Food', amount: 'USD 3' },
      { account: 'Assets:Cash', amount: '' },
    ],
  });
  expect(res.ok).toBe(true);
  const store = getObjectStore();
  const remote = await store.list(`journals/${userId}/`);
  expect(remote.length).toBeGreaterThan(0);
});
```

- [ ] **Step 8: Run the failing test, then the full suite**

Run: `pnpm vitest run lib/journal/service.test.ts`
Expected after wiring: PASS. Then run the full suite to catch fallout in `integration.test.ts`/`service-zip.test.ts` (these need `resetObjectStore()` isolation if they assert on storage):

Run: `pnpm test`
Expected: all green (~345+ existing tests still pass; new ones added).

- [ ] **Step 9: Type-check, lint, commit**

Run: `pnpm type-check` → clean. `pnpm lint` → clean.

```bash
git add lib/journal/service.ts lib/journal/repository.ts lib/journal/service.test.ts lib/journal/integration.test.ts
git commit -m "feat(storage): sync journals to Garage on write and import"
```

---

### Task 10: Garage deployment runbook, config, and docs

**Files:**
- Create: `docs/deployment/garage.md`
- Create: `deploy/garage/garage.toml`
- Modify: `PLAN.md`

**Interfaces:**
- Consumes: nothing (docs/config only).
- Produces: a reproducible runbook for standing Garage up on new-raxel and the app env it expects.

- [ ] **Step 1: Write `deploy/garage/garage.toml`**

Create `deploy/garage/garage.toml` (single-node; replace `<RPC_SECRET>` and `<ADMIN_TOKEN>` with `openssl rand -hex 32` values at deploy time — do not commit real secrets):

```toml
metadata_dir = "/var/lib/garage/meta"
data_dir = "/var/lib/garage/data"
db_engine = "lmdb"

replication_factor = 1

rpc_bind_addr = "[::]:3901"
rpc_public_addr = "127.0.0.1:3901"
rpc_secret = "<RPC_SECRET>"

[s3_api]
s3_region = "garage"
api_bind_addr = "[::]:3900"
root_domain = ".s3.garage.local"

[admin]
api_bind_addr = "[::]:3903"
admin_token = "<ADMIN_TOKEN>"
```

- [ ] **Step 2: Write the runbook `docs/deployment/garage.md`**

Create `docs/deployment/garage.md` documenting, with exact commands:

```markdown
# Garage object storage (new-raxel)

Garage holds the canonical ledger journal files. The app treats local disk
(`DATA_DIR`) as an ephemeral cache.

## Deploy (Coolify, single node)

1. New Coolify service from image `dxflrs/garage:v1.0.1` (pin a tag).
2. Persistent volumes:
   - `/var/lib/garage/data`
   - `/var/lib/garage/meta`
3. Mount `deploy/garage/garage.toml` at `/etc/garage.toml` (fill secrets first:
   `openssl rand -hex 32` for `rpc_secret` and `admin_token`).
4. Expose **only** the S3 API port `3900` on Coolify's internal network to the
   app container. Do NOT publish it publicly (consistent with the locked-down
   admin-ports posture on this box).

## One-time provisioning (run in the Garage container)

```bash
# Assign the single node to the layout (replication factor 1).
NODE_ID=$(garage node id -q | cut -d@ -f1)
garage layout assign "$NODE_ID" -z dc1 -c 50G
garage layout apply --version 1

# Bucket + application key.
garage bucket create ledger
garage key create ledger-app           # prints Key ID + Secret — copy them
garage bucket allow --read --write ledger --key ledger-app
```

## App configuration

Set on the app (Coolify env):

```
STORAGE_BACKEND=s3
S3_ENDPOINT=http://<garage-internal-host>:3900
S3_REGION=garage
S3_BUCKET=ledger
S3_ACCESS_KEY_ID=<Key ID from `garage key create`>
S3_SECRET_ACCESS_KEY=<Secret from `garage key create`>
S3_FORCE_PATH_STYLE=true
```

## Smoke test

After deploy, sign in and add a transaction. Verify the object exists:

```bash
garage bucket info ledger        # object count > 0
```
```

- [ ] **Step 3: Add a PLAN.md entry**

In `PLAN.md`, under Phase 7 (multi-user hardening / backups), add a bullet:

```markdown
- **Object storage (Garage):** journal files are stored in Garage (S3-compatible)
  as the source of truth; local disk is an ephemeral cache synced via
  ListObjectsV2 + ETags. See `docs/deployment/garage.md` and
  `docs/superpowers/specs/2026-06-24-garage-object-storage-design.md`.
```

- [ ] **Step 4: Commit**

```bash
git add docs/deployment/garage.md deploy/garage/garage.toml PLAN.md
git commit -m "docs(storage): Garage deployment runbook, config, and PLAN entry"
```

---

## Final verification

- [ ] Run the full suite: `pnpm test` → all green.
- [ ] `pnpm type-check` → clean.
- [ ] `pnpm lint` → clean.
- [ ] `pnpm build` → succeeds (env defaults to `STORAGE_BACKEND=memory`, so build needs no live Garage).
- [ ] Manual smoke against a real Garage is the deploy step in `docs/deployment/garage.md` (host not reachable from this environment).
