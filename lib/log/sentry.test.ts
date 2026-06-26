import { afterEach, describe, expect, it, vi } from 'vitest';
import { isSentryEnabled } from './sentry';

describe('isSentryEnabled', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('is false when SENTRY_DSN is unset', () => {
    vi.stubEnv('SENTRY_DSN', '');
    expect(isSentryEnabled()).toBe(false);
  });

  it('is true when SENTRY_DSN is set', () => {
    vi.stubEnv('SENTRY_DSN', 'https://abc@glitchtip.example/1');
    expect(isSentryEnabled()).toBe(true);
  });
});
