import 'server-only';
import { updateTransactionAction } from './actions';
import TransactionEntry from './entry/TransactionEntry';
import { getAccountBalance } from './entry/actions/getAccountBalance';
import { requireUser } from '@/lib/auth/require-user';
import { journalService } from '@/lib/journal';
import { fingerprintDraft } from '@/lib/journal/fingerprint';
import { getAvailableCurrencies, getEntryTabOrder } from '@/lib/settings';
import {
  getAccountSuggestions,
  getPayeeSuggestions,
} from '@/lib/transactions/suggestions';
import { notFound } from 'next/navigation';

const EditTransaction = async ({ uid }: { uid: string }) => {
  const user = await requireUser();
  const tx = await journalService.findTransaction(user.id, uid);
  if (!tx) notFound();

  const [{ currencies, base: defaultCurrency }, tabOrder] = await Promise.all([
    getAvailableCurrencies(),
    getEntryTabOrder(),
  ]);
  const initialDraft = {
    date: tx.date,
    payee: tx.payee,
    status: tx.status,
    note: tx.note ?? undefined,
    uid: tx.uid ?? undefined,
    postings: tx.postings.map((p) => ({
      account: p.account,
      amount: p.amount,
      currency: p.currency || defaultCurrency,
    })),
  };
  const expectedFingerprint = fingerprintDraft(initialDraft);
  const [accounts, payees] = await Promise.all([
    getAccountSuggestions(),
    getPayeeSuggestions(),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Edit transaction</h1>
      <TransactionEntry
        mode="edit"
        initialDraft={initialDraft}
        uid={uid}
        expectedFingerprint={expectedFingerprint}
        submitAction={updateTransactionAction}
        accounts={accounts}
        payees={payees}
        defaultCurrency={defaultCurrency}
        currencies={currencies}
        tabOrder={tabOrder}
        getAccountBalance={getAccountBalance}
      />
    </div>
  );
};

export default EditTransaction;
