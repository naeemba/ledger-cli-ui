'use server';

import { auditService, auditRequestMeta } from '@/lib/audit';
import { requireUser } from '@/lib/auth/require-user';
import {
  encryptionResetService,
  resetCodeSchema,
  type VerifyResult,
} from '@/lib/crypto/resetChallenge';
import { rateLimit, DESTRUCTIVE } from '@/lib/rate-limit';
import { revalidatePath } from 'next/cache';

export const confirmEncryptionResetAction = async (
  code: unknown
): Promise<VerifyResult> => {
  const user = await requireUser();
  if (!rateLimit(DESTRUCTIVE, user.id).allowed) {
    await auditService.record(user.id, {
      action: 'crypto.reset',
      result: 'failure',
      detail: { reason: 'too-many-attempts' },
      ...(await auditRequestMeta()),
    });
    return { ok: false, reason: 'too-many-attempts' };
  }
  const parsed = resetCodeSchema.safeParse(code);
  if (!parsed.success) {
    await auditService.record(user.id, {
      action: 'crypto.reset',
      result: 'failure',
      detail: { reason: 'invalid' },
      ...(await auditRequestMeta()),
    });
    return { ok: false, reason: 'invalid', remaining: 0 };
  }
  const result = await encryptionResetService.verifyAndReset(
    user.id,
    parsed.data
  );
  if (result.ok) {
    revalidatePath('/', 'layout');
    await auditService.record(user.id, {
      action: 'crypto.reset',
      result: 'success',
      ...(await auditRequestMeta()),
    });
  } else {
    await auditService.record(user.id, {
      action: 'crypto.reset',
      result: 'failure',
      detail: { reason: result.reason },
      ...(await auditRequestMeta()),
    });
  }
  return result;
};
