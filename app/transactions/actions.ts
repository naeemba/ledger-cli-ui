'use server';

import { requireUser } from '@/lib/auth/require-user';
import { writeJournal } from '@/lib/journal/write';

export type DeleteResult = { ok: true } | { ok: false; message: string };

export async function deleteTransactionAction(
  uid: string,
  expectedFingerprint: string
): Promise<DeleteResult> {
  const user = await requireUser();
  const result = await writeJournal(user.id, {
    kind: 'delete',
    uid,
    expectedFingerprint,
  });
  if (!result.ok) return { ok: false, message: result.message };
  return { ok: true };
}
