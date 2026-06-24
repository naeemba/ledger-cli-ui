import { describe, it, expect } from 'vitest';
import { isSafeSameOriginCallbackUrl } from './callbackUrl';

describe('isSafeSameOriginCallbackUrl', () => {
  it('accepts a same-origin absolute path', () => {
    expect(isSafeSameOriginCallbackUrl('/dashboard')).toBe(true);
  });
  it('rejects protocol-relative urls', () => {
    expect(isSafeSameOriginCallbackUrl('//evil.com')).toBe(false);
  });
  it('rejects backslash bypass', () => {
    expect(isSafeSameOriginCallbackUrl('/\\evil.com')).toBe(false);
  });
  it('rejects explicit external schemes', () => {
    expect(isSafeSameOriginCallbackUrl('https://evil.com')).toBe(false);
    expect(isSafeSameOriginCallbackUrl('javascript:alert(1)')).toBe(false);
  });
});
