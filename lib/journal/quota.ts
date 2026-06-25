import { promises as fs } from 'fs';
import path from 'path';
import 'server-only';
import { getJournalDir } from './layout';
import { listLocalRelPaths } from '@/lib/storage/manifest';

/**
 * Per-user cumulative journal-dir cap in bytes. Read lazily from process.env so
 * tests can override it, mirroring DATA_DIR in layout.ts. The Zod-validated env
 * in @/lib/env is the production source of truth.
 */
export const journalQuotaBytes = (): number =>
  Number(process.env.JOURNAL_QUOTA_MB ?? 100) * 1024 * 1024;

/** Total bytes of all files under the user's journal dir (0 if absent). */
export const getJournalDirSize = async (userId: string): Promise<number> => {
  const dir = getJournalDir(userId);
  const rels = await listLocalRelPaths(dir);
  let total = 0;
  for (const rel of rels) {
    try {
      total += (await fs.stat(path.join(dir, rel))).size;
    } catch {
      // File vanished between listing and stat — ignore.
    }
  }
  return total;
};
