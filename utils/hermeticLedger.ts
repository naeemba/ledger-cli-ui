import 'server-only';

/**
 * The args and env that pin a `ledger` run to exactly one user's files.
 *
 * Runs hermetically: ignores the server's `~/.ledgerrc` (`--init-file
 * /dev/null`) and its ambient `LEDGER_*` env. ledger 3 reads a variable for
 * every option it has (`LEDGER_<OPTION>`), so the whole prefix goes rather
 * than a list somebody has to remember to grow. A personal `LEDGER_PRICE_DB`
 * would otherwise be loaded on top of the journal, declaring commodities that
 * collide with the journal's own and aborting an otherwise valid parse.
 *
 * Shared so that every caller reads the same journal with the same settings —
 * a page and the command console disagreeing about a total is the one thing
 * the console cannot afford.
 */
export const hermeticLedgerInvocation = (
  mainPath: string,
  priceDbPath?: string | null
): { args: string[]; env: NodeJS.ProcessEnv } => {
  const env = { ...process.env };
  for (const name of Object.keys(env)) {
    if (name.startsWith('LEDGER_')) delete env[name];
  }
  const args = ['--init-file', '/dev/null', '--file', mainPath];
  if (priceDbPath) args.push('--price-db', priceDbPath);
  return { args, env };
};
