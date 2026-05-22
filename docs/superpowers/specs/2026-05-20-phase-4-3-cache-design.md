# Phase 4.3 — Cache & Freshness (Design)

Status: approved during brainstorming, awaiting implementation plan.
Date: 2026-05-20.

## Goal

Phase 4.3 of `PLAN.md`. After mutations land, cached data should reflect them immediately. The same should be true when the user edits the journal outside the app (vim, another ledger tool). Today's `unstable_cache` setup invalidates on internal mutations via `updateTag`, but external edits stay stale for up to 60 seconds (the configured TTL). This phase removes that window by making the cache key carry the journal's mtime.

The audit item from the plan ("Confirm `revalidatePath('/', 'layout')` after every mutation is sufficient") is included — answer is yes, with one redundancy worth cleaning up.

The drop-caching-entirely alternative from the plan is parked: with the mtime key in place, it's no longer the simplest option, and measurement of the current cache hit-rate would be the prerequisite anyway.

## Scope

In:

- `JournalRepository.getMaxMtime(userId)` — returns the max `mtimeMs` across the user's include graph.
- Both `unstable_cache` consumers gain the mtime in their `keyParts`: `utils/runLedger.ts` (report pages) and `features/transactions/Transactions.tsx` (list page).
- `JournalService.invalidateCache` drops `updateTag(...)` — it's redundant with mtime-keyed invalidation.
- `app/api/upload/route.ts` drops its own `revalidatePath('/', 'layout')` calls — the service does it inside `replaceFromZip` / `replaceFromSingleFile`.
- Test for `getMaxMtime` in a new `lib/journal/repository.test.ts`.

Out (named explicitly so they don't creep in):

- Dropping caching entirely (plan item 2). Once mtime-keyed invalidation is in place, the cache is correct without it; turning it off would need measurement first.
- Content-hash-based keys. mtime is cheaper and sufficient.
- Cache hit/miss instrumentation.
- Verifying writes by shelling out to `ledger` (now a Phase 5.3 task per the PLAN.md update).
- Trimming `revalidatePath('/', 'layout')` to narrower paths. It's broader than strictly necessary, but the cost of over-revalidation is one extra render on the next visit — not worth optimizing now.

## Architectural decisions (locked during brainstorming)

- **Two cache layers, two invalidation mechanisms.**
  - Layer 1: `unstable_cache` (data). Invalidated by *key change* — mtime in the key means any file change creates a new key and the cache misses.
  - Layer 2: Next.js RSC page cache. Invalidated by `revalidatePath('/', 'layout')` on `JournalService` mutations. Forces the page to re-execute against the new Layer 1 data.
- **mtime strategy:** max across the include graph (option A from brainstorming). Cheaper than content-hash, sufficient given file mtime is monotonic per write.
- **`ensureLayout` not `getLayout` inside `getMaxMtime`.** First-ever request from a new user has no journal directory; `ensureLayout` creates the stub so the caller never has to handle ENOENT.
- **TTL stays at 60s.** No longer doing correctness work, but kept as memory-pressure safety net for the Next.js cache LRU.
- **`updateTag` removed from `JournalService.invalidateCache`.** With the mtime key in place, tag-based invalidation is redundant. The `tags: [tag]` field on `unstable_cache` stays as cheap insurance — no harm, doesn't fire automatically.

## File map

**Modified:**

- `lib/journal/repository.ts` — add `getMaxMtime(userId): Promise<number>`.
- `utils/runLedger.ts` — `buildExecLedger(tag, mtimeMs)`; `runLedger` calls `journalRepository.getMaxMtime(user.id)` and threads it into the key.
- `features/transactions/Transactions.tsx` — `buildLoader(tag, mtimeMs)`; `loadTransactions` calls `journalRepository.getMaxMtime(userId)` and threads it into the key.
- `lib/journal/service.ts` — drop `updateTag(getJournalCacheTag(userId))` from `invalidateCache`; trim unused imports.
- `app/api/upload/route.ts` — drop both `revalidatePath('/', 'layout')` calls (the service handles it).

**Created:**

- `lib/journal/repository.test.ts` — tests for `getMaxMtime`.

**Stays untouched:**

- The template surface (`features/templates/actions/*`, `lib/templates/*`). Template mutations correctly use `revalidatePath('/templates')` — narrower than journal mutations, and right for their scope.
- `JournalService` internal mutex, fingerprint check, file writing — unchanged.
- The 60-second `revalidate` TTL stays in both `unstable_cache` consumers as a memory-pressure safety net.

## Section 1 — `JournalRepository.getMaxMtime`

```ts
async getMaxMtime(userId: string): Promise<number> {
  const { mainPath } = await this.ensureLayout(userId);
  const files = await resolveIncludes(mainPath);
  if (files.length === 0) return 0;
  const stats = await Promise.all(files.map((f) => fs.stat(f)));
  return Math.max(...stats.map((s) => s.mtimeMs));
}
```

Key choices:

- **`ensureLayout`, not `getLayout`** — first-ever request creates the stub. No ENOENT path to handle in callers.
- **Reuses `resolveIncludes`** — no duplicate include-graph walking.
- **`Promise.all` of stats** — the user's real journal is 11 files; total cost is sub-millisecond on a warm filesystem.
- **Returns `0` for the empty case** — defensive sentinel. `Math.max()` of no args is `-Infinity`, which serializes oddly in a cache key.
- **Not cached itself** — the whole point is fresh-on-every-call.

Production usage is per-request, so two requests in flight at the same instant both hit `fs.stat` independently. That's fine; the OS-level stat cache absorbs the duplication.

## Section 2 — Wiring into `utils/runLedger.ts`

Today:

```ts
const buildExecLedger = (tag: string) =>
  unstable_cache(
    async (allArgs: string[]) => {
      const { stdout } = await execFilePromise('ledger', allArgs);
      return stdout;
    },
    ['ledger-cli-exec', tag],
    { revalidate: LEDGER_CACHE_TTL_SECONDS, tags: [tag] }
  );

const runLedger = async (args, options?) => {
  await connection();
  const user = await requireUser();
  const { mainPath, priceDbPath } = await journalRepository.ensureLayout(user.id);
  // ...
  const execLedger = buildExecLedger(getJournalCacheTag(user.id));
  return execLedger([...baseArgs, ...args]);
};
```

After:

```ts
const buildExecLedger = (tag: string, mtimeMs: number) =>
  unstable_cache(
    async (allArgs: string[]) => {
      const { stdout } = await execFilePromise('ledger', allArgs);
      return stdout;
    },
    ['ledger-cli-exec', tag, String(mtimeMs)],
    { revalidate: LEDGER_CACHE_TTL_SECONDS, tags: [tag] }
  );

const runLedger = async (args, options?) => {
  await connection();
  const user = await requireUser();
  const { mainPath, priceDbPath } = await journalRepository.ensureLayout(user.id);
  const mtimeMs = await journalRepository.getMaxMtime(user.id);
  // ...
  const execLedger = buildExecLedger(getJournalCacheTag(user.id), mtimeMs);
  return execLedger([...baseArgs, ...args]);
};
```

Every report page that goes through `runLedger` (Dashboard, Balance, Net Worth, Cash Flow, Payees, Debts, Reconcile, per-account register, etc.) automatically benefits.

`mtimeMs` is coerced to a string for the cache key. `unstable_cache` serializes `keyParts` to construct the cache key; mixing number and string types between calls can produce key churn. Coercing to string keeps it deterministic.

`getJournalCacheTag(user.id)` stays as the `tag` argument: it's still part of the key (scopes cache entries per user) and it's still in the `tags: [tag]` array (cheap insurance, even though nothing fires `updateTag` after this PR).

## Section 3 — Wiring into `features/transactions/Transactions.tsx`

Same shape, smaller diff:

```ts
const buildLoader = (tag: string, mtimeMs: number) =>
  unstable_cache(
    async (userId: string): Promise<Transaction[]> => {
      const journal = await journalService.listTransactions(userId);
      return journal.transactions;
    },
    ['journal-transactions', tag, String(mtimeMs)],
    { revalidate: 60, tags: [tag] }
  );

const loadTransactions = async (userId: string) => {
  const mtimeMs = await journalRepository.getMaxMtime(userId);
  return buildLoader(getJournalCacheTag(userId), mtimeMs)(userId);
};
```

Note: `loadTransactions` was a sync function returning a Promise (`(userId) => buildLoader(...)(userId)`). It becomes `async` because we now `await` the mtime before passing it to `buildLoader`. The single call site in `Transactions` already `await`s the result.

## Section 4 — `JournalService.invalidateCache` cleanup

Today:

```ts
const invalidateCache = (userId: string) => {
  try {
    updateTag(getJournalCacheTag(userId));
    revalidatePath('/', 'layout');
  } catch {
    // no-op outside Next.js
  }
};
```

After:

```ts
const invalidateCache = (userId: string) => {
  try {
    revalidatePath('/', 'layout');
  } catch {
    // no-op outside Next.js
  }
};

// The userId parameter is preserved on the helper for symmetry with future
// per-route invalidations, even though only the path-based call is left here.
```

Trim:

- Remove `updateTag` from the `next/cache` import.
- Remove `getJournalCacheTag` from the `'./layout'` import.

The remaining `revalidatePath('/', 'layout')` is Layer 2 — forces the page to re-execute against the new Layer 1 data.

## Section 5 — `app/api/upload/route.ts` cleanup

Today: after each of the two branches (zip / single file), the route handler calls `revalidatePath('/', 'layout')` directly:

```ts
const result = await journalService.replaceFromZip(user.id, buffer);
revalidatePath('/', 'layout');
return NextResponse.json({ ... });
```

`journalService.replaceFromZip` (and `replaceFromSingleFile`) goes through `backfillUids` → `appendFile` → `writeFileAtomic` calls but **does not** call `invalidateCache` today; the upload route does it. After this phase, `invalidateCache` moves into both replace methods so the service is self-contained:

```ts
async replaceFromSingleFile(userId, content) {
  // ... existing body ...
  const backfill = await this.backfillUids(userId);
  invalidateCache(userId);   // <-- new
  return { uidsAdded: backfill.uidsAdded };
}

async replaceFromZip(userId, buffer) {
  // ... existing body ...
  const mainFile = detectMain(...);
  await this.repo.setMainFile(userId, mainFile);
  const backfill = await this.backfillUids(userId);
  invalidateCache(userId);   // <-- new
  return { mainFile, fileCount: entries.length, uidsAdded: backfill.uidsAdded };
}
```

And the upload route drops both `revalidatePath` calls. Single source of truth for journal-cache invalidation: the service.

## Section 6 — Audit findings (plan item 3)

The audit confirmed `revalidatePath('/', 'layout')` after every mutation is sufficient. Detailed findings:

| Concern                                                  | Status                                       |
| -------------------------------------------------------- | -------------------------------------------- |
| Every user-facing page re-renders on mutation            | ✅ All routes share the root layout           |
| Necessary in addition to mtime-keyed `unstable_cache`?   | ✅ Yes — Layer 2 (RSC payload cache) needs it |
| Broader than strictly necessary?                         | ⚠️ Yes, but cost is negligible — keeping it  |
| Duplicated between `JournalService` and the upload route | 🔧 Cleaning up — service becomes sole source |
| Template mutations correctly scoped?                     | ✅ `revalidatePath('/templates')` — narrower  |

## Section 7 — Edge cases

- **First-ever request from a new user** — `getMaxMtime` calls `ensureLayout`, which creates the stub `main.ledger`. `fs.stat` returns its mtime. Cache key works; cache populates on next request with the same mtime.
- **Concurrent mutation + read** — request A reads mtime T1, writes file (mtime now T2), invalidates layer 2. Request B (in flight, started after A's write but with its own server component re-render) reads mtime T2, computes new cache key, gets fresh data. No stale window.
- **External edit during cached read** — `vim` updates the file mtime. Next page render computes new mtime → new key → cache miss → fresh data. No 60s window.
- **mtime collisions within the same millisecond** — `fs.stat` returns ms precision. Two writes within the same ms would land on the same mtime and theoretically share a cache entry. In single-process Node, this is bounded by the per-user mutex inside `JournalService`, which serializes writes. Practically impossible.
- **Filesystem doesn't support mtime precision well (FAT, network mounts)** — out of scope. The deploy target is a Linux/macOS server with ext4/APFS.

## Section 8 — Testing

New: `lib/journal/repository.test.ts` (file doesn't exist today).

Test cases:

- `getMaxMtime` on a fresh user — returns the stub's mtime, not 0.
- `getMaxMtime` with a single-file journal — returns that file's mtime.
- `getMaxMtime` with an `include` graph — returns the max mtime across all reachable files. Achieved by setting different mtimes via `fs.utimes(path, atime, mtime)` deterministically (no `setTimeout` flakiness).
- `getMaxMtime` reflects a sub-file change — write a fresh journal, capture mtime; touch a sub-file with a later mtime; re-call → result reflects the sub-file.

Existing tests (`service.test.ts`, `integration.test.ts`) need no changes. Their `invalidateCache` calls are no-ops outside Next.js; the cache wiring lives in consumers, not in the service.

Coverage target stays at 95% on `lib/journal/*`. `getMaxMtime` is ~5 lines; ~4 tests cover all branches.

No tests for `runLedger.ts` or `Transactions.tsx` cache wiring — those would need a real Next.js test harness. Plumbing-only changes; type-check + manual smoke is sufficient.

## Section 9 — Implementation order

Five slices. Steps 1–3 ship the new behavior; step 4 cleans up the redundant invalidations; step 5 verifies.

1. **Add `JournalRepository.getMaxMtime` + tests.** New method, new `repository.test.ts`. Mergeable on its own; no call sites yet.
2. **Wire mtime into `utils/runLedger.ts`.** All report pages auto-benefit.
3. **Wire mtime into `features/transactions/Transactions.tsx`.** Same treatment for the `/transactions` list loader.
4. **Drop redundant invalidations.**
   - `lib/journal/service.ts`: remove `updateTag(getJournalCacheTag(userId))` from `invalidateCache`; trim now-unused imports. Add `invalidateCache(userId)` at the end of `replaceFromSingleFile` and `replaceFromZip`.
   - `app/api/upload/route.ts`: drop both `revalidatePath('/', 'layout')` calls.
5. **Final verification.**
   - `pnpm test` — 84 existing + 4 new = 88 green.
   - `pnpm type-check` clean.
   - `pnpm lint` clean.
   - Manual: add / edit / delete a transaction — no stale data on the next page render. Edit the journal in vim — next report page shows fresh data without waiting 60s.

## Open questions

None at design time. If implementation surfaces any, they go on the plan, not retro-added to this spec.
