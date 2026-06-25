import 'server-only';
import { APP_NAME } from '@/lib/app';
import { postalTransport } from '@/lib/email-transport';
import { createAuth } from '@naeemba/next-starter/auth';

const googleConfigured =
  !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET;

export const auth = await createAuth({
  // PRF extension at registration so passkeys can derive a stable secret for
  // client-side encryption-key wrapping (passkey unlock of encrypted journals).
  passkey: { rpName: APP_NAME, registration: { extensions: { prf: {} } } },
  transport: postalTransport,
  ...(googleConfigured && { google: {} }),
});
