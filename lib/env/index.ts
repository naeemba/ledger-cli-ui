import { z } from 'zod';
import 'server-only';
import { clientEnvSchema } from './client';

const envSchema = clientEnvSchema.extend({
  // Auth — required
  BETTER_AUTH_SECRET: z
    .string()
    .min(
      32,
      'BETTER_AUTH_SECRET must be at least 32 characters (generate one: `openssl rand -base64 32`)'
    ),
  BETTER_AUTH_URL: z.string().url().default('http://localhost:3000'),

  // Storage — Postgres connection string (postgres://user:pass@host:5432/db)
  DATABASE_URL: z.string().url(),

  // Root directory for persistent journals (one subdir per user). Validated
  // here so an empty/missing value fails fast at startup rather than silently
  // writing journals under ./data. Read at runtime via process.env in
  // lib/journal/layout.ts (so tests can override it per-case).
  DATA_DIR: z.string().min(1).default('./data'),

  // Email (magic link). Delivered via the self-hosted Postal server (see
  // lib/email-transport.ts). Both Postal vars are required so a missing/empty
  // value fails fast at startup rather than the first time someone signs in.
  EMAIL_FROM: z.string().default('auth@example.com'),
  POSTAL_API_URL: z.string().url(),
  POSTAL_API_KEY: z.string().min(1),

  // Google OAuth (optional)
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),

  // Ledger
  DEFAULT_CURRENCY: z.string().default('USD'),
  LEDGER_PRICE_DB: z.string().optional(),
  DATE_LOCALE: z.string().default('en-US'),
  PORTFOLIO_ACCOUNT_PREFIX: z.string().default('Assets:Investments'),

  // Prices
  PRICE_REFRESH_HOUR: z.coerce.number().int().min(0).max(23).default(6),
  PRICE_REFRESH_ENABLED: z
    .union([z.literal('true'), z.literal('false')])
    .default('true')
    .transform((v) => v === 'true'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('\n');
  throw new Error(
    `Invalid environment configuration. Fix the following:\n${issues}\n`
  );
}

export const env = parsed.data;
export type Env = z.infer<typeof envSchema>;
