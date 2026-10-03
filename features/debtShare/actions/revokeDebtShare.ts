'use server';

import { auditRequestMeta, auditService } from '@/lib/audit';
import { requireUser } from '@/lib/auth/require-user';
import { debtShareService } from '@/lib/debt-share';
import { safeErrorFields } from '@/lib/debt-share/safeError';
import { createLogger } from '@/lib/log';
import { RATE_LIMIT_MESSAGE, WRITE, rateLimit } from '@/lib/rate-limit';
import { revalidatePath } from 'next/cache';

const log = createLogger('debt-share');
const SHARE_ID_PATTERN = /^[A-Za-z0-9_-]{22}$/;
const ALREADY_REVOKED = 'That link was already revoked.';

export type RevokeDebtShareResult = { ok: true } | { ok: false; error: string };

export async function revokeDebtShareAction(
  shareId: string
): Promise<RevokeDebtShareResult> {
  const user = await requireUser();
  if (!rateLimit(WRITE, user.id).allowed) {
    return { ok: false, error: RATE_LIMIT_MESSAGE };
  }
  if (typeof shareId !== 'string' || !SHARE_ID_PATTERN.test(shareId)) {
    return { ok: false, error: ALREADY_REVOKED };
  }
  try {
    const removed = await debtShareService.revoke(user.id, shareId);
    await auditService.record(user.id, {
      action: 'debtShare.revoke',
      result: removed ? 'success' : 'failure',
      targetUid: shareId,
      ...(await auditRequestMeta()),
    });
    revalidatePath('/debts', 'layout');
    return removed ? { ok: true } : { ok: false, error: ALREADY_REVOKED };
  } catch (error) {
    log.error({ ...safeErrorFields(error) }, 'failed to revoke debt share');
    await auditService
      .record(user.id, {
        action: 'debtShare.revoke',
        result: 'failure',
        ...(await auditRequestMeta()),
      })
      .catch(() => undefined);
    return { ok: false, error: 'Could not revoke the link. Try again.' };
  }
}
