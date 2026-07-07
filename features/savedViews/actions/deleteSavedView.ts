'use server';

import { requireUser } from '@/lib/auth/require-user';
import { rateLimit, WRITE, RATE_LIMIT_MESSAGE } from '@/lib/rate-limit';
import { savedViewService } from '@/lib/savedViews';
import { revalidatePath } from 'next/cache';

export type DeleteSavedViewResult =
  { ok: true } | { ok: false; message: string };

export const deleteSavedViewAction = async (
  id: string
): Promise<DeleteSavedViewResult> => {
  const user = await requireUser();
  if (!rateLimit(WRITE, user.id).allowed) {
    return { ok: false, message: RATE_LIMIT_MESSAGE };
  }
  try {
    await savedViewService.delete(user.id, id);
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : 'Could not delete view',
    };
  }
  revalidatePath('/', 'layout');
  return { ok: true };
};
