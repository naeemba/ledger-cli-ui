import { SetupWizard } from '@/features/crypto/SetupWizard';
import { requireUser } from '@/lib/auth/require-user';
import { cryptoStatus } from '@/lib/crypto/gate';
import { redirect } from 'next/navigation';

export default async function Page() {
  const user = await requireUser();
  // If a userCrypto row already exists (e.g. a prior setup attempt wrote the
  // row but the page was reloaded), don't re-enter the wizard — setupCrypto
  // would reject with "already set up" and wedge the user. Route them to
  // unlock instead. The CryptoGate no-ops on /crypto/* paths, so this page
  // owns the redirect for already-set-up users.
  if ((await cryptoStatus(user.id)) !== 'unset') redirect('/crypto/unlock');
  return <SetupWizard />;
}
