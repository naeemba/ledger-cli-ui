import { execFile } from 'child_process';
import os from 'os';
import path from 'path';
import { promisify } from 'util';
import { env } from '@/lib/env';
import { unstable_cache } from 'next/cache';
import { connection } from 'next/server';

const execFilePromise = promisify(execFile);

const LEDGER_CACHE_TTL_SECONDS = 60;

const execLedger = unstable_cache(
  async (allArgs: string[]): Promise<string> => {
    const { stdout } = await execFilePromise('ledger', allArgs);
    return stdout;
  },
  ['ledger-cli-exec'],
  { revalidate: LEDGER_CACHE_TTL_SECONDS }
);

const expandHome = (p: string): string => {
  if (p === '~') return os.homedir();
  if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2));
  return p;
};

type Options = {
  sortByDate?: boolean;
  ledgerFile?: string;
};

const buildBaseArgs = (options?: Options): string[] => {
  const ledgerFile = options?.ledgerFile ?? env.LEDGER_FILE;
  const args: string[] = [];
  if (ledgerFile) args.push('--file', expandHome(ledgerFile));
  if (env.LEDGER_PRICE_DB)
    args.push('--price-db', expandHome(env.LEDGER_PRICE_DB));
  if (options?.sortByDate ?? true) args.push('--sort', '-date');
  return args;
};

const runLedger = async (
  args: string[],
  options?: Options
): Promise<string> => {
  await connection();
  const allArgs = [...buildBaseArgs(options), ...args];
  return execLedger(allArgs);
};

export default runLedger;
