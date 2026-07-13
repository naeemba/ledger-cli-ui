'use server';

import { deleteTransactionAction } from './deleteTransaction';
import type { DeleteTransactionResult } from './deleteTransaction';
import { requireUser } from '@/lib/auth/require-user';
import { journalService } from '@/lib/journal';

/**
 * Undo a just-created transaction. Unlike a row-level delete, the caller (a
 * toast fired right after save) doesn't hold the transaction fingerprint, so we
 * resolve the created row server-side and hand off to the audited delete path.
 * The delete guard compares against the per-transaction fingerprint, so we must
 * pass that (not the whole-journal fingerprint). If anything else mutated the
 * transaction in between, that guard makes the undo fail cleanly rather than
 * delete stale data.
 */
export async function undoTransactionAction(
  uid: string
): Promise<DeleteTransactionResult> {
  const user = await requireUser();
  const tx = await journalService.findTransaction(user.id, uid);
  if (!tx?.fingerprint) {
    return { ok: false, message: 'This transaction no longer exists.' };
  }
  return deleteTransactionAction(uid, tx.fingerprint);
}
