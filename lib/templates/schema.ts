import { z } from 'zod';
import { postingSchema } from '@/lib/transactions/schema';

const TEMPLATE_NAME_MAX = 80;

export const templateNameSchema = z
  .string()
  .trim()
  .min(1, 'Name is required')
  .max(TEMPLATE_NAME_MAX, 'Name is too long');

export const templateDraftSchema = z.object({
  payee: z.string().trim().min(1).max(200),
  status: z.enum(['cleared', 'pending', 'none']).default('none'),
  note: z.string().max(500).optional(),
  postings: z.array(postingSchema).min(2).max(50),
});

export type TemplateDraft = z.infer<typeof templateDraftSchema>;

export const templateInputSchema = z.object({
  name: templateNameSchema,
  draft: templateDraftSchema,
});
export type TemplateInput = z.infer<typeof templateInputSchema>;
