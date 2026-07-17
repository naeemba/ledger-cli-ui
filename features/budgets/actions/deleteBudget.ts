'use server';

import { auditService, auditRequestMeta } from '@/lib/audit';
import { requireUser } from '@/lib/auth/require-user';
import { journalService } from '@/lib/journal';
import { getJournalDirSize } from '@/lib/journal/quota';
import { rateLimit, WRITE, RATE_LIMIT_MESSAGE } from '@/lib/rate-limit';
import { revalidatePath } from 'next/cache';

export type DeleteBudgetResult = { ok: true } | { ok: false; message: string };

export async function deleteBudgetAction(
  uid: string,
  expectedFingerprint: string
): Promise<DeleteBudgetResult> {
  const user = await requireUser();
  if (!rateLimit(WRITE, user.id).allowed) {
    return { ok: false, message: RATE_LIMIT_MESSAGE };
  }
  const bytesBefore = await getJournalDirSize(user.id);
  const result = await journalService.deleteRecurring(user.id, {
    kind: 'delete',
    uid,
    expectedFingerprint,
    ruleKind: 'budget',
  });
  const bytesAfter = await getJournalDirSize(user.id);
  await auditService.record(user.id, {
    action: 'budget.delete',
    result: result.ok ? 'success' : 'failure',
    targetUid: uid,
    bytesBefore,
    bytesAfter,
    detail: result.ok ? undefined : { reason: result.reason },
    ...(await auditRequestMeta()),
  });
  if (!result.ok) return { ok: false, message: result.message };
  revalidatePath('/', 'layout');
  return { ok: true };
}
