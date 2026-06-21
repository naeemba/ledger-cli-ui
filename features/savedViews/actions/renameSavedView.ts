'use server';

import { requireUser } from '@/lib/auth/require-user';
import { savedViewService, savedViewNameSchema } from '@/lib/savedViews';
import { revalidatePath } from 'next/cache';

export type RenameSavedViewResult =
  | { ok: true }
  | {
      ok: false;
      reason: 'name-conflict' | 'not-found' | 'invalid';
      message?: string;
    };

export const renameSavedViewAction = async (
  id: string,
  name: string
): Promise<RenameSavedViewResult> => {
  const user = await requireUser();
  const parsed = savedViewNameSchema.safeParse(name);
  if (!parsed.success) {
    return {
      ok: false,
      reason: 'invalid',
      message: parsed.error.issues[0]?.message ?? 'Invalid name.',
    };
  }
  const result = await savedViewService.rename(user.id, id, parsed.data);
  if (!result.ok) {
    if (result.reason === 'name-conflict') {
      return {
        ok: false,
        reason: 'name-conflict',
        message: `A view named "${parsed.data}" already exists.`,
      };
    }
    return {
      ok: false,
      reason: 'not-found',
      message: 'That saved view no longer exists.',
    };
  }
  revalidatePath('/', 'layout');
  return { ok: true };
};
