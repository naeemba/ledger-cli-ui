'use server';

import { requireUser } from '@/lib/auth/require-user';
import { savedViewService, savedViewInputSchema } from '@/lib/savedViews';
import { revalidatePath } from 'next/cache';

export type SaveSavedViewResult =
  | { ok: true; viewId: string }
  | {
      ok: false;
      reason: 'name-conflict' | 'invalid';
      message?: string;
      fieldErrors?: Record<string, string>;
    };

export const saveSavedViewAction = async (
  input: unknown,
  opts: { overwrite?: boolean } = {}
): Promise<SaveSavedViewResult> => {
  const user = await requireUser();
  const parsed = savedViewInputSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join('.') || 'form';
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return {
      ok: false,
      reason: 'invalid',
      message: 'Validation failed.',
      fieldErrors,
    };
  }
  const result = await savedViewService.saveOrOverwrite(
    user.id,
    parsed.data,
    opts
  );
  if (!result.ok) {
    return {
      ok: false,
      reason: 'name-conflict',
      message: `A view named "${parsed.data.name}" already exists.`,
    };
  }
  revalidatePath('/', 'layout');
  return { ok: true, viewId: result.view.id };
};
