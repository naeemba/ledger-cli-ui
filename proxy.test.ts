import { describe, expect, it } from 'vitest';
import { proxy } from './proxy';
import { NextRequest } from 'next/server';

const request = (path: string) =>
  new NextRequest(new URL(path, 'https://ledger.example'));

describe('proxy', () => {
  it('keeps a shared page out of referrers, search engines and caches', () => {
    const response = proxy(request('/s/abc'));
    expect(response.headers.get('Referrer-Policy')).toBe('no-referrer');
    expect(response.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('Location')).toBeNull();
  });

  it('leaves the other public pages without those headers', () => {
    const response = proxy(request('/account/deleted'));
    expect(response.headers.get('X-Robots-Tag')).toBeNull();
    expect(response.headers.get('Cache-Control')).toBeNull();
  });
});
