import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileP = promisify(execFile);

export type VerifyResult = { ok: true } | { ok: false; message: string };

// Strip absolute paths from ledger's error messages so we don't leak server
// filesystem layout to the client. ledger references files as
// `"path/to/file"` (quoted) or `path/to/file:LINE`, so we redact any run of a
// slash-led path up to the next quote/comma/colon/whitespace.
const PATH_REDACT = /\/[^:\s",]+/g;
const MAX_LEN = 500;

const redact = (line: string): string => line.replace(PATH_REDACT, '<journal>');

/**
 * Turn ledger's multi-line stderr into one safe, *useful* message.
 *
 * ledger reports a parse error as a block: location context first
 * (`In file included from ...`, `While parsing file ...`, `While balancing
 * transaction from ...`), then the offending source lines (prefixed `>`),
 * then the real diagnostic on an `Error: ...` line. The bare first line is
 * almost always just include context ("In file included from ... line 2:") and
 * tells the user nothing, so we pair each `Error:` with its nearest location
 * line instead. Falls back to the first non-empty line when there is no
 * `Error:` marker.
 */
const sanitize = (stderr: string): string => {
  const lines = stderr.split('\n').map(redact);
  const nonEmpty = lines.filter((l) => l.trim());
  if (nonEmpty.length === 0) return 'unknown error';

  const isError = (l: string) => /^\s*Error:/.test(l);
  const isLocation = (l: string) => /^\s*(While |In file included)/.test(l);

  const diagnostics: string[] = [];
  lines.forEach((line, i) => {
    if (!isError(line)) return;
    const context = lines.slice(0, i).reverse().find(isLocation);
    diagnostics.push(
      context ? `${line.trim()} (${context.trim()})` : line.trim()
    );
  });

  const message =
    diagnostics.length > 0 ? diagnostics.join('; ') : nonEmpty[0].trim();
  return message.slice(0, MAX_LEN);
};

/**
 * Runs `ledger -f <mainPath> stats` and reports whether it exited cleanly.
 * The intent is post-write defense-in-depth: even if our formatter ever
 * diverges from ledger's grammar, we catch it before the user has to find
 * out via a broken report page.
 *
 * Pass `priceDbPath` to load a `--price-db` alongside the journal, exactly as
 * the real read paths do. This matters because some parse errors only surface
 * with the price DB present: ledger auto-vivifies a commodity from a `P` line's
 * symbol/quote, so a price DB that names an alias (e.g. `BTC`) collides with the
 * journal's `alias BTC` directive and aborts (pool.cc assertion). Verifying the
 * journal alone would miss it and let a broken layout through.
 *
 * On failure, returns the actual ledger diagnostic with absolute paths
 * redacted so the message is safe to surface to the client.
 */
export const verifyJournalParseable = async (
  mainPath: string,
  priceDbPath?: string
): Promise<VerifyResult> => {
  try {
    // Run hermetically: ignore the server's `~/.ledgerrc` (--init-file) and its
    // ambient LEDGER_* env (a personal LEDGER_PRICE_DB can declare commodities
    // that collide with the journal's own, failing an otherwise valid parse).
    // An explicit --price-db still overrides the env, so passing one is safe.
    const {
      LEDGER_PRICE_DB: _priceDb,
      LEDGER_FILE: _file,
      LEDGER_INIT: _init,
      ...env
    } = process.env;
    const args = ['--init-file', '/dev/null', '-f', mainPath];
    if (priceDbPath) args.push('--price-db', priceDbPath);
    args.push('stats');
    await execFileP('ledger', args, { env });
    return { ok: true };
  } catch (e) {
    const err = e as { stderr?: string; message?: string };
    return {
      ok: false,
      message: sanitize(err.stderr ?? err.message ?? 'unknown error'),
    };
  }
};
