/**
 * Builds the full security-header set, including a strict nonce-based CSP.
 * Pure and framework-free so it can be unit-tested and called from proxy.ts.
 *
 * style-src keeps 'unsafe-inline' because Recharts and Base UI write inline
 * `style=` attributes that a nonce cannot cover; injected CSS is far lower-risk
 * than injected script, which 'nonce' + 'strict-dynamic' fully gate.
 */
export function buildSecurityHeaders(nonce: string): Record<string, string> {
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ');

  return {
    'Content-Security-Policy': csp,
    'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  };
}
