'use server';

import {
  accountDeletionService,
  deletionCodeSchema,
  type VerifyResult,
} from '@/lib/account-deletion';
import { requireUser } from '@/lib/auth/require-user';
import { rateLimit, DESTRUCTIVE } from '@/lib/rate-limit';

export const deleteAccountAction = async (
  code: unknown
): Promise<VerifyResult> => {
  const user = await requireUser();
  if (!rateLimit(DESTRUCTIVE, user.id).allowed) {
    return { ok: false, reason: 'too-many-attempts' };
  }
  const parsed = deletionCodeSchema.safeParse(code);
  if (!parsed.success) {
    return { ok: false, reason: 'invalid', remaining: 0 };
  }
  return accountDeletionService.verifyAndDelete(user.id, parsed.data);
};
