import TransactionForm from './TransactionForm';
import { createTransactionAction } from './actions';
import Help from '@/components/Help';
import TemplatePicker from '@/features/templates/TemplatePicker';
import { requireUser } from '@/lib/auth/require-user';
import { listTemplates, getTemplate } from '@/lib/templates/repository';
import type { TransactionDraft } from '@/lib/transactions/schema';
import {
  getAccountSuggestions,
  getPayeeSuggestions,
} from '@/lib/transactions/suggestions';
import getDefaultCurrency from '@/utils/getDefaultCurrency';

const todayISO = (): string => {
  const d = new Date();
  const tzOffset = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - tzOffset).toISOString().slice(0, 10);
};

type Props = { templateId?: string };

const NewTransaction = async ({ templateId }: Props) => {
  const user = await requireUser();
  const [accounts, payees, templates] = await Promise.all([
    getAccountSuggestions(),
    getPayeeSuggestions(),
    listTemplates(user.id),
  ]);
  const defaultCurrency = getDefaultCurrency() ?? 'USD';

  let initialDraft: TransactionDraft | undefined;
  let templateMissing = false;
  if (templateId) {
    const t = await getTemplate(user.id, templateId);
    if (t) {
      initialDraft = {
        date: todayISO(),
        payee: t.draft.payee,
        status: t.draft.status,
        note: t.draft.note,
        uid: undefined,
        postings: t.draft.postings.map((p) => ({
          account: p.account,
          amount: p.amount,
          currency: p.currency || defaultCurrency,
        })),
      };
    } else {
      templateMissing = true;
    }
  }

  return (
    <div className="flex flex-col gap-6">
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

      <TemplatePicker templates={templates} />

      <TransactionForm
        accounts={accounts}
        payees={payees}
        defaultCurrency={defaultCurrency}
        submitAction={createTransactionAction}
        initialDraft={initialDraft}
        templateMissing={templateMissing}
      />
    </div>
  );
};

export default NewTransaction;
