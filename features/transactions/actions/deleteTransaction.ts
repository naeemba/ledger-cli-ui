'use server';

import { requireUser } from '@/lib/auth/require-user';
import { journalService } from '@/lib/journal';

export type DeleteTransactionResult =
  | { ok: true }
  | { ok: false; message: string };

export async function deleteTransactionAction(
  uid: string,
  expectedFingerprint: string
): Promise<DeleteTransactionResult> {
  const user = await requireUser();
  const result = await journalService.deleteTransaction(user.id, {
    kind: 'delete',
    uid,
    expectedFingerprint,
  });
  if (!result.ok) return { ok: false, message: result.message };
  return { ok: true };
}
