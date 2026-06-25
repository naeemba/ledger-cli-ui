'use server';
import { requireUser } from '@/lib/auth/require-user';
import { getUserCryptoRepository } from '@/lib/crypto';
import { LockedError } from '@/lib/crypto/sessionKeys';
import { journalService } from '@/lib/journal';

export async function finalizeEncryption(): Promise<{
  ok: boolean;
  error?: string;
}> {
  const user = await requireUser();
  const repo = getUserCryptoRepository();
  // Already migrated: short-circuit before any storage I/O. This is the common
  // case on every unlock — gating on the persisted flag avoids a full journal
  // pull+push (pushFromLocal re-uploads every file with no content/etag
  // short-circuit) for users whose journal is already ciphertext at rest.
  if (await repo.hasMigrated(user.id)) return { ok: true };
  try {
    await journalService.enableEncryption(user.id);
    await repo.markMigrated(user.id);
    return { ok: true };
  } catch (e) {
    if (e instanceof LockedError)
      return { ok: false, error: 'Session is locked; unlock and retry.' };
    console.error('finalizeEncryption failed', e);
    return {
      ok: false,
      error: 'Could not encrypt your journal. Please retry.',
    };
  }
}
