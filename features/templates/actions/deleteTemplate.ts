'use server';

import { requireUser } from '@/lib/auth/require-user';
import { templateRepository } from '@/lib/templates';
import { revalidatePath } from 'next/cache';

export type DeleteTemplateResult =
  | { ok: true }
  | { ok: false; message: string };

export const deleteTemplateAction = async (
  id: string
): Promise<DeleteTemplateResult> => {
  const user = await requireUser();
  try {
    await templateRepository.delete(user.id, id);
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : 'Could not delete template',
    };
  }
  revalidatePath('/templates');
  return { ok: true };
};
