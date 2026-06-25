'use server';
import { requireUser } from '@/lib/auth/require-user';
import { getPasskeyWrapRepository } from '@/lib/crypto';
import { disablePasskeyUnlockSchema } from '@/lib/crypto/passkeyWrapSchema';
import { rateLimit, WRITE, RATE_LIMIT_MESSAGE } from '@/lib/rate-limit';
import { revalidatePath } from 'next/cache';

type Result = { ok: true } | { ok: false; message: string };

export async function disablePasskeyUnlockAction(
  input: unknown
): Promise<Result> {
  const user = await requireUser();
  if (!rateLimit(WRITE, user.id).allowed)
    return { ok: false, message: RATE_LIMIT_MESSAGE };
  const parsed = disablePasskeyUnlockSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: 'Invalid request.' };
  await getPasskeyWrapRepository().deleteByCredential(
    user.id,
    parsed.data.credentialId
  );
  revalidatePath('/', 'layout');
  return { ok: true };
}
