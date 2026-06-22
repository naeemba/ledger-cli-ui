import { APP_NAME } from '@/lib/app';
import { createAuth } from '@naeemba/next-starter/auth';

const googleConfigured =
  !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET;

export const auth = await createAuth({
  singleAdmin: 'sharp.fk@gmail.com',
  passkey: { rpName: APP_NAME },
  ...(googleConfigured && { google: {} }),
});
