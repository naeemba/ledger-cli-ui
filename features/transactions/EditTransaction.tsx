import 'server-only';
import TransactionForm from './TransactionForm';
import { updateTransactionAction } from './actions';
import { requireUser } from '@/lib/auth/require-user';
import { journalService } from '@/lib/journal';
import { fingerprintDraft } from '@/lib/journal/fingerprint';
import {
  getAccountSuggestions,
  getPayeeSuggestions,
} from '@/lib/transactions/suggestions';
import getDefaultCurrency from '@/utils/getDefaultCurrency';
import { notFound } from 'next/navigation';

const EditTransaction = async ({ uid }: { uid: string }) => {
  const user = await requireUser();
  const tx = await journalService.findTransaction(user.id, uid);
  if (!tx) notFound();

  const defaultCurrency = getDefaultCurrency() ?? 'USD';
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
      <TransactionForm
        mode="edit"
        initialDraft={initialDraft}
        uid={uid}
        expectedFingerprint={expectedFingerprint}
        submitAction={updateTransactionAction}
        accounts={accounts}
        payees={payees}
        defaultCurrency={defaultCurrency}
      />
    </div>
  );
};

export default EditTransaction;
