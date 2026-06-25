import { z } from 'zod';

// Opaque base64 blob: non-empty, length-bounded, and charset-restricted to
// standard base64 so obviously-malformed input is rejected before storage.
const b64 = (max: number) =>
  z
    .string()
    .min(1)
    .max(max)
    .regex(/^[A-Za-z0-9+/]+={0,2}$/, 'Invalid base64');

export const setupCryptoSchema = z.object({
  wrapPassphrase: b64(2000),
  // Argon2 salt is 16-32 bytes (~24-44 base64 chars); cap tightly.
  passSalt: b64(64),
  argonParams: z.object({
    m: z.number().int().positive(),
    t: z.number().int().positive(),
    p: z.number().int().positive(),
  }),
  wrapRecovery: b64(2000),
});
export type SetupCryptoInput = z.infer<typeof setupCryptoSchema>;

export type PasskeyMaterial = {
  credentialId: string;
  prfSalt: string;
  wrap: string;
};

// Wrapped key-material the server hands back to the client (GET /api/crypto/material).
// Opaque blobs only; the server never unwraps them. `passkeys` is the list of
// enrolled passkey wraps (empty when none).
export type CryptoMaterial = Pick<
  SetupCryptoInput,
  'passSalt' | 'argonParams' | 'wrapPassphrase' | 'wrapRecovery'
> & {
  passkeys: PasskeyMaterial[];
};
