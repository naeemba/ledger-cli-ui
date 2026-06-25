import { isAuthPath } from '@/components/AppShell/authPaths';
import { isCryptoPath } from '@/components/AppShell/cryptoPaths';
import { isPublicPath } from '@/components/AppShell/publicPaths';
import { getOptionalUser } from '@/lib/auth/require-user';
import { cryptoStatus } from '@/lib/crypto/gate';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

/** Server gate: routes set-up-incomplete users to /crypto/setup and locked
 * users to /crypto/unlock. No-op on auth/public/crypto paths. Correctness is
 * still backstopped by LockedError at the data layer. */
export async function CryptoGate() {
  const pathname = (await headers()).get('x-pathname') ?? '';
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
  const status = await cryptoStatus(user.id);
  if (status === 'unset') redirect('/crypto/setup');
  if (status === 'locked') redirect('/crypto/unlock');
  return null;
}
