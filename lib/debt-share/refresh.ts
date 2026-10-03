import { safeErrorFields } from './safeError';
import { hasSessionDek } from '@/lib/crypto/sessionKeys';
import { withUserLock } from '@/lib/journal/mutex';
import { createLogger } from '@/lib/log';
import { after } from 'next/server';

const log = createLogger('debt-share');

/**
 * The number of the newest rebuild queued for each owner. A queued rebuild
 * that finds a newer number here when its turn comes skips its work: the newer
 * one pulls the same journal or a later one, so three quick saves cost one
 * rebuild, not three.
 */
const newestQueued: Map<string, number> = new Map();
let queueCount = 0;

/**
 * Rebuild the owner's shared pages from the latest saved journal. It takes the
 * per-user lock and pulls first, because by the time it runs the save that
 * queued it has let go of the lock and another write may have landed. The
 * service and pull are imported lazily because they reach back through the
 * journal and storage modules, which import push(), this file's only caller.
 *
 * `queuedAs` is the number refreshDebtShares gave this rebuild. Without one
 * the rebuild always runs.
 *
 * Only the error name and code are logged: raw errors from ledger carry the
 * person's name and journal lines.
 */
export const rebuildDebtShares = async (
  userId: string,
  queuedAs?: number
): Promise<void> => {
  try {
    await withUserLock(userId, async () => {
      if (queuedAs !== undefined) {
        if (newestQueued.get(userId) !== queuedAs) return;
        newestQueued.delete(userId);
      }
      const [{ debtShareService }, { pull }] = await Promise.all([
        import('./index'),
        import('@/lib/storage/sync'),
      ]);
      await pull(userId);
      await debtShareService.refresh(userId);
    });
  } catch (error) {
    log.error({ ...safeErrorFields(error) }, 'debt share refresh failed');
  }
};

/**
 * Queue a rebuild of the owner's shared pages after a save. It runs once the
 * response is sent, so a save does not wait on two ledger runs per share.
 * Never throws: a broken rebuild must not fail the save that triggered it.
 * Locked (no DEK, e.g. a background job) means nothing to rebuild with, so it
 * returns before touching anything. Outside a request (a script or a test)
 * there is no response to wait for: the rebuild starts at once and queues
 * behind the caller's lock.
 */
export const refreshDebtShares = (userId: string): void => {
  if (!hasSessionDek(userId)) return;
  queueCount += 1;
  const queuedAs = queueCount;
  newestQueued.set(userId, queuedAs);
  const task = () => rebuildDebtShares(userId, queuedAs);
  try {
    after(task);
  } catch {
    void task();
  }
};
