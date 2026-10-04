import { LockedError } from '@/lib/crypto/sessionKeys';
import { getJournalCacheTag } from '@/lib/journal/layout';
import { withUserLock } from '@/lib/journal/mutex';
import { createLogger } from '@/lib/log';
import { pull, push } from '@/lib/storage';
import { revalidateTag } from 'next/cache';

const log = createLogger('prices');

/**
 * Runs `write` (which rewrites the generated price DB) against a fresh copy of
 * the user's journal, then uploads the result to the canonical store, so the
 * file survives a redeploy onto an empty disk.
 *
 * An encrypted journal with no session key (the background price job) can
 * neither be pulled nor re-encrypted for upload: the file is written locally
 * only, which the pull leaves alone. A failed upload is logged, not thrown —
 * the prices are already saved in the database and the local file works.
 */
const writeAndUpload = async (
  userId: string,
  write: () => Promise<void>
): Promise<void> => {
  try {
    await pull(userId);
  } catch (error) {
    if (!(error instanceof LockedError)) throw error;
    return write();
  }
  await write();
  await push(userId).catch((error: unknown) => {
    log.error({ err: error }, 'failed to store the price database');
  });
};

export const storePriceDb = async (
  userId: string,
  write: () => Promise<void>
): Promise<void> => {
  await withUserLock(userId, () => writeAndUpload(userId, write));
  try {
    revalidateTag(getJournalCacheTag(userId), 'max');
  } catch {
    // revalidateTag throws outside a Next.js request context (cron, tests).
    // Acceptable — the cache invalidates on the next request.
  }
};
