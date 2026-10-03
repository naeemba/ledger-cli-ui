import AddTransactionButton from './AddTransactionButton';
import TransactionEditDialog from './TransactionEditDialog';
import { getOptionalUser } from '@/lib/auth/require-user';

// App-header slot: the add-transaction button plus the shared edit dialog,
// mounted once so both are reachable from every page.
export default async function QuickEntrySlot() {
  const user = await getOptionalUser();
  if (!user) return null;
  return (
    <>
      <AddTransactionButton />
      <TransactionEditDialog />
    </>
  );
}
