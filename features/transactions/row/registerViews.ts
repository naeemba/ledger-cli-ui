import 'server-only';
import { REGISTER_FORMAT, parseAccountRegister } from './registerRows';
import type { TransactionRowView } from './rowView';
import runLedger from '@/utils/runLedger';

/**
 * Runs `ledger register` with the shared row format and returns the rows
 * newest first. `--format` and `--sort date` go in front of the caller's args
 * so a trailing `--` guard still ends option parsing — and so no caller can
 * forget the sort this helper's reverse depends on.
 */
export const registerViews = async (
  args: string[]
): Promise<TransactionRowView[]> => {
  const stdout = await runLedger(
    ['register', '--format', REGISTER_FORMAT, '--sort', 'date', ...args],
    { sortByDate: false }
  );
  return parseAccountRegister(stdout).reverse(); // newest first
};
