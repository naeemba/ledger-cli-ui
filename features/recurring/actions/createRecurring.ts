'use server';

import type { RecurringActionState } from './types';
import { auditService, auditRequestMeta } from '@/lib/audit';
import { requireUser } from '@/lib/auth/require-user';
import { journalService } from '@/lib/journal';
import { getJournalDirSize } from '@/lib/journal/quota';
import { rateLimit, WRITE, RATE_LIMIT_MESSAGE } from '@/lib/rate-limit';
import { revalidatePath } from 'next/cache';

export async function createRecurringAction(
  _prev: RecurringActionState | null,
  formData: FormData
): Promise<RecurringActionState> {
  const user = await requireUser();
  if (!rateLimit(WRITE, user.id).allowed) {
    return { ok: false, formError: RATE_LIMIT_MESSAGE };
  }
  const draftJson = formData.get('draft');
  if (typeof draftJson !== 'string') {
    return { ok: false, formError: 'Missing recurring payload' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(draftJson);
  } catch {
    return { ok: false, formError: 'Recurring payload is not valid JSON' };
  }

  const bytesBefore = await getJournalDirSize(user.id);
  const result = await journalService.addRecurring(user.id, parsed);
  const bytesAfter = await getJournalDirSize(user.id);
  await auditService.record(user.id, {
    action: 'recurring.add',
    result: result.ok ? 'success' : 'failure',
    bytesBefore,
    bytesAfter,
    detail: result.ok ? undefined : { reason: result.reason },
    ...(await auditRequestMeta()),
  });
  if (!result.ok) {
    return {
      ok: false,
      fieldErrors: result.fieldErrors,
      formError: result.formError,
    };
  }
  revalidatePath('/', 'layout');
  return { ok: true, uid: result.uid };
}
