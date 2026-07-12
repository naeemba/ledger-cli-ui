import QuickExpenseDialog from './QuickExpenseDialog';
import { getAvailableCurrencies } from '@/lib/settings';
import { getAccountSuggestions } from '@/lib/transactions/suggestions';

// Server wrapper: loads the account list + base currency and hands them to the
// client dialog. Placed in the app header slot so the dialog is reachable from
// every page. ponytail: re-runs `ledger accounts` per page render; add a cache
// wrapper if it shows up in profiling.
export default async function QuickExpenseSlot() {
  const [accounts, { base }] = await Promise.all([
    getAccountSuggestions(),
    getAvailableCurrencies(),
  ]);
  return <QuickExpenseDialog accounts={accounts} defaultCurrency={base} />;
}
