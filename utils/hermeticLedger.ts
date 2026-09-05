import 'server-only';

/**
 * The args and env that pin a `ledger` run to exactly one user's files.
 *
 * Runs hermetically: ignores the server's `~/.ledgerrc` (`--init-file
 * /dev/null`) and its ambient `LEDGER_*` env. A personal `LEDGER_PRICE_DB`
 * would otherwise be loaded on top of the journal, declaring commodities that
 * collide with the journal's own and aborting an otherwise valid parse.
 *
 * Shared so that adding a variable to the scrub list fixes every caller at
 * once — the command console, where user-typed text reaches ledger's argv, is
 * exactly the caller you cannot afford to forget.
 */
export const hermeticLedgerInvocation = (
  mainPath: string,
  priceDbPath?: string | null
): { args: string[]; env: NodeJS.ProcessEnv } => {
  const {
    LEDGER_PRICE_DB: _priceDb,
    LEDGER_FILE: _file,
    LEDGER_INIT: _init,
    ...env
  } = process.env;
  const args = ['--init-file', '/dev/null', '--file', mainPath];
  if (priceDbPath) args.push('--price-db', priceDbPath);
  return { args, env };
};
