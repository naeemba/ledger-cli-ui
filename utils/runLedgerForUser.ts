import { execFile } from 'child_process';
import { promisify } from 'util';
import 'server-only';
import { hermeticLedgerInvocation } from './hermeticLedger';
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
 * An optional `repo` may be injected for testing. Set `includePriceDb: false`
 * for commands that don't read prices (e.g. `commodities`): a malformed price
 * DB would otherwise abort the parse, and listing held commodities must stay
 * usable precisely so a broken price DB can be regenerated from it.
 */
export const runLedgerForUser = async (
  userId: string,
  args: string[],
  repo: JournalRepository = journalRepository,
  { includePriceDb = true }: { includePriceDb?: boolean } = {}
): Promise<string> => {
  const { mainPath, priceDbPath } = await repo.ensureLayout(userId);
  const { args: baseArgs, env } = hermeticLedgerInvocation(
    mainPath,
    includePriceDb ? priceDbPath : null
  );
  const { stdout } = await execFilePromise('ledger', [...baseArgs, ...args], {
    env,
  });
  return stdout;
};
