import 'server-only';
import TransactionForm from '@/app/transactions/new/TransactionForm';
import type { TransactionActionState } from '@/app/transactions/new/actions';
import { requireUser } from '@/lib/auth/require-user';
import { fingerprintDraft } from '@/lib/journal/fingerprint';
import { parseJournal } from '@/lib/journal/parser';
import { resolveUserJournal } from '@/lib/journals';
import {
  getAccountSuggestions,
  getPayeeSuggestions,
} from '@/lib/transactions/suggestions';
import getDefaultCurrency from '@/utils/getDefaultCurrency';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

// Placeholder — replaced in Task 22 with the real updateTransactionAction.
const updateTransactionAction = async (
  _prev: TransactionActionState | null,
  _formData: FormData
): Promise<TransactionActionState> => {
  return { ok: false, formError: 'Edit action not yet wired (Task 22).' };
};

export default async function EditTransactionPage({
  params,
}: {
  params: Promise<{ uid: string }>;
}) {
  const user = await requireUser();
  const { uid } = await params;
  const { mainPath } = await resolveUserJournal(user.id);
  const journal = await parseJournal(mainPath);
  const tx = journal.transactions.find((t) => t.uid === uid);
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
}
