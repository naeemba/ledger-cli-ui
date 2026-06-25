import { z } from 'zod';

export const resetCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, 'Enter the 6-digit code from your email');

export type ResetCode = z.infer<typeof resetCodeSchema>;
