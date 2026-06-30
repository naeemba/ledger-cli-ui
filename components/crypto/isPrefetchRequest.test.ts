import { describe, it, expect } from 'vitest';
import { isPrefetchRequest } from './isPrefetchRequest';

const h = (init: Record<string, string>) => new Headers(init);

describe('isPrefetchRequest', () => {
  it('detects the next-router-prefetch header', () => {
    expect(isPrefetchRequest(h({ 'next-router-prefetch': '1' }))).toBe(true);
  });

  it('detects the purpose: prefetch header (case-insensitive)', () => {
    expect(isPrefetchRequest(h({ purpose: 'prefetch' }))).toBe(true);
    expect(isPrefetchRequest(h({ Purpose: 'Prefetch' }))).toBe(true);
  });

  it('is false for a real navigation RSC request (RSC set, no prefetch markers)', () => {
    expect(isPrefetchRequest(h({ RSC: '1' }))).toBe(false);
  });

  it('is false for a plain document request', () => {
    expect(isPrefetchRequest(h({}))).toBe(false);
  });

  it('ignores a non-1 next-router-prefetch value', () => {
    expect(isPrefetchRequest(h({ 'next-router-prefetch': '0' }))).toBe(false);
  });
});
