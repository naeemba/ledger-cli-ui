import { z } from 'zod';

const b64 = z
  .string()
  .regex(/^[A-Za-z0-9+/]+={0,2}$/)
  .min(1)
  .max(512);
export const changePassphraseSchema = z.object({
  wrapPassphrase: b64,
  passSalt: z
    .string()
    .regex(/^[A-Za-z0-9+/]+={0,2}$/)
    .min(1)
    .max(64),
  argonParams: z.object({
    m: z.number().int().positive(),
    t: z.number().int().positive(),
    p: z.number().int().positive(),
  }),
});
export const rotateRecoverySchema = z.object({ wrapRecovery: b64 });
