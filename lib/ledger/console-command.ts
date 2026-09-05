/**
 * Parses a free-text `ledger` command typed into the Advanced > Command
 * console into an argv array that is safe to hand to `execFile`.
 *
 * The console is a trust boundary: whatever the user types is passed to the
 * `ledger` binary running as the server process, so parsing here is a security
 * control, not a convenience. Two rules keep it safe:
 *
 * 1. The first token must be one of {@link REPORT_COMMANDS} — a read-only
 *    report. This bans `convert` (reads an arbitrary CSV path), `push`/`pop`
 *    (REPL-only), and an empty command (which would drop ledger into its REPL
 *    and hang waiting on stdin).
 * 2. No option may name a file or run a program. `--file` would let one user
 *    add another user's journal to the report, `--pager` runs a shell command,
 *    `--output` writes to disk.
 *
 * Journal and price-db paths are supplied by the caller, never by the user.
 */

/** Read-only report commands, including ledger's own short synonyms. */
export const REPORT_COMMANDS = [
  'accounts',
  'bal',
  'balance',
  'b',
  'budget',
  'cleared',
  'commodities',
  'csv',
  'emacs',
  'entry',
  'equity',
  'payees',
  'pricedb',
  'pricemap',
  'prices',
  'print',
  'r',
  'reg',
  'register',
  'select',
  'source',
  'stats',
  'xact',
  'xml',
] as const;

const COMMANDS = new Set<string>(REPORT_COMMANDS);

/**
 * Long options that read a file, write a file, or execute a program. Audited
 * against `ledger --help` for 3.4.1; `console-command.test.ts` re-runs
 * that audit against the installed binary so a version that grows a new
 * FILE-taking option fails the build instead of quietly opening a hole.
 */
export const BLOCKED_LONG = new Set([
  'debug',
  'file',
  'import',
  'init-file',
  'options',
  'output',
  'pager',
  'price-db',
  'script',
  'trace',
  'verify',
  'verify-memory',
]);

/** Short forms of the above. Ledger clusters short options (`-Ef FILE`
 *  loads FILE), so every letter of a cluster is checked, not just the first. */
const BLOCKED_SHORT = new Set(['f', 'i', 'o']);

/**
 * Options whose following token is a value expression. Those values legitimately
 * start with a dash (`--sort -amount`), so the token after one of these is never
 * read as an option.
 */
const VALUE_OPTIONS = new Set([
  '--amount',
  '--display',
  '--display-amount',
  '--display-total',
  '--exchange',
  '--forecast',
  '--limit',
  '--only',
  '--period',
  '--sort',
  '--total',
  '--value-expr',
  '-S',
  '-T',
  '-X',
  '-d',
  '-l',
  '-p',
  '-t',
]);

export type ParsedCommand =
  { ok: true; args: string[] } | { ok: false; message: string };

/**
 * Splits on whitespace, honouring single and double quotes so a quoted query
 * (`reg --period 'last 3 months'`, `reg --period='last 3 months'`) stays one
 * argument. No shell is involved downstream, so quotes are the only
 * metacharacters that need meaning.
 *
 * A quote only opens a group where a value can start — at the beginning, after
 * whitespace, or after `=`. Anywhere else it is an apostrophe inside a word, so
 * `reg Lowe's` stays a single term instead of splitting into `Lowe` and `s`.
 */
const TOKEN = /(?:(?<=^|[\s=])"[^"]*"|(?<=^|[\s=])'[^']*'|[^\s"']+|['"])+/g;

/**
 * A quoted group: a quote where a value can start, run to its partner. A value
 * starts at the beginning, after whitespace, after `=`, and straight after a
 * group that just closed, so `"a""b"` is two groups rather than a stray quote.
 * Shared by {@link tokenize} and {@link hasUnclosedQuote} so the two can never
 * disagree about which quotes are groups and which are apostrophes.
 */
const QUOTED_GROUP = /(?<=^|[\s="'])"([^"]*)"|(?<=^|[\s="'])'([^']*)'/g;

export const tokenize = (input: string): string[] =>
  (input.match(TOKEN) ?? []).map((token) =>
    token.replace(QUOTED_GROUP, '$1$2')
  );

/**
 * True when a quote opens nothing. Groups are replaced by a filler first, so
 * what is left is the loose quotes; one of those is an apostrophe only when it
 * sits inside a word (`reg Lowe's`). A loose quote at either end of a word
 * either opened a group that was never shut (`--period "last 3`) or shut one
 * that was never opened (`reg 'Lowe's'`, `reg "a"b"`) — the same two the shell
 * refuses. Without this they reach ledger inside the search term and come back
 * as an empty report under an `ok` badge.
 */
const hasUnclosedQuote = (input: string): boolean =>
  /(?:^|[\s="'])["']|["'](?=[\s"']|$)/.test(input.replace(QUOTED_GROUP, 'x'));

export const parseLedgerCommand = (input: string): ParsedCommand => {
  if (hasUnclosedQuote(input)) {
    return { ok: false, message: 'Unclosed quote.' };
  }

  const tokens = tokenize(input);
  if (tokens.length === 0) return { ok: false, message: 'Enter a command.' };

  // Typing the binary name is a natural habit; drop it rather than reject.
  if (tokens[0] === 'ledger') tokens.shift();

  const command = tokens[0];
  if (!command || !COMMANDS.has(command)) {
    return {
      ok: false,
      message: `Start with a report command. Allowed: ${REPORT_COMMANDS.join(', ')}.`,
    };
  }

  for (let i = 1; i < tokens.length; i += 1) {
    if (VALUE_OPTIONS.has(tokens[i])) {
      i += 1; // skip the value, which may itself start with a dash
      continue;
    }
    const token = tokens[i];
    if (token.startsWith('--')) {
      const name = token.slice(2).split('=')[0];
      if (BLOCKED_LONG.has(name)) {
        return { ok: false, message: `--${name} is not allowed here.` };
      }
    } else if (token.startsWith('-') && token.length > 1) {
      const blocked = [...token.slice(1)].find((letter) =>
        BLOCKED_SHORT.has(letter)
      );
      if (blocked) {
        return { ok: false, message: `-${blocked} is not allowed here.` };
      }
    }
  }

  return { ok: true, args: tokens };
};
