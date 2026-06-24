// Paths that render the chrome-free, full-bleed auth layout instead of the full
// app shell (sidebar + header). The custom AuthScreen is mounted at /sign-in
// (+ /sign-in/error) and /sign-up (registration is open to multi-user). Kept in
// its own tested module so a future route rename can't silently strand an auth
// page inside the app chrome — where AppHeader's useSession/signOut assume an
// authenticated user.
export const AUTH_PATHS = new Set(['/sign-in', '/sign-in/error', '/sign-up']);

export const isAuthPath = (pathname: string): boolean =>
  AUTH_PATHS.has(pathname);
