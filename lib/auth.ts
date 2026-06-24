import 'server-only';
import { APP_NAME } from '@/lib/app';
import { postalTransport } from '@/lib/email-transport';
import { createAuth } from '@naeemba/next-starter/auth';

const googleConfigured =
  !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET;

export const auth = await createAuth({
  passkey: { rpName: APP_NAME },
  transport: postalTransport,
  ...(googleConfigured && { google: {} }),
});
