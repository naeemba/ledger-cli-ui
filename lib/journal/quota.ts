import { promises as fs } from 'fs';
import path from 'path';
import 'server-only';
import { PRICE_DB_NAME, getJournalDir } from './layout';
import { listLocalRelPaths } from '@/lib/storage/manifest';

const DEFAULT_QUOTA_MB = 100;

/**
 * Per-user cumulative journal-dir cap in bytes. Read lazily from process.env so
 * tests can override it, mirroring DATA_DIR in layout.ts. The Zod-validated env
 * in @/lib/env is the production source of truth.
 *
 * Falls back to DEFAULT_QUOTA_MB when the runtime value is missing or
 * non-numeric so a bad env var defaults *closed* (still enforcing a cap) rather
 * than silently disabling the quota (Number('x') → NaN → every check false).
 */
export const journalQuotaBytes = (): number => {
  const mb = Number(process.env.JOURNAL_QUOTA_MB);
  return (Number.isFinite(mb) && mb > 0 ? mb : DEFAULT_QUOTA_MB) * 1024 * 1024;
};

/**
 * Total bytes of user-authored files under the journal dir (0 if absent).
 *
 * Excludes the auto-managed price DB (`price-db.ledger`): it is system-generated
 * price data from refreshPrices, not user content. Counting it would let a large
 * price DB block addTransaction even when the user's own content is under quota,
 * while imports (which don't count it) would still succeed — an inconsistency the
 * user can't fix by trimming their journal.
 */
export const getJournalDirSize = async (userId: string): Promise<number> => {
  const dir = getJournalDir(userId);
  const rels = await listLocalRelPaths(dir);
  let total = 0;
  for (const rel of rels) {
    if (path.basename(rel) === PRICE_DB_NAME) continue;
    try {
      total += (await fs.stat(path.join(dir, rel))).size;
    } catch {
      // File vanished between listing and stat — ignore.
    }
  }
  return total;
};
