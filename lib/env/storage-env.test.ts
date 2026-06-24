import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// A minimal valid baseline so the rest of the schema passes; we only vary the
// storage-related vars per test.
const BASE_ENV: Record<string, string> = {
  BETTER_AUTH_SECRET: 'x'.repeat(32),
  DATABASE_URL: 'postgres://u:p@localhost:5432/db',
  POSTAL_API_URL: 'https://postal.example.com',
  POSTAL_API_KEY: 'k',
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

describe('storage env', () => {
  it('defaults STORAGE_BACKEND to memory and needs no S3 vars', async () => {
    const env = await loadEnv({});
    expect(env.STORAGE_BACKEND).toBe('memory');
  });

  it('defaults S3_REGION to garage and S3_FORCE_PATH_STYLE to true', async () => {
    const env = await loadEnv({
      STORAGE_BACKEND: 's3',
      S3_ENDPOINT: 'http://garage:3900',
      S3_BUCKET: 'ledger',
      S3_ACCESS_KEY_ID: 'id',
      S3_SECRET_ACCESS_KEY: 'secret',
    });
    expect(env.S3_REGION).toBe('garage');
    expect(env.S3_FORCE_PATH_STYLE).toBe(true);
  });

  it('throws when STORAGE_BACKEND=s3 but S3 vars are missing', async () => {
    await expect(loadEnv({ STORAGE_BACKEND: 's3' })).rejects.toThrow(
      /S3_ENDPOINT/
    );
  });
});
