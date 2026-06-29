'use server';

import {
  extractAccountBalance,
  isSafeLedgerArg,
} from '../typeForms/fixBalancePreview';
import runLedger from '@/utils/runLedger';

export async function getAccountBalance(
  account: string,
  currency: string
): Promise<string> {
  const acct = account.trim();
  const ccy = currency.trim();
  if (!isSafeLedgerArg(acct)) return '0';
  if (ccy !== '' && !isSafeLedgerArg(ccy)) return '0';
  try {
    const args = ['balance', '--no-total', '--collapse', '--format', '%A|%T\n'];
    if (ccy) args.push('-X', ccy);
    // `--` stops ledger option parsing so a crafted account can't smuggle a flag.
    args.push('--', acct);
    const stdout = await runLedger(args);
    return extractAccountBalance(stdout, acct);
  } catch {
    return '0';
  }
}
