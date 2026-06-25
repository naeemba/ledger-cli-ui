'use server';
import { requireUser } from '@/lib/auth/require-user';
import { getUserCryptoRepository } from '@/lib/crypto';
import { rotateRecoverySchema } from '@/lib/crypto/rewrapSchema';
import { rateLimit, WRITE, RATE_LIMIT_MESSAGE } from '@/lib/rate-limit';
import { revalidatePath } from 'next/cache';

type Result = { ok: true } | { ok: false; message: string };

export async function rotateRecoveryAction(input: unknown): Promise<Result> {
  const user = await requireUser();
  if (!rateLimit(WRITE, user.id).allowed)
    return { ok: false, message: RATE_LIMIT_MESSAGE };
  const parsed = rotateRecoverySchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: 'Invalid request.' };
  const repo = getUserCryptoRepository();
  if (!(await repo.exists(user.id)))
    return { ok: false, message: 'Encryption is not set up.' };
  await repo.updateWrapRecovery(user.id, parsed.data.wrapRecovery);
  revalidatePath('/', 'layout');
  return { ok: true };
}
