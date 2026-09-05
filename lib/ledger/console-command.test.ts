import { execFileSync } from 'child_process';
import { describe, expect, it } from 'vitest';
import { BLOCKED_LONG, parseLedgerCommand, tokenize } from './console-command';

const ledgerHelp = (): string | null => {
  try {
    return execFileSync('ledger', ['--help'], { encoding: 'utf-8' });
  } catch {
    return null;
  }
};

describe('tokenize', () => {
  it('keeps a quoted argument together', () => {
    expect(tokenize("reg --period 'last 3 months'")).toEqual([
      'reg',
      '--period',
      'last 3 months',
    ]);
  });

  it('keeps an empty quoted argument', () => {
    expect(tokenize('bal ""')).toEqual(['bal', '']);
  });
});

describe('parseLedgerCommand', () => {
  it('accepts a report command with options', () => {
    expect(parseLedgerCommand('bal Assets -X USD')).toEqual({
      ok: true,
      args: ['bal', 'Assets', '-X', 'USD'],
    });
  });

  it('drops a leading `ledger`', () => {
    expect(parseLedgerCommand('ledger stats')).toEqual({
      ok: true,
      args: ['stats'],
    });
  });

  it('allows a dash-prefixed value expression', () => {
    expect(parseLedgerCommand('reg --sort -amount')).toEqual({
      ok: true,
      args: ['reg', '--sort', '-amount'],
    });
  });

  it('rejects an empty command rather than dropping ledger into its REPL', () => {
    expect(parseLedgerCommand('   ').ok).toBe(false);
  });

  it('rejects a command that is not a read-only report', () => {
    expect(parseLedgerCommand('convert /etc/passwd').ok).toBe(false);
  });

  it('rejects an option that names a file', () => {
    expect(parseLedgerCommand('bal --file /etc/passwd').ok).toBe(false);
    expect(parseLedgerCommand('bal --file=/etc/passwd').ok).toBe(false);
    expect(parseLedgerCommand('bal -f /etc/passwd').ok).toBe(false);
  });

  it('rejects a file option hidden inside a short-option cluster', () => {
    expect(parseLedgerCommand('bal -Ef /etc/passwd').ok).toBe(false);
  });

  it('rejects an unclosed quote instead of silently truncating it', () => {
    expect(parseLedgerCommand('reg --period "last 3 months').ok).toBe(false);
  });

  it('lets a value option swallow the token after it', () => {
    // Safe only because ledger consumes it as --sort's expression. A boolean
    // option in VALUE_OPTIONS would open a file read here.
    expect(parseLedgerCommand('bal --sort --file /etc/passwd').ok).toBe(true);
  });

  it('rejects an option that runs a program or writes a file', () => {
    expect(parseLedgerCommand('bal --pager "sh -c id"').ok).toBe(false);
    expect(parseLedgerCommand('bal --output /tmp/x').ok).toBe(false);
    expect(parseLedgerCommand('bal --init-file /tmp/x').ok).toBe(false);
  });
});

/**
 * The option guard is a denylist, so it fails open: an option ledger gains in a
 * later release reaches the binary unless someone adds it here. This re-derives
 * the file-reading options from the installed ledger's own help text, so an
 * upgrade that adds one breaks the build rather than silently granting the
 * console read access to the server's filesystem.
 *
 * It only covers options documented as taking a FILE. Options that run a
 * program (`--pager`) are not self-describing and still need a human to spot.
 */
describe('BLOCKED_LONG against the installed ledger', () => {
  const help = ledgerHelp();

  it.skipIf(help === null)('blocks every option that takes a FILE', () => {
    const documented = [
      ...(help ?? '').matchAll(/^\s+--([\w-]+) FILE\b/gm),
    ].map((match) => match[1]);
    expect(documented.length).toBeGreaterThan(0);
    expect(documented.filter((name) => !BLOCKED_LONG.has(name))).toEqual([]);
  });
});
