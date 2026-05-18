'use server';

import type { TransactionActionState } from '@/app/transactions/new/actions';
import { requireUser } from '@/lib/auth/require-user';
import { writeJournal } from '@/lib/journal/write';

export async function updateTransactionAction(
  _prev: TransactionActionState | null,
  formData: FormData
): Promise<TransactionActionState> {
  const user = await requireUser();
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

  const result = await writeJournal(user.id, {
    kind: 'edit',
    uid,
    expectedFingerprint,
    draft: parsed as never,
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
