import { isPublicPath } from '@/components/AppShell/publicPaths';
import { getSessionCookie } from '@naeemba/next-starter/proxy';
import { type NextRequest, NextResponse } from 'next/server';

export function proxy(req: NextRequest) {
  // The marketing landing at `/` is public — logged-out visitors are its whole
  // audience, so it stays reachable without a session. Signed-in visitors have
  // no use for it, so send them straight to their dashboard. This is a cheap
  // cookie check (no DB), which keeps the landing fully decoupled from auth.
  if (isPublicPath(req.nextUrl.pathname)) {
    if (getSessionCookie(req)) {
      const target = req.nextUrl.clone();
      target.pathname = '/dashboard';
      target.search = '';
      return NextResponse.redirect(target);
    }
    return NextResponse.next();
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
  return NextResponse.next();
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
