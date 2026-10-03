import { getObjectStore } from './client';
import { pullToLocal } from './download';
import { userPrefix } from './manifest';
import { pushFromLocal } from './save';
import { refreshDebtShares } from '@/lib/debt-share/refresh';
import { withUserLock } from '@/lib/journal/mutex';

/**
 * Mirror the user's canonical journal down to the local cache.
 *
 * WARNING: this mutates the shared per-user local journal dir in place and is
 * NOT safe to run concurrently against itself or against `push`. Call it ONLY
 * while already holding the per-user lock (`withUserLock`). Read paths that are
 * not already under the lock must use `pullLocked` instead.
 */
export const pull = (userId: string): Promise<{ fingerprint: string }> =>
  pullToLocal(getObjectStore(), userId);

/**
 * Lock-acquiring `pull` for read paths. Serializing under the same per-user
 * lock the write paths use guarantees a read's pull never interleaves with a
 * write's push, with another read's pull, or with a concurrent manifest write.
 * Must NOT be called while already holding the lock (the mutex is
 * non-reentrant) — write paths call the raw `pull` inside their lock instead.
 */
export const pullLocked = (userId: string): Promise<{ fingerprint: string }> =>
  withUserLock(userId, () => pull(userId));

/**
 * Mirror the user's local cache up to the canonical store, then queue a
 * rebuild of any shared debt pages for after the response. A failed upload
 * throws before the rebuild is queued, so a share never shows a save that
 * didn't land. Pass
 * `refreshShares: false` when the local copy is not readable by ledger (the
 * moment encryption is being turned on).
 */
export const push = async (
  userId: string,
  { refreshShares = true }: { refreshShares?: boolean } = {}
): Promise<void> => {
  await pushFromLocal(getObjectStore(), userId);
  if (refreshShares) refreshDebtShares(userId);
};

/** Delete every canonical object for the user (used before a full import). */
export const clearRemote = (userId: string): Promise<void> =>
  getObjectStore().deletePrefix(userPrefix(userId));
