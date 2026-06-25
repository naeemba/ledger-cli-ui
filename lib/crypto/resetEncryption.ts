// lib/crypto/resetEncryption.ts
import { promises as fs } from 'fs';
import 'server-only';
import { dropSessionDek } from './sessionKeys';
import { UserCryptoRepository } from './userCryptoRepository';
import type { DbInstance } from '@/lib/db/connection';
import { JournalRepository } from '@/lib/journal';
import { getJournalDir } from '@/lib/journal/layout';
import { clearRemote as clearRemoteDefault } from '@/lib/storage/sync';

type ResetDeps = {
  clearRemote?: (userId: string) => Promise<void>;
  removeLocalJournal?: (userId: string) => Promise<void>;
};

export async function resetUserEncryption(
  userId: string,
  db: DbInstance,
  deps: ResetDeps = {}
): Promise<void> {
  const clearRemote = deps.clearRemote ?? clearRemoteDefault;
  const removeLocalJournal =
    deps.removeLocalJournal ??
    ((id: string) =>
      fs.rm(getJournalDir(id), { recursive: true, force: true }));

  await clearRemote(userId); // wipe encrypted objects in Garage
  await removeLocalJournal(userId); // wipe local working dir
  await new UserCryptoRepository(db).delete(userId); // remove crypto metadata → status 'unset'
  dropSessionDek(userId); // clear any in-RAM DEK
  await new JournalRepository(db).ensureLayout(userId); // recreate an empty plaintext stub
}
