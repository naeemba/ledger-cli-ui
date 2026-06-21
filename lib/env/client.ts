import { z } from 'zod';

// Treat empty strings as missing — Next inlines unset vars as `""` on the client
// in some setups, which would otherwise fail enum validation below.
const emptyToUndefined = (v: unknown) => (v === '' ? undefined : v);

export const clientEnvSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),

  // Deployment label. Exposed to the client via `NEXT_PUBLIC_*` so the brand
  // text can render anywhere without dragging the server-only env schema in.
  NEXT_PUBLIC_APP_ENV: z.preprocess(
    emptyToUndefined,
    z.enum(['local', 'test', 'stage', 'production']).optional()
  ),

  // Set to "1" in lockstep with the Google OAuth credentials so the sign-in
  // page knows to render the Google button.
  NEXT_PUBLIC_ENABLE_GOOGLE: z.preprocess(
    emptyToUndefined,
    z.literal('1').optional()
  ),
});

export type ClientEnv = z.infer<typeof clientEnvSchema>;
export type AppEnv = NonNullable<ClientEnv['NEXT_PUBLIC_APP_ENV']>;

// Each `process.env.X` access is destructured individually so Next replaces
// it statically at build time for the client bundle. Passing `process.env`
// as a whole would not survive the bundler on the client.
const parsed = clientEnvSchema.safeParse({
  NODE_ENV: process.env.NODE_ENV,
  NEXT_PUBLIC_APP_ENV: process.env.NEXT_PUBLIC_APP_ENV,
  NEXT_PUBLIC_ENABLE_GOOGLE: process.env.NEXT_PUBLIC_ENABLE_GOOGLE,
});

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('\n');
  throw new Error(
    `Invalid client environment configuration. Fix the following:\n${issues}\n`
  );
}

export const clientEnv = parsed.data;
