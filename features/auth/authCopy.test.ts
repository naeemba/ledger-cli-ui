import { describe, it, expect } from 'vitest';
import { getAuthCopy, sentCopy, SPAM_WARNING } from './authCopy';

describe('getAuthCopy', () => {
  it('returns sign-in copy with a link to sign-up', () => {
    const c = getAuthCopy('sign-in');
    expect(c.heading).toBe('Welcome back');
    expect(c.altHref).toBe('/sign-up');
  });
  it('returns sign-up copy with a link to sign-in', () => {
    const c = getAuthCopy('sign-up');
    expect(c.heading).toBe('Create your account');
    expect(c.altHref).toBe('/sign-in');
  });
});

describe('sentCopy', () => {
  it('carries the spam warning', () => {
    const c = sentCopy();
    expect(c.spam).toBe(SPAM_WARNING);
    expect(SPAM_WARNING.toLowerCase()).toContain('spam');
  });
});
