import { z } from 'zod';

const b64 = z
  .string()
  .regex(/^[A-Za-z0-9+/]+={0,2}$/)
  .min(1)
  .max(512);

// WebAuthn credential id: base64url charset. This hard-asserts better-auth
// hands back a base64url `credentialID`; a standard-base64 id (with `+`/`/`)
// would fail closed here with a generic "Invalid request." See live-acceptance
// item 5 (confirm the list-user-passkeys response shape) before assuming
// otherwise — the client-side base64urlToBytes only translates `-_`.
const b64url = z
  .string()
  .regex(/^[A-Za-z0-9_-]+={0,2}$/)
  .min(1)
  .max(512);

export const enablePasskeyUnlockSchema = z.object({
  credentialId: b64url,
  prfSalt: b64,
  wrap: b64,
  label: z.string().min(1).max(100),
});

export const disablePasskeyUnlockSchema = z.object({
  credentialId: b64url,
});
