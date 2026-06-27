import { describe, it, expect, vi } from 'vitest';

// Minimal valid baseline; we only vary the email-related vars per test.
const BASE_ENV: Record<string, string> = {
  BETTER_AUTH_SECRET: 'x'.repeat(32),
  DATABASE_URL: 'postgres://u:p@localhost:5432/db',
};

const loadEnv = async (overrides: Record<string, string | undefined>) => {
  vi.resetModules();
  const prev = process.env;
  process.env = { ...BASE_ENV, ...overrides } as NodeJS.ProcessEnv;
  try {
    const mod = await import('./index');
    return mod.env;
  } finally {
    process.env = prev;
  }
};

describe('email env', () => {
  it('defaults EMAIL_TRANSPORT to postal and requires POSTAL_* vars', async () => {
    await expect(loadEnv({})).rejects.toThrow(/POSTAL_API_URL/);
  });

  it('accepts postal when both POSTAL_* vars are set', async () => {
    const env = await loadEnv({
      POSTAL_API_URL: 'https://postal.example.com',
      POSTAL_API_KEY: 'k',
    });
    expect(env.EMAIL_TRANSPORT).toBe('postal');
  });

  it('console transport needs no POSTAL_* vars', async () => {
    const env = await loadEnv({ EMAIL_TRANSPORT: 'console' });
    expect(env.EMAIL_TRANSPORT).toBe('console');
  });
});
