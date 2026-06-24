import {
  bouncesSignedInToDashboard,
  isPublicPath,
} from '@/components/AppShell/publicPaths';
import { getSessionCookie } from '@naeemba/next-starter/proxy';
import { type NextRequest, NextResponse } from 'next/server';

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
