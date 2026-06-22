// Paths that render the chrome-free, centered auth layout instead of the full
// app shell (sidebar + header). The auth route is owned by the starter and
// mounted at /sign-in (+ /sign-in/error). Kept in its own tested module so a
// future route rename can't silently strand the sign-in page inside the app
// chrome — where AppHeader's useSession/signOut assume an authenticated user.
export const AUTH_PATHS = new Set(['/sign-in', '/sign-in/error']);

export const isAuthPath = (pathname: string): boolean =>
  AUTH_PATHS.has(pathname);
