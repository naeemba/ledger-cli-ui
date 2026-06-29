import { createTransactionAction } from './actions';
import TransactionEntry from './entry/TransactionEntry';
import { getAccountBalance } from './entry/actions/getAccountBalance';
import Help from '@/components/Help';
import TemplatePicker from '@/features/templates/TemplatePicker';
import { requireUser } from '@/lib/auth/require-user';
import { getBaseCurrency, getEntryTabOrder } from '@/lib/settings';
import { templateRepository } from '@/lib/templates';
import type { TransactionDraft } from '@/lib/transactions/schema';
import {
  getAccountSuggestions,
  getPayeeSuggestions,
} from '@/lib/transactions/suggestions';

type Props = { templateId?: string };

const NewTransaction = async ({ templateId }: Props) => {
  const user = await requireUser();
  const [accounts, payees, templates] = await Promise.all([
    getAccountSuggestions(),
    getPayeeSuggestions(),
    templateRepository.list(user.id),
  ]);
  const [defaultCurrency, tabOrder] = await Promise.all([
    getBaseCurrency(),
    getEntryTabOrder(),
  ]);

  // Note: we intentionally do NOT seed `date` here. The client computes today's
  // date in the user's local timezone (`TransactionEntry` falls back to its own
  // `todayISO`), avoiding a server/client tz skew at midnight boundaries.
  let initialDraft:
    | (Omit<TransactionDraft, 'date'> & { date?: string })
    | undefined;
  let templateMissing = false;
  if (templateId) {
    const t = await templateRepository.find(user.id, templateId);
    if (t) {
      initialDraft = {
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
        <p className="mt-1 text-sm text-muted-foreground">
          A new entry is appended to your journal file. Reports refresh
          immediately.
        </p>
      </div>

      <TemplatePicker templates={templates} />

      <TransactionEntry
        accounts={accounts}
        payees={payees}
        defaultCurrency={defaultCurrency}
        tabOrder={tabOrder}
        submitAction={createTransactionAction}
        getAccountBalance={getAccountBalance}
        initialDraft={initialDraft}
        templateMissing={templateMissing}
      />
    </div>
  );
};

export default NewTransaction;
