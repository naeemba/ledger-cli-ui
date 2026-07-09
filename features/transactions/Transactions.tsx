// features/transactions/Transactions.tsx
import 'server-only';
import Filters from './Filters';
import TransactionList from './TransactionList';
import { type TransactionFilters } from './applyTransactionFilters';
import { loadJournalTransactions } from './loadJournalTransactions';
import { PAGE_SIZE, pageTransactions } from './pageTransactions';
import Help from '@/components/Help';
import PageContainer from '@/components/PageContainer';
import { requireUser } from '@/lib/auth/require-user';
import { savedViewService } from '@/lib/savedViews';

const Transactions = async ({
  searchParams,
}: {
  searchParams: Promise<TransactionFilters>;
}) => {
  const user = await requireUser();
  const params = await searchParams;
  const [all, existingViewNames] = await Promise.all([
    loadJournalTransactions(user.id),
    savedViewService.listNames(user.id),
  ]);
  const firstPage = pageTransactions(all, params, 0, PAGE_SIZE);
  const payees = [...new Set(all.map((t) => t.payee))].sort();
  const accounts = [
    ...new Set(all.flatMap((t) => t.postings.map((p) => p.account))),
  ].sort();

  return (
    <PageContainer>
      <header className="flex items-center gap-2">
        <h1 className="text-2xl font-semibold">Transactions</h1>
        <Help label="About transactions">
          All edits and deletes from this list rewrite the source file in place.
        </Help>
      </header>
      <Filters
        payees={payees}
        accounts={accounts}
        start={params.start}
        end={params.end}
        existingViewNames={existingViewNames}
      />
      <TransactionList
        key={JSON.stringify(params)}
        initialRows={firstPage.rows}
        total={firstPage.total}
        initialNextOffset={firstPage.nextOffset}
        filters={params}
      />
    </PageContainer>
  );
};

export default Transactions;
