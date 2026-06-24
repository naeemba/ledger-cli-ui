import { execFile } from 'child_process';
import { promisify } from 'util';
import { requireUser } from '@/lib/auth/require-user';
import { journalRepository } from '@/lib/journal';
import { getJournalCacheTag } from '@/lib/journal/layout';
import { unstable_cache } from 'next/cache';
import { connection } from 'next/server';

const execFilePromise = promisify(execFile);

const LEDGER_CACHE_TTL_SECONDS = 60;

const buildExecLedger = (tag: string, fingerprint: string) =>
  unstable_cache(
    async (allArgs: string[]): Promise<string> => {
      const { stdout } = await execFilePromise('ledger', allArgs);
      return stdout;
    },
    ['ledger-cli-exec', tag, fingerprint],
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
  // getFingerprint pulls the canonical journal into the local cache (so the
  // ledger CLI can read it) and returns the content fingerprint for the key.
  const fingerprint = await journalRepository.getFingerprint(user.id);
  const { mainPath, priceDbPath } = await journalRepository.getLayout(user.id);

  const baseArgs: string[] = ['--file', mainPath];
  if (priceDbPath) baseArgs.push('--price-db', priceDbPath);
  if (options?.sortByDate ?? true) baseArgs.push('--sort', '-date');

  const execLedger = buildExecLedger(getJournalCacheTag(user.id), fingerprint);
  return execLedger([...baseArgs, ...args]);
};

export default runLedger;
