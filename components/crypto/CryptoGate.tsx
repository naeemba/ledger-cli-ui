import { isAuthPath } from '@/components/AppShell/authPaths';
import { isCryptoPath } from '@/components/AppShell/cryptoPaths';
import { isPublicPath } from '@/components/AppShell/publicPaths';
import { isPrefetchRequest } from '@/components/crypto/isPrefetchRequest';
import { getOptionalUser } from '@/lib/auth/require-user';
import { cryptoStatus } from '@/lib/crypto/gate';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

/** Server gate: routes set-up-incomplete users to /crypto/setup and locked
 * users to /crypto/unlock. No-op on auth/public/crypto paths. Correctness is
 * still backstopped by LockedError at the data layer. */
export async function CryptoGate() {
  const h = await headers();
  const pathname = h.get('x-pathname') ?? '';
  if (
    !pathname ||
    isAuthPath(pathname) ||
    isPublicPath(pathname) ||
    isCryptoPath(pathname)
  ) {
    return null;
  }
  const user = await getOptionalUser();
  if (!user) return null; // proxy already redirects unauthenticated users

  // A prefetch RSC request that receives a redirect is retried by the App
  // Router in a tight loop (vercel/next.js#48438). After a deploy drops the
  // in-RAM DEK, every route bounces to /crypto/unlock, so prefetched nav links
  // (sidebar/header) would replay that redirect endlessly — the `unlock?_rsc`
  // storm + blank screen the user sees. Never redirect a prefetch; the real
  // navigation or full reload that follows redirects normally, and the data
  // layer's LockedError is the hard backstop regardless.
  if (isPrefetchRequest(h)) return null;

  const status = await cryptoStatus(user.id);
  if (status === 'unset') redirect('/crypto/setup');
  if (status === 'locked') redirect('/crypto/unlock');
  return null;
}
