import { SetupWizard } from '@/features/crypto/SetupWizard';
import { requireUser } from '@/lib/auth/require-user';

export default async function Page() {
  await requireUser();
  return <SetupWizard />;
}
