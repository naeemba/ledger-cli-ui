'use server';

import { requireUser } from '@/lib/auth/require-user';
import { savedViewService } from '@/lib/savedViews';
import { revalidatePath } from 'next/cache';

export type DeleteSavedViewResult =
  | { ok: true }
  | { ok: false; message: string };

export const deleteSavedViewAction = async (
  id: string
): Promise<DeleteSavedViewResult> => {
  const user = await requireUser();
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
