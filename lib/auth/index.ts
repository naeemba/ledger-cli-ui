import { betterAuth } from 'better-auth';
import { APP_NAME } from '@/lib/app';
import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { passkey } from '@better-auth/passkey';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';

const isProd = env.NODE_ENV === 'production';
const baseUrl = env.BETTER_AUTH_URL;
const rpID = isProd ? new URL(baseUrl).hostname : 'localhost';

// In dev, accept localhost on any common port so the auth doesn't reject
// requests from `next dev` when it falls back from 3000 → 3001 etc.
const trustedOrigins = isProd
  ? [baseUrl]
  : [
      baseUrl,
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:3002',
    ];

export const auth = betterAuth({
  baseURL: baseUrl,
  trustedOrigins,
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: 'sqlite' }),
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
  },
  plugins: [
    passkey({
      rpID,
      rpName: APP_NAME,
      origin: isProd ? baseUrl : trustedOrigins,
    }),
    nextCookies(),
  ],
});
