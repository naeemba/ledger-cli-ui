// Paths that are publicly reachable without a session AND render their own
// full-bleed chrome (no sidebar, header, or app-only banners). Two routes today:
// the marketing landing at `/` and the post-deletion goodbye page at
// `/account/deleted`. Kept in its own tested module — mirroring authPaths.ts —
// so the "which path gets which chrome" decision lives in one place. A future
// addition (e.g. /pricing) can be made here once, instead of duplicating a
// magic route literal across the proxy and the shell where a missed copy could
// silently strand a public page inside the app chrome.
export const PUBLIC_PATHS = new Set(['/', '/account/deleted']);

export const isPublicPath = (pathname: string): boolean =>
  PUBLIC_PATHS.has(pathname);

// The subset of public paths that should *also* bounce a signed-in visitor to
// their dashboard. This is deliberately narrower than PUBLIC_PATHS: the
// marketing landing has no use for an authenticated user, so the proxy sends
// them to `/dashboard` on a cheap cookie check.
//
// `/account/deleted` is intentionally NOT here. The deletion flow can leave a
// stale session cookie behind when `authClient.signOut()` fails (the exact case
// commit 9352138 tolerates), and a presence-only cookie check would then bounce
// the just-deleted user to `/dashboard` instead of the goodbye page —
// nullifying that fix. The goodbye page must stay reachable even with a stale
// cookie present, so it is public-for-everyone but never redirected.
export const BOUNCE_SIGNED_IN_PATHS = new Set(['/']);

export const bouncesSignedInToDashboard = (pathname: string): boolean =>
  BOUNCE_SIGNED_IN_PATHS.has(pathname);
