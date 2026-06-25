'use server';

import { requireUser } from '@/lib/auth/require-user';
import { rateLimit, WRITE, RATE_LIMIT_MESSAGE } from '@/lib/rate-limit';
import { templateRepository } from '@/lib/templates';
import { revalidatePath } from 'next/cache';

export type DeleteTemplateResult =
  | { ok: true }
  | { ok: false; message: string };

export const deleteTemplateAction = async (
  id: string
): Promise<DeleteTemplateResult> => {
  const user = await requireUser();
  if (!rateLimit(WRITE, user.id).allowed) {
    return { ok: false, message: RATE_LIMIT_MESSAGE };
  }
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
