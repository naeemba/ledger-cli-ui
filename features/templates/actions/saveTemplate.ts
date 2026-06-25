'use server';

import { requireUser } from '@/lib/auth/require-user';
import { rateLimit, WRITE, RATE_LIMIT_MESSAGE } from '@/lib/rate-limit';
import { templateService } from '@/lib/templates';
import { templateInputSchema } from '@/lib/templates/schema';
import { revalidatePath } from 'next/cache';

export type SaveTemplateResult =
  | { ok: true; templateId: string }
  | {
      ok: false;
      reason: 'name-conflict' | 'invalid';
      message?: string;
      fieldErrors?: Record<string, string>;
    };

export const saveTemplateAction = async (
  input: unknown,
  opts: { overwrite?: boolean } = {}
): Promise<SaveTemplateResult> => {
  const user = await requireUser();
  if (!rateLimit(WRITE, user.id).allowed) {
    return { ok: false, reason: 'invalid', message: RATE_LIMIT_MESSAGE };
  }
  const parsed = templateInputSchema.safeParse(input);
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
  const result = await templateService.saveOrOverwrite(
    user.id,
    parsed.data,
    opts
  );
  if (!result.ok) {
    return {
      ok: false,
      reason: 'name-conflict',
      message: `A template named "${parsed.data.name}" already exists.`,
    };
  }
  revalidatePath('/templates');
  return { ok: true, templateId: result.template.id };
};
