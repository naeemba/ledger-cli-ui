import { getSessionCookie } from '@naeemba/next-starter/proxy';
import { type NextRequest, NextResponse } from 'next/server';

export function proxy(req: NextRequest) {
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
//   /api/auth/*                  — better-auth's own handlers
//   _next/* internals, favicon, static assets
export const config = {
  matcher: [
    '/((?!sign-in|api/auth|_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
