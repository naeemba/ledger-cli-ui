import QuickEntry from './QuickEntry';
import { requireUser } from '@/lib/auth/require-user';
import { getAvailableCurrencies } from '@/lib/settings';
import { templateRepository } from '@/lib/templates';
import { getAccountSuggestions } from '@/lib/transactions/suggestions';

// Self-loading add-transaction split button (all quick-entry variants).
// Drop it anywhere; it fetches its own accounts/currency/templates.
// The shared edit dialog it drives is mounted once in the app shell.
// ponytail: re-runs `ledger accounts` per render; add a cache wrapper if it
// shows up in profiling.
export default async function AddTransactionButton() {
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
