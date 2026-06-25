'use server';

import { requireUser } from '@/lib/auth/require-user';
import { journalService } from '@/lib/journal';
import { rateLimit, WRITE, RATE_LIMIT_MESSAGE } from '@/lib/rate-limit';

export type DeleteTransactionResult =
  | { ok: true }
  | { ok: false; message: string };

export async function deleteTransactionAction(
  uid: string,
  expectedFingerprint: string
): Promise<DeleteTransactionResult> {
  const user = await requireUser();
  if (!rateLimit(WRITE, user.id).allowed) {
    return { ok: false, message: RATE_LIMIT_MESSAGE };
  }
  const result = await journalService.deleteTransaction(user.id, {
    kind: 'delete',
    uid,
    expectedFingerprint,
  });
  if (!result.ok) return { ok: false, message: result.message };
  return { ok: true };
}
