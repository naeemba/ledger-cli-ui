import QuickEntry from './QuickEntry';
import TransactionEditDialog from './TransactionEditDialog';
import { getAvailableCurrencies } from '@/lib/settings';
import { getAccountSuggestions } from '@/lib/transactions/suggestions';

// Server wrapper: loads the account list + base currency and hands them to the
// client quick-entry split button. Placed in the app header slot so it's
// reachable from every page. ponytail: re-runs `ledger accounts` per page
// render; add a cache wrapper if it shows up in profiling.
export default async function QuickEntrySlot() {
  const [accounts, { base }] = await Promise.all([
    getAccountSuggestions(),
    getAvailableCurrencies(),
  ]);
  return (
    <>
      <QuickEntry accounts={accounts} defaultCurrency={base} />
      <TransactionEditDialog />
    </>
  );
}
