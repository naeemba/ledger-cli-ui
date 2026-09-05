import { execFile } from 'child_process';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { promisify } from 'util';
import { hermeticLedgerInvocation } from '@/utils/hermeticLedger';

const execFilePromise = promisify(execFile);

/**
 * Runs the real `ledger` binary against a throwaway journal, in the same
 * hermetic shape `runLedger` uses in production. For the tests CLAUDE.md asks
 * for when a value comes out of ledger: verify the command against a synthetic
 * journal rather than mock its output.
 *
 * `run` takes the args that follow the hermetic base ones — it does NOT add
 * `runLedger`'s default `--sort -date`, so a test reproducing a production call
 * that keeps that default must pass it itself. The temp directory is removed
 * when `body` returns.
 */
export const withLedgerJournal = async <T>(
  journalText: string,
  body: (run: (args: string[]) => Promise<string>) => Promise<T>
): Promise<T> => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ledger-test-'));
  try {
    const journal = path.join(directory, 'main.ledger');
    await fs.writeFile(journal, journalText);
    const { args, env } = hermeticLedgerInvocation(journal);
    return await body(async (rest) => {
      const { stdout } = await execFilePromise('ledger', [...args, ...rest], {
        env,
      });
      return stdout;
    });
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
};
