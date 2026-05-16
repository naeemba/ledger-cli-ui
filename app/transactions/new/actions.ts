'use server';

import { requireUser } from '@/lib/auth/require-user';
import { addTransaction, getJournalCacheTag } from '@/lib/journals';
import { revalidatePath, updateTag } from 'next/cache';

export type TransactionActionState = {
  ok: boolean;
  fieldErrors?: Record<string, string>;
  formError?: string;
};

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
