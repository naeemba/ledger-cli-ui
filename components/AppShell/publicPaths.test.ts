import { describe, expect, it } from 'vitest';
import { isPublicPath } from './publicPaths';

describe('isPublicPath', () => {
  it('treats the marketing landing as a public, bare-chrome page', () => {
    expect(isPublicPath('/')).toBe(true);
  });

  it('treats /account/deleted as public', () => {
    expect(isPublicPath('/account/deleted')).toBe(true);
  });

  it('treats app and auth routes as non-public pages', () => {
    expect(isPublicPath('/dashboard')).toBe(false);
    expect(isPublicPath('/balance')).toBe(false);
    expect(isPublicPath('/sign-in')).toBe(false);
    // A nested path must not be mistaken for the landing.
    expect(isPublicPath('/reports')).toBe(false);
  });
});
