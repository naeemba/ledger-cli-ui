import { describe, it, expect } from 'vitest';
import { toSameOriginPath } from './callbackUrl';

const ORIGIN = 'https://app.test';

describe('toSameOriginPath', () => {
  it('keeps a same-origin path with its query and hash', () => {
    expect(toSameOriginPath('/dashboard?tab=a#x', ORIGIN)).toBe(
      '/dashboard?tab=a#x'
    );
  });
  it('accepts an absolute url on the same origin', () => {
    expect(toSameOriginPath(`${ORIGIN}/accounts`, ORIGIN)).toBe('/accounts');
  });
  it.each([
    ['protocol-relative', '//evil.com'],
    ['backslash', '/\\evil.com'],
    ['double backslash', '\\\\evil.com'],
    ['tab before the second slash', '/\t/evil.com'],
    ['newline before the second slash', '/\n/evil.com'],
    ['external scheme', 'https://evil.com'],
    ['javascript scheme', 'javascript:alert(1)'],
    ['data scheme', 'data:text/html,<script>alert(1)</script>'],
  ])('rejects a %s callback', (_, value) => {
    expect(toSameOriginPath(value, ORIGIN)).toBeNull();
  });
});
