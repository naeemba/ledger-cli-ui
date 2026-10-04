import { cryptoStatus } from '@/lib/crypto/gate';
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
 * The upload only happens when it is safe. A locked encrypted journal (the
 * background price job, or a user who clicked Lock) is written locally only:
 * with no key in memory an upload would send the decrypted local files over the
 * ciphertext in storage. A failed pull is written locally only too, so one
 * user's storage error never stops the rebuild. The pull keeps the local-only
 * price file, and the next successful rebuild uploads it. A failed upload is
 * logged, not thrown — the prices are already saved in the database and the
 * local file works.
 */
const writeAndUpload = async (
  userId: string,
  write: () => Promise<void>
): Promise<void> => {
  if ((await cryptoStatus(userId)) === 'locked') return write();
  try {
    await pull(userId);
  } catch (error) {
    log.warn({ err: error }, 'journal pull failed; price database kept local');
    return write();
  }
  await write();
  // The key can be dropped while the rebuild runs (Lock is not under the
  // user lock). Check again so a mid-rebuild Lock never uploads plaintext.
  if ((await cryptoStatus(userId)) === 'locked') return;
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
