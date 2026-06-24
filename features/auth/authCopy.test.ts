import { describe, it, expect } from 'vitest';
import { getAuthCopy, sentCopy, SPAM_WARNING } from './authCopy';

describe('getAuthCopy', () => {
  it('returns sign-in copy with a link to sign-up', () => {
    const c = getAuthCopy('sign-in');
    expect(c.heading).toBe('Welcome back');
    expect(c.showNameField).toBe(false);
    expect(c.altHref).toBe('/sign-up');
  });
  it('returns sign-up copy with a name field and a link to sign-in', () => {
    const c = getAuthCopy('sign-up');
    expect(c.showNameField).toBe(true);
    expect(c.altHref).toBe('/sign-in');
  });
});

describe('sentCopy', () => {
  it('embeds the email and the spam warning', () => {
    const c = sentCopy('me@example.com');
    expect(c.body).toContain('me@example.com');
    expect(c.spam).toBe(SPAM_WARNING);
    expect(SPAM_WARNING.toLowerCase()).toContain('spam');
  });
});
