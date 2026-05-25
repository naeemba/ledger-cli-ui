import { execFile } from 'child_process';
import { promisify } from 'util';
import 'server-only';
import { journalRepository } from '@/lib/journal';
import type { JournalRepository } from '@/lib/journal/repository';

const execFilePromise = promisify(execFile);

/**
 * Shell out to `ledger` for a specific user without depending on a request
 * context. The request-scoped `runLedger` should be preferred for page
 * renders; this helper exists for background jobs (cron, scheduler).
 *
 * No caching — callers should be infrequent (daily cron). Pass `--sort -date`
 * yourself if needed.
 *
 * An optional `repo` may be injected for testing.
 */
export const runLedgerForUser = async (
  userId: string,
  args: string[],
  repo: JournalRepository = journalRepository
): Promise<string> => {
  const { mainPath, priceDbPath } = await repo.ensureLayout(userId);
  const baseArgs: string[] = ['--file', mainPath];
  if (priceDbPath) baseArgs.push('--price-db', priceDbPath);
  const { stdout } = await execFilePromise('ledger', [...baseArgs, ...args]);
  return stdout;
};
