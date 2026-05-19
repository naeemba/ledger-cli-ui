'use server';

import { requireUser } from '@/lib/auth/require-user';
import { writeJournal } from '@/lib/journal/write';
import { addTransaction, getJournalCacheTag } from '@/lib/journals';
import type { TransactionDraft } from '@/lib/transactions/schema';
import { revalidatePath, updateTag } from 'next/cache';

export type TransactionActionState = {
  ok: boolean;
  fieldErrors?: Record<string, string>;
  formError?: string;
};

export type DeleteResult = { ok: true } | { ok: false; message: string };

export async function createTransactionAction(
  _prev: TransactionActionState | null,
  formData: FormData
): Promise<TransactionActionState> {
  const user = await requireUser();
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

  const result = await addTransaction(user.id, parsed);
  if (!result.ok) {
    return {
      ok: false,
      fieldErrors: result.fieldErrors,
      formError: result.formError,
    };
  }

  updateTag(getJournalCacheTag(user.id));
  revalidatePath('/', 'layout');
  return { ok: true };
}

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
    draft: parsed as TransactionDraft,
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
