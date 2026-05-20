import { execFile } from 'child_process';
import { promisify } from 'util';
import { requireUser } from '@/lib/auth/require-user';
import { journalRepository } from '@/lib/journal';
import { getJournalCacheTag } from '@/lib/journal/layout';
import { unstable_cache } from 'next/cache';
import { connection } from 'next/server';

const execFilePromise = promisify(execFile);

const LEDGER_CACHE_TTL_SECONDS = 60;

const buildExecLedger = (tag: string, mtimeMs: number) =>
  unstable_cache(
    async (allArgs: string[]): Promise<string> => {
      const { stdout } = await execFilePromise('ledger', allArgs);
      return stdout;
    },
    ['ledger-cli-exec', tag, String(mtimeMs)],
    { revalidate: LEDGER_CACHE_TTL_SECONDS, tags: [tag] }
  );

type Options = {
  sortByDate?: boolean;
};

const runLedger = async (
  args: string[],
  options?: Options
): Promise<string> => {
  await connection();
  const user = await requireUser();
  const { mainPath, priceDbPath } = await journalRepository.ensureLayout(
    user.id
  );
  const mtimeMs = await journalRepository.getMaxMtime(user.id);

  const baseArgs: string[] = ['--file', mainPath];
  if (priceDbPath) baseArgs.push('--price-db', priceDbPath);
  if (options?.sortByDate ?? true) baseArgs.push('--sort', '-date');

  const execLedger = buildExecLedger(getJournalCacheTag(user.id), mtimeMs);
  return execLedger([...baseArgs, ...args]);
};

export default runLedger;
