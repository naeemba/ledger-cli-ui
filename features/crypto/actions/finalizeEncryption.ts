'use server';
import { requireUser } from '@/lib/auth/require-user';
import { LockedError } from '@/lib/crypto/sessionKeys';
import { journalService } from '@/lib/journal';

export async function finalizeEncryption(): Promise<{
  ok: boolean;
  error?: string;
}> {
  const user = await requireUser();
  try {
    await journalService.enableEncryption(user.id);
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
