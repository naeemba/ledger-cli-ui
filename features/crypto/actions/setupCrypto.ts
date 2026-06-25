'use server';

import { requireUser } from '@/lib/auth/require-user';
import { getUserCryptoRepository } from '@/lib/crypto';
import { setupCryptoSchema } from '@/lib/crypto/setupSchema';

type Result = { ok: true } | { ok: false; error: string };

export async function setupCrypto(input: unknown): Promise<Result> {
  const user = await requireUser();
  const parsed = setupCryptoSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Invalid setup payload' };

  const repo = getUserCryptoRepository();
  if (await repo.exists(user.id)) {
    return { ok: false, error: 'Encryption is already set up' };
  }
  await repo.create({
    userId: user.id,
    wrapPassphrase: parsed.data.wrapPassphrase,
    passSalt: parsed.data.passSalt,
    argonParams: parsed.data.argonParams,
    wrapRecovery: parsed.data.wrapRecovery,
  });
  return { ok: true };
}
