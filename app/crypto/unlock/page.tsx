import { UnlockScreen } from '@/features/crypto/UnlockScreen';
import { requireUser } from '@/lib/auth/require-user';

export default async function Page() {
  await requireUser();
  return <UnlockScreen />;
}
