import { describe, expect, it } from 'vitest';
import { bouncesSignedInToDashboard, isPublicPath } from './publicPaths';

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

describe('bouncesSignedInToDashboard', () => {
  it('bounces a signed-in visitor away from the marketing landing', () => {
    expect(bouncesSignedInToDashboard('/')).toBe(true);
  });

  it('does NOT bounce /account/deleted — the goodbye page must stay reachable even with a stale session cookie present', () => {
    // Guards commit 9352138: when signOut() fails, the cookie lingers and a
    // presence-only bounce would strand the just-deleted user on /dashboard.
    expect(isPublicPath('/account/deleted')).toBe(true);
    expect(bouncesSignedInToDashboard('/account/deleted')).toBe(false);
  });

  it('does not bounce non-public paths', () => {
    expect(bouncesSignedInToDashboard('/dashboard')).toBe(false);
    expect(bouncesSignedInToDashboard('/reports')).toBe(false);
  });
});
