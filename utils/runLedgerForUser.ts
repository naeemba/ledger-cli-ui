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
  // Run hermetically: ignore any `~/.ledgerrc` (--init-file /dev/null) and the
  // ambient LEDGER_* env. A stray LEDGER_PRICE_DB would otherwise be loaded on
  // top of the journal — declaring commodities that collide with the journal's
  // own and aborting an otherwise valid parse (e.g. when `includePriceDb` is
  // false precisely to avoid a broken price DB). Mirrors lib/journal/verify.ts.
  const {
    LEDGER_PRICE_DB: _priceDb,
    LEDGER_FILE: _file,
    LEDGER_INIT: _init,
    ...env
  } = process.env;
  const baseArgs: string[] = ['--init-file', '/dev/null', '--file', mainPath];
  if (priceDbPath && includePriceDb) baseArgs.push('--price-db', priceDbPath);
  const { stdout } = await execFilePromise('ledger', [...baseArgs, ...args], {
    env,
  });
  return stdout;
};
