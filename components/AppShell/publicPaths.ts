// Paths that are publicly reachable without a session AND render their own
// full-bleed chrome (no sidebar, header, or app-only banners). Today that is
// just the marketing landing at `/`. Kept in its own tested module — mirroring
// authPaths.ts — so the "which path gets which chrome" decision lives in one
// place. A future addition (e.g. /pricing) can be made here once, instead of
// duplicating a magic route literal across the proxy and the shell where a
// missed copy could silently strand a public page inside the app chrome.
export const PUBLIC_PATHS = new Set(['/', '/account/deleted']);

export const isPublicPath = (pathname: string): boolean =>
  PUBLIC_PATHS.has(pathname);
