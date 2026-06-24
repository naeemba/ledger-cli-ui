import 'server-only';
import { promises as fs } from 'fs';
import { eq } from 'drizzle-orm';
import type { DbInstance } from '@/lib/db/connection';
import { getJournalDir } from '@/lib/journal/layout';
import { clearRemote as clearRemoteDefault } from '@/lib/storage/sync';
import { user } from '@naeemba/next-starter/schema';

export type PurgeDeps = {
  clearRemote?: (userId: string) => Promise<void>;
  removeLocalJournal?: (userId: string) => Promise<void>;
};

const removeLocalJournalDefault = (userId: string): Promise<void> =>
  fs.rm(getJournalDir(userId), { recursive: true, force: true });

/**
 * Permanently wipe all of a user's data. ORDER MATTERS: Garage (the source of
 * truth) first, then the local cache, then the user row (which cascades every
 * DB row that references it — session, account, passkey, userSetting,
 * savedView, template, accountDeletionChallenge). A mid-failure leaves only
 * inert orphans (data with no user); re-running completes the purge.
 */
export async function purgeUserData(
  userId: string,
  db: DbInstance,
  deps: PurgeDeps = {}
): Promise<void> {
  const clearRemote = deps.clearRemote ?? clearRemoteDefault;
  const removeLocalJournal =
    deps.removeLocalJournal ?? removeLocalJournalDefault;

  await clearRemote(userId);
  await removeLocalJournal(userId);
  await db.delete(user).where(eq(user.id, userId));
}
