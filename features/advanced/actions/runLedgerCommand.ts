'use server';

import { execFile } from 'child_process';
import { promisify } from 'util';
import { requireUser } from '@/lib/auth/require-user';
import { journalRepository } from '@/lib/journal';
import { maskJournalDirectory } from '@/lib/journal/verify';
import { parseLedgerCommand } from '@/lib/ledger/console-command';
import { CONSOLE, RATE_LIMIT_MESSAGE, rateLimit } from '@/lib/rate-limit';
import { hermeticLedgerInvocation } from '@/utils/hermeticLedger';

const execFilePromise = promisify(execFile);

/** A runaway query shouldn't tie up a server process indefinitely. */
const TIMEOUT_MILLISECONDS = 20_000;
const MAX_OUTPUT_BYTES = 4 * 1024 * 1024;

export type LedgerCommandResult = {
  ok: boolean;
  /** The argv actually handed to ledger; empty when nothing ran. */
  command: string;
  stdout: string;
  stderr: string;
  durationMilliseconds: number;
};

const rejected = (message: string): LedgerCommandResult => ({
  ok: false,
  command: '',
  stdout: '',
  stderr: message,
  durationMilliseconds: 0,
});

export const runLedgerCommandAction = async (
  input: string
): Promise<LedgerCommandResult> => {
  const user = await requireUser();

  // Parse first: a rejected command never spawns a process, so charging the
  // bucket for it would spend the budget on typos on a page whose whole point
  // is trying things.
  const parsed = parseLedgerCommand(input);
  if (!parsed.ok) return rejected(parsed.message);

  if (!rateLimit(CONSOLE, user.id).allowed) return rejected(RATE_LIMIT_MESSAGE);

  // Pulls the canonical journal into the local cache so the CLI can read it,
  // and must finish before the layout is read: the pull is what puts the
  // generated price DB on disk for ensureLayout to find.
  await journalRepository.getFingerprint(user.id);
  const { dir, mainPath, priceDbPath } =
    await journalRepository.ensureLayoutCached(user.id);

  const { args, env } = hermeticLedgerInvocation(mainPath, priceDbPath);
  args.push(...parsed.args);
  const command = parsed.args.join(' ');

  // `stats` prints the cache path, which carries the layout and the user id,
  // and parse errors quote it on stderr. Both streams are shown verbatim, so
  // they get the directory swap rather than redactLedgerPaths: that regex eats
  // every slash-led run and would turn `2024/01/01` into `2024<journal>`.
  const hidePaths = (text: string) => maskJournalDirectory(text, dir);

  const startedAt = Date.now();
  try {
    const { stdout, stderr } = await execFilePromise('ledger', args, {
      env,
      timeout: TIMEOUT_MILLISECONDS,
      maxBuffer: MAX_OUTPUT_BYTES,
    });
    return {
      ok: true,
      command,
      stdout: hidePaths(stdout),
      stderr: hidePaths(stderr),
      durationMilliseconds: Date.now() - startedAt,
    };
  } catch (error) {
    // ledger exits non-zero on a bad query and explains itself on stderr; that
    // message is the whole point of a console, so show it instead of throwing.
    const { stdout, stderr, message } = error as {
      stdout?: string;
      stderr?: string;
      message?: string;
    };
    return {
      ok: false,
      command,
      stdout: hidePaths(stdout ?? ''),
      stderr: hidePaths(stderr || message || 'ledger failed'),
      durationMilliseconds: Date.now() - startedAt,
    };
  }
};
