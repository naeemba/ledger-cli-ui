'use server';

import { deleteTransactionAction } from './deleteTransaction';
import type { DeleteTransactionResult } from './deleteTransaction';
import { requireUser } from '@/lib/auth/require-user';
import { journalService } from '@/lib/journal';

/**
 * Delete a transaction knowing only its uid — for row surfaces (account
 * register, dashboard, reconcile) that don't carry a fingerprint. Looks the
 * transaction up server-side, reads the parser's stamped per-transaction
 * fingerprint (the value performDelete compares against), and hands off to the
 * existing audited delete path.
 */
export async function deleteTransactionByUid(
  uid: string
): Promise<DeleteTransactionResult> {
  const user = await requireUser();
  const tx = await journalService.findTransaction(user.id, uid);
  if (!tx) return { ok: false, message: 'Transaction not found.' };
  return deleteTransactionAction(uid, tx.fingerprint);
}
