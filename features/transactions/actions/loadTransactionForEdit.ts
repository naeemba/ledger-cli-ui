'use server';

import { requireUser } from '@/lib/auth/require-user';
import { journalService } from '@/lib/journal';
import { getAvailableCurrencies } from '@/lib/settings';
import type { TransactionJSON } from '@/lib/transactions/model';
import {
  getAccountSuggestions,
  getPayeeSuggestions,
} from '@/lib/transactions/suggestions';

export type LoadTransactionForEditResult =
  | {
      ok: true;
      draft: TransactionJSON;
      fingerprint: string;
      accounts: string[];
      payees: string[];
      defaultCurrency: string;
      currencies: string[];
    }
  | { ok: false };

export async function loadTransactionForEditAction(
  uid: string
): Promise<LoadTransactionForEditResult> {
  const user = await requireUser();
  const transaction = await journalService.findTransaction(user.id, uid);
  if (!transaction) return { ok: false };

  const [{ currencies, base: defaultCurrency }, accounts, payees] =
    await Promise.all([
      getAvailableCurrencies(),
      getAccountSuggestions(),
      getPayeeSuggestions(),
    ]);

  // Carry the parser's canonical fingerprint through unchanged — the concurrency
  // guard in editTransaction recomputes and compares this exact value.
  return {
    ok: true,
    draft: transaction.withDefaultCurrency(defaultCurrency).toWire('edit'),
    fingerprint: transaction.fingerprint ?? '',
    accounts,
    payees,
    defaultCurrency,
    currencies,
  };
}
