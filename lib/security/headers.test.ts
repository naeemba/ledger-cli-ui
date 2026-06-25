import { describe, expect, it } from 'vitest';
import { buildSecurityHeaders } from './headers';

describe('buildSecurityHeaders', () => {
  it('embeds the nonce in script-src with strict-dynamic', () => {
    const h = buildSecurityHeaders('abc123');
    const csp = h['Content-Security-Policy'];
    expect(csp).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
  });

  it("allows wasm-unsafe-eval (for the encryption wizard's hash-wasm Argon2id) but not unsafe-eval", () => {
    const csp = buildSecurityHeaders('n')['Content-Security-Policy'];
    expect(csp).toContain("'wasm-unsafe-eval'");
    // The narrow WASM keyword must NOT bring in general JS eval.
    expect(csp).not.toContain("'unsafe-eval'");
  });

  it('sets the core directives and static headers', () => {
    const csp = buildSecurityHeaders('n')['Content-Security-Policy'];
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
    expect(csp).toContain("img-src 'self' data:");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");

    const h = buildSecurityHeaders('n');
    expect(h['X-Content-Type-Options']).toBe('nosniff');
    expect(h['X-Frame-Options']).toBe('DENY');
    expect(h['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
    expect(h['Strict-Transport-Security']).toContain('max-age=');
    expect(h['Permissions-Policy']).toContain('camera=()');
  });

  it('varies the nonce per call', () => {
    const a = buildSecurityHeaders('one')['Content-Security-Policy'];
    const b = buildSecurityHeaders('two')['Content-Security-Policy'];
    expect(a).not.toBe(b);
  });
});
