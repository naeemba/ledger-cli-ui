import { z } from 'zod';

export const baseCurrencySchema = z
  .string()
  .trim()
  .min(1, 'Currency is required')
  .max(32, 'Currency code is too long')
  .regex(/^[^\x00-\x1f]+$/, 'Currency code may not contain control characters');

export type BaseCurrency = z.infer<typeof baseCurrencySchema>;
