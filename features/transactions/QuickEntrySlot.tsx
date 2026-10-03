import AddTransactionButton from './AddTransactionButton';
import TransactionEditDialog from './TransactionEditDialog';
import { isPublicRequest } from '@/components/AppShell/isPublicRequest';
import { getOptionalUser } from '@/lib/auth/require-user';

// App-header slot: the add-transaction button plus the shared edit dialog,
// mounted once so both are reachable from every page.
export default async function QuickEntrySlot() {
  if (await isPublicRequest()) return null;
  const user = await getOptionalUser();
  if (!user) return null;
  return (
    <>
      <AddTransactionButton />
      <TransactionEditDialog />
    </>
  );
}
