'use server';

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
    return { ok: false, reason: 'too-many-attempts' };
  }
  const parsed = resetCodeSchema.safeParse(code);
  if (!parsed.success) {
    return { ok: false, reason: 'invalid', remaining: 0 };
  }
  const result = await encryptionResetService.verifyAndReset(
    user.id,
    parsed.data
  );
  if (result.ok) {
    revalidatePath('/', 'layout');
  }
  return result;
};
