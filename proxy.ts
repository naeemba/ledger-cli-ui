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

export function proxy(req: NextRequest) {
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
      return NextResponse.redirect(target);
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
    return NextResponse.redirect(target);
  }
  return withSecurityHeaders(req);
}

// Run on every request except:
//   /sign-in and /sign-in/error  — the auth UI itself
//   /sign-up                     — open registration; must be reachable without
//                                  a session, or new users get bounced to /sign-in
//   /api/auth/*                  — better-auth's own handlers
//   _next/* internals, favicon, static assets
// The public landing at `/` still passes through the matcher but is short-
// circuited above via isPublicPath/PUBLIC_PATHS, so it renders without a
// session.
export const config = {
  matcher: [
    '/((?!sign-in|sign-up|api/auth|_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
