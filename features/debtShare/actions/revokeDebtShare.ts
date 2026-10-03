'use server';

import { auditRequestMeta, auditService } from '@/lib/audit';
import { requireUser } from '@/lib/auth/require-user';
import { debtShareService } from '@/lib/debt-share';
import { RATE_LIMIT_MESSAGE, WRITE, rateLimit } from '@/lib/rate-limit';
import { revalidatePath } from 'next/cache';

export async function revokeDebtShareAction(
  shareId: string
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  if (!rateLimit(WRITE, user.id).allowed) {
    return { ok: false, error: RATE_LIMIT_MESSAGE };
  }
  const removed = await debtShareService.revoke(user.id, shareId);
  await auditService.record(user.id, {
    action: 'debtShare.revoke',
    result: removed ? 'success' : 'failure',
    targetUid: shareId,
    ...(await auditRequestMeta()),
  });
  revalidatePath('/debts', 'layout');
  return removed
    ? { ok: true }
    : { ok: false, error: 'That link was already revoked.' };
}
