import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileP = promisify(execFile);

export type VerifyResult = { ok: true } | { ok: false; firstLine: string };

// Strip absolute paths from ledger's error messages so we don't leak server
// filesystem layout to the client. ledger error lines look like
// "path/to/file:LINE: error message".
const PATH_REDACT = /\/[^:\s]+/g;
const FIRST_LINE_MAX = 200;

const sanitize = (stderr: string): string => {
  const firstLine = stderr.split('\n').find((l) => l.trim()) ?? '';
  return firstLine.replace(PATH_REDACT, '<journal>').slice(0, FIRST_LINE_MAX);
};

/**
 * Runs `ledger -f <mainPath> stats` and reports whether it exited cleanly.
 * The intent is post-write defense-in-depth: even if our formatter ever
 * diverges from ledger's grammar, we catch it before the user has to find
 * out via a broken report page.
 *
 * On failure, returns the first non-empty stderr line with absolute paths
 * redacted so the message is safe to surface to the client.
 */
export const verifyJournalParseable = async (
  mainPath: string
): Promise<VerifyResult> => {
  try {
    await execFileP('ledger', ['-f', mainPath, 'stats']);
    return { ok: true };
  } catch (e) {
    const err = e as { stderr?: string; message?: string };
    return {
      ok: false,
      firstLine: sanitize(err.stderr ?? err.message ?? 'unknown error'),
    };
  }
};
