import { z } from 'zod';

export const deletionCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, 'Enter the 6-digit code from your email');

export type DeletionCode = z.infer<typeof deletionCodeSchema>;
