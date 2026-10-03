import { safeErrorFields } from './safeError';
import { hasSessionDek } from '@/lib/crypto/sessionKeys';
import { withUserLock } from '@/lib/journal/mutex';
import { createLogger } from '@/lib/log';
import { after } from 'next/server';

const log = createLogger('debt-share');

/**
 * Rebuild the owner's shared pages from the latest saved journal. It takes the
 * per-user lock and pulls first, because by the time it runs the save that
 * queued it has let go of the lock and another write may have landed. The
 * service and pull are imported lazily because they reach back through the
 * journal and storage modules, which import push(), this file's only caller.
 *
 * Only the error name and code are logged: raw errors from ledger carry the
 * person's name and journal lines.
 */
export const rebuildDebtShares = async (userId: string): Promise<void> => {
  try {
    await withUserLock(userId, async () => {
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
  const task = () => rebuildDebtShares(userId);
  try {
    after(task);
  } catch {
    void task();
  }
};
