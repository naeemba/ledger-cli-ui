import { isAuthPath } from '@/components/AppShell/authPaths';
import {
  bouncesSignedInToDashboard,
  isPublicPath,
} from '@/components/AppShell/publicPaths';
import { buildSecurityHeaders } from '@/lib/security/headers';
import { getSessionCookie } from '@naeemba/next-starter/proxy';
import { type NextRequest, NextResponse } from 'next/server';

function withSecurityHeaders(req: NextRequest): NextResponse {
  // Per-request nonce (Web Crypto + btoa are available in the Edge runtime).
  const nonce = btoa(crypto.randomUUID());
  const headers = buildSecurityHeaders(nonce);

  // Forward the nonce + CSP on the request so Next threads the nonce into its
  // own bootstrap <script> tags.
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set(
    'Content-Security-Policy',
    headers['Content-Security-Policy']
  );

  const response = NextResponse.next({ request: { headers: requestHeaders } });

  // Emit all security headers on the response.
  for (const [key, value] of Object.entries(headers)) {
    response.headers.set(key, value);
  }
  return response;
}

/**
 * Attaches the security-header baseline to a redirect so 3xx responses carry the
 * same CSP/HSTS/X-Frame-Options set as rendered pages. A fresh nonce is minted
 * for completeness even though a redirect has no body to apply it to.
 */
function redirectWithSecurityHeaders(target: URL): NextResponse {
  const response = NextResponse.redirect(target);
  const nonce = btoa(crypto.randomUUID());
  for (const [key, value] of Object.entries(buildSecurityHeaders(nonce))) {
    response.headers.set(key, value);
  }
  return response;
}

export function proxy(req: NextRequest) {
  // Auth pages (sign-in / sign-up) are reachable regardless of session and must
  // NOT trigger the no-session redirect (that would loop on /sign-in). They were
  // previously excluded from the matcher entirely; now they pass through so they
  // receive security headers (notably X-Frame-Options / frame-ancestors against
  // clickjacking of the credential forms).
  if (isAuthPath(req.nextUrl.pathname)) {
    return withSecurityHeaders(req);
  }

  // Public paths are reachable without a session. A subset (the marketing
  // landing at `/`) also bounces signed-in visitors to their dashboard via a
  // cheap cookie check (no DB), since logged-in users have no use for it.
  //
  // `/account/deleted` is public but NOT a bounce path: the deletion flow can
  // leave a stale session cookie behind when signOut() fails, and bouncing on a
  // presence-only cookie check would strand the just-deleted user on
  // `/dashboard` instead of the goodbye page (defeating commit 9352138). It
  // must stay reachable even with a stale cookie present.
  if (isPublicPath(req.nextUrl.pathname)) {
    if (
      bouncesSignedInToDashboard(req.nextUrl.pathname) &&
      getSessionCookie(req)
    ) {
      const target = req.nextUrl.clone();
      target.pathname = '/dashboard';
      target.search = '';
      return redirectWithSecurityHeaders(target);
    }
    return withSecurityHeaders(req);
  }

  if (!getSessionCookie(req)) {
    const target = req.nextUrl.clone();
    target.pathname = '/sign-in';
    target.search = '';
    target.searchParams.set(
      'callbackUrl',
      req.nextUrl.pathname + req.nextUrl.search
    );
    return redirectWithSecurityHeaders(target);
  }
  return withSecurityHeaders(req);
}

// Run on every request except:
//   /api/auth/*                  — better-auth's own handlers
//   _next/* internals, favicon, static assets
// /sign-in, /sign-in/error, and /sign-up now pass through (removed from the
// negative-lookahead) so they receive security headers (X-Frame-Options, CSP
// frame-ancestors) against clickjacking. The isAuthPath branch at the top of
// proxy() short-circuits them before the no-session redirect, so there is no
// redirect loop.
// The public landing at `/` still passes through the matcher but is short-
// circuited via isPublicPath/PUBLIC_PATHS, so it renders without a session.
export const config = {
  matcher: [
    '/((?!api/auth|_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
