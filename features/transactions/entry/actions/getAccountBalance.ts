'use server';

import { extractAccountBalance } from '../typeForms/fixBalancePreview';
import runLedger from '@/utils/runLedger';

export async function getAccountBalance(
  account: string,
  currency: string
): Promise<string> {
  if (!account.trim()) return '0';
  try {
    const stdout = await runLedger([
      'balance',
      account,
      '-X',
      currency,
      '--no-total',
      '--collapse',
      '--format',
      '%A|%T\n',
    ]);
    return extractAccountBalance(stdout, account);
  } catch {
    return '0';
  }
}
