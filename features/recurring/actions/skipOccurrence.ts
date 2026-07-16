'use server';

import type { OccurrenceActionResult } from './postOccurrence';
import { auditService, auditRequestMeta } from '@/lib/audit';
import { requireUser } from '@/lib/auth/require-user';
import { journalService } from '@/lib/journal';
import { getJournalDirSize } from '@/lib/journal/quota';
import { rateLimit, WRITE, RATE_LIMIT_MESSAGE } from '@/lib/rate-limit';
import { revalidatePath } from 'next/cache';

export async function skipOccurrenceAction(
  uid: string,
  fingerprint: string,
  dueDate: string
): Promise<OccurrenceActionResult> {
  const user = await requireUser();
  if (!rateLimit(WRITE, user.id).allowed) {
    return { ok: false, message: RATE_LIMIT_MESSAGE };
  }
  const bytesBefore = await getJournalDirSize(user.id);
  const result = await journalService.skipRecurringOccurrence(user.id, {
    uid,
    expectedFingerprint: fingerprint,
    dueDate,
    today: new Date().toISOString().slice(0, 10),
  });
  const bytesAfter = await getJournalDirSize(user.id);
  await auditService.record(user.id, {
    action: 'recurring.skip',
    result: result.ok ? 'success' : 'failure',
    targetUid: uid,
    bytesBefore,
    bytesAfter,
    detail: result.ok ? { dueDate } : { reason: result.reason, dueDate },
    ...(await auditRequestMeta()),
  });
  if (!result.ok) return { ok: false, message: result.message };
  revalidatePath('/', 'layout');
  return { ok: true };
}
