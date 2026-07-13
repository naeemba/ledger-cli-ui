import QuickEntry from './QuickEntry';
import { requireUser } from '@/lib/auth/require-user';
import { getAvailableCurrencies } from '@/lib/settings';
import { templateRepository } from '@/lib/templates';
import { getAccountSuggestions } from '@/lib/transactions/suggestions';

// Server wrapper: loads the account list + base currency + saved templates and
// hands them to the client quick-entry split button. Placed in the app header
// slot so it's reachable from every page. ponytail: re-runs `ledger accounts`
// per page render; add a cache wrapper if it shows up in profiling.
export default async function QuickEntrySlot() {
  const user = await requireUser();
  const [accounts, { base }, templates] = await Promise.all([
    getAccountSuggestions(),
    getAvailableCurrencies(),
    templateRepository.list(user.id),
  ]);
  return (
    <QuickEntry
      accounts={accounts}
      defaultCurrency={base}
      templates={templates}
    />
  );
}
