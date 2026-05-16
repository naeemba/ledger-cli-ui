import TransactionForm from './TransactionForm';
import Help from '@/components/Help';
import {
  getAccountSuggestions,
  getPayeeSuggestions,
} from '@/lib/transactions/suggestions';
import getDefaultCurrency from '@/utils/getDefaultCurrency';

export const dynamic = 'force-dynamic';

export default async function NewTransactionPage() {
  const [accounts, payees] = await Promise.all([
    getAccountSuggestions(),
    getPayeeSuggestions(),
  ]);
  const defaultCurrency = getDefaultCurrency() ?? 'USD';

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            Add transaction
          </h1>
          <Help label="About adding transactions">
            Appends a balanced posting block to your journal&apos;s main file.
            All postings must sum to zero per currency, or leave exactly one
            amount blank to let ledger auto-balance it.
          </Help>
        </div>
        <p className="mt-1 text-sm text-muted">
          A new entry is appended to your journal file. Reports refresh
          immediately.
        </p>
      </div>

      <TransactionForm
        accounts={accounts}
        payees={payees}
        defaultCurrency={defaultCurrency}
      />
    </div>
  );
}
