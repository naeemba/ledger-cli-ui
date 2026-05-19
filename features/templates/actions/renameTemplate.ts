'use server';

import { requireUser } from '@/lib/auth/require-user';
import { templateService } from '@/lib/templates';
import { templateNameSchema } from '@/lib/templates/schema';
import { revalidatePath } from 'next/cache';

export type RenameTemplateResult =
  | { ok: true }
  | {
      ok: false;
      reason: 'name-conflict' | 'not-found' | 'invalid';
      message?: string;
      fieldErrors?: Record<string, string>;
    };

export const renameTemplateAction = async (
  id: string,
  name: unknown
): Promise<RenameTemplateResult> => {
  const user = await requireUser();
  const parsed = templateNameSchema.safeParse(name);
  if (!parsed.success) {
    return {
      ok: false,
      reason: 'invalid',
      message: 'Validation failed.',
      fieldErrors: { name: parsed.error.issues[0]?.message ?? 'Invalid name' },
    };
  }
  const result = await templateService.rename(user.id, id, parsed.data);
  if (!result.ok) {
    return {
      ok: false,
      reason: result.reason,
      message:
        result.reason === 'name-conflict'
          ? `A template named "${parsed.data}" already exists.`
          : 'Template not found.',
    };
  }
  revalidatePath('/templates');
  return { ok: true };
};
