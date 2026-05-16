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

  // Storage
  DATA_DIR: z.string().default('./data'),
  DATABASE_URL: z.string().optional(),

  // Ledger
  DEFAULT_CURRENCY: z.string().default('USD'),
  LEDGER_PRICE_DB: z.string().optional(),
  DATE_LOCALE: z.string().default('en-US'),
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
