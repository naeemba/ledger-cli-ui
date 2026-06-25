'use server';
import { requireUser } from '@/lib/auth/require-user';
import { getUserCryptoRepository } from '@/lib/crypto';
import { changePassphraseSchema } from '@/lib/crypto/rewrapSchema';
import { rateLimit, WRITE, RATE_LIMIT_MESSAGE } from '@/lib/rate-limit';
import { revalidatePath } from 'next/cache';

type Result = { ok: true } | { ok: false; message: string };

export async function changePassphraseAction(input: unknown): Promise<Result> {
  const user = await requireUser();
  if (!rateLimit(WRITE, user.id).allowed)
    return { ok: false, message: RATE_LIMIT_MESSAGE };
  const parsed = changePassphraseSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: 'Invalid request.' };
  const repo = getUserCryptoRepository();
  if (!(await repo.exists(user.id)))
    return { ok: false, message: 'Encryption is not set up.' };
  await repo.updateWrapPassphrase(
    user.id,
    parsed.data.wrapPassphrase,
    parsed.data.passSalt,
    parsed.data.argonParams
  );
  revalidatePath('/', 'layout');
  return { ok: true };
}
