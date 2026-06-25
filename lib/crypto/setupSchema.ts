import { z } from 'zod';

const b64 = z.string().min(1).max(2000);
export const setupCryptoSchema = z.object({
  wrapPassphrase: b64,
  passSalt: b64,
  argonParams: z.object({
    m: z.number().int().positive(),
    t: z.number().int().positive(),
    p: z.number().int().positive(),
  }),
  wrapRecovery: b64,
});
export type SetupCryptoInput = z.infer<typeof setupCryptoSchema>;
