'use server';

import { auditService, auditRequestMeta } from '@/lib/audit';
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
    await auditService.record(user.id, {
      action: 'crypto.enable',
      result: 'failure',
      detail: { reason: 'already-set-up' },
      ...(await auditRequestMeta()),
    });
    return { ok: false, error: 'Encryption is already set up' };
  }
  await repo.create({
    userId: user.id,
    wrapPassphrase: parsed.data.wrapPassphrase,
    passSalt: parsed.data.passSalt,
    argonParams: parsed.data.argonParams,
    wrapRecovery: parsed.data.wrapRecovery,
  });
  await auditService.record(user.id, {
    action: 'crypto.enable',
    result: 'success',
    ...(await auditRequestMeta()),
  });
  return { ok: true };
}
