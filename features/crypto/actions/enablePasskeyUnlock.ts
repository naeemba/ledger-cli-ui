'use server';
import { ulid } from 'ulid';
import { requireUser } from '@/lib/auth/require-user';
import {
  getPasskeyWrapRepository,
  getUserCryptoRepository,
} from '@/lib/crypto';
import { enablePasskeyUnlockSchema } from '@/lib/crypto/passkeyWrapSchema';
import { rateLimit, WRITE, RATE_LIMIT_MESSAGE } from '@/lib/rate-limit';
import { revalidatePath } from 'next/cache';

type Result = { ok: true } | { ok: false; message: string };

export async function enablePasskeyUnlockAction(
  input: unknown
): Promise<Result> {
  const user = await requireUser();
  if (!rateLimit(WRITE, user.id).allowed)
    return { ok: false, message: RATE_LIMIT_MESSAGE };
  const parsed = enablePasskeyUnlockSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: 'Invalid request.' };
  if (!(await getUserCryptoRepository().exists(user.id)))
    return { ok: false, message: 'Encryption is not set up.' };
  await getPasskeyWrapRepository().create({
    id: ulid(),
    userId: user.id,
    credentialId: parsed.data.credentialId,
    prfSalt: parsed.data.prfSalt,
    wrap: parsed.data.wrap,
    label: parsed.data.label,
  });
  revalidatePath('/', 'layout');
  return { ok: true };
}
