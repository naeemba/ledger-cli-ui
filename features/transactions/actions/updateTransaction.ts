'use server';

import type { TransactionActionState } from './types';
import { auditService, auditRequestMeta } from '@/lib/audit';
import { requireUser } from '@/lib/auth/require-user';
import { journalService } from '@/lib/journal';
import { getJournalDirSize } from '@/lib/journal/quota';
import { rateLimit, WRITE, RATE_LIMIT_MESSAGE } from '@/lib/rate-limit';
import type { TransactionDraft } from '@/lib/transactions/schema';

export async function updateTransactionAction(
  _prev: TransactionActionState | null,
  formData: FormData
): Promise<TransactionActionState> {
  const user = await requireUser();
  if (!rateLimit(WRITE, user.id).allowed) {
    return { ok: false, formError: RATE_LIMIT_MESSAGE };
  }
  const draftJson = formData.get('draft');
  const uid = formData.get('uid');
  const expectedFingerprint = formData.get('expectedFingerprint');
  if (
    typeof draftJson !== 'string' ||
    typeof uid !== 'string' ||
    typeof expectedFingerprint !== 'string'
  ) {
    return { ok: false, formError: 'Missing edit payload' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(draftJson);
  } catch {
    return { ok: false, formError: 'Edit payload is not valid JSON' };
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return { ok: false, formError: 'Edit payload is not an object' };
  }

  const bytesBefore = await getJournalDirSize(user.id);
  const result = await journalService.editTransaction(user.id, {
    kind: 'edit',
    uid,
    expectedFingerprint,
    draft: parsed as TransactionDraft,
  });
  const bytesAfter = await getJournalDirSize(user.id);
  await auditService.record(user.id, {
    action: 'tx.edit',
    result: result.ok ? 'success' : 'failure',
    targetUid: uid,
    bytesBefore,
    bytesAfter,
    detail: result.ok ? undefined : { reason: result.reason },
    ...(await auditRequestMeta()),
  });
  if (!result.ok) {
    return {
      ok: false,
      formError: result.message,
      fieldErrors: result.fieldErrors,
    };
  }
  return { ok: true };
}
