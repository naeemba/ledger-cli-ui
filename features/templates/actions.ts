'use server';

import { requireUser } from '@/lib/auth/require-user';
import {
  saveTemplate,
  renameTemplate,
  deleteTemplate,
  type SaveResult,
  type RenameResult,
} from '@/lib/templates/repository';
import {
  templateInputSchema,
  templateNameSchema,
} from '@/lib/templates/schema';
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
  const result: SaveResult = await saveTemplate(user.id, parsed.data, opts);
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
  const result: RenameResult = await renameTemplate(user.id, id, parsed.data);
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

export type DeleteTemplateResult =
  | { ok: true }
  | { ok: false; message: string };

export const deleteTemplateAction = async (
  id: string
): Promise<DeleteTemplateResult> => {
  const user = await requireUser();
  await deleteTemplate(user.id, id);
  revalidatePath('/templates');
  return { ok: true };
};
