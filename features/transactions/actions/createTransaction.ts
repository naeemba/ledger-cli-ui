'use server';

import type { TransactionActionState } from './types';
import { auditService, auditRequestMeta } from '@/lib/audit';
import { requireUser } from '@/lib/auth/require-user';
import { journalService } from '@/lib/journal';
import { getJournalDirSize } from '@/lib/journal/quota';
import { rateLimit, WRITE, RATE_LIMIT_MESSAGE } from '@/lib/rate-limit';

export async function createTransactionAction(
  _prev: TransactionActionState | null,
  formData: FormData
): Promise<TransactionActionState> {
  const user = await requireUser();
  if (!rateLimit(WRITE, user.id).allowed) {
    return { ok: false, formError: RATE_LIMIT_MESSAGE };
  }
  const draftJson = formData.get('draft');
  if (typeof draftJson !== 'string') {
    return { ok: false, formError: 'Missing transaction payload' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(draftJson);
  } catch {
    return { ok: false, formError: 'Transaction payload is not valid JSON' };
  }

  const bytesBefore = await getJournalDirSize(user.id);
  const result = await journalService.addTransaction(user.id, parsed);
  const bytesAfter = await getJournalDirSize(user.id);
  await auditService.record(user.id, {
    action: 'tx.add',
    result: result.ok ? 'success' : 'failure',
    bytesBefore,
    bytesAfter,
    detail: result.ok ? undefined : { reason: result.formError ?? 'invalid' },
    ...(await auditRequestMeta()),
  });
  if (!result.ok) {
    return {
      ok: false,
      fieldErrors: result.fieldErrors,
      formError: result.formError,
    };
  }
  return { ok: true };
}
