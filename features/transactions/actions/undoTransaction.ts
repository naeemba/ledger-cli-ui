'use server';

import { deleteTransactionAction } from './deleteTransaction';
import type { DeleteTransactionResult } from './deleteTransaction';
import { requireUser } from '@/lib/auth/require-user';
import { journalRepository } from '@/lib/journal';

/**
 * Undo a just-created transaction. Unlike a row-level delete, the caller (a
 * toast fired right after save) doesn't hold the journal fingerprint, so we
 * resolve the current one server-side and hand off to the audited delete path.
 * If anything else mutated the journal in between, that guard makes the undo
 * fail cleanly rather than delete stale data.
 */
export async function undoTransactionAction(
  uid: string
): Promise<DeleteTransactionResult> {
  const user = await requireUser();
  const fingerprint = await journalRepository.getFingerprint(user.id);
  return deleteTransactionAction(uid, fingerprint);
}
