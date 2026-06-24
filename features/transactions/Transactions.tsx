import 'server-only';
import Filters from './Filters';
import TransactionTable from './TransactionTable';
import {
  applyTransactionFilters,
  type TransactionFilters,
} from './applyTransactionFilters';
import Help from '@/components/Help';
import { requireUser } from '@/lib/auth/require-user';
import { journalRepository } from '@/lib/journal';
import { getJournalCacheTag } from '@/lib/journal/layout';
import { type Transaction } from '@/lib/journal/parser';
import { savedViewService } from '@/lib/savedViews';
import { unstable_cache } from 'next/cache';

const buildLoader = (tag: string, fingerprint: string) =>
  unstable_cache(
    async (userId: string): Promise<Transaction[]> => {
      // getFingerprint (below) already pulled the canonical journal into the
      // local cache, so read straight from the repository — going through
      // journalService.listTransactions would pull a second time.
      const journal = await journalRepository.list(userId);
      return journal.transactions;
    },
    ['journal-transactions', tag, fingerprint],
    { revalidate: 60, tags: [tag] }
  );

const loadTransactions = async (userId: string) => {
  const fingerprint = await journalRepository.getFingerprint(userId);
  return buildLoader(getJournalCacheTag(userId), fingerprint)(userId);
};

const Transactions = async ({
  searchParams,
}: {
  searchParams: Promise<TransactionFilters>;
}) => {
  const user = await requireUser();
  const params = await searchParams;
  const [all, existingViewNames] = await Promise.all([
    loadTransactions(user.id),
    savedViewService.listNames(user.id),
  ]);
  const filtered = applyTransactionFilters(all, params).sort((a, b) =>
    b.date.localeCompare(a.date)
  );
  const payees = [...new Set(all.map((t) => t.payee))].sort();
  const accounts = [
    ...new Set(all.flatMap((t) => t.postings.map((p) => p.account))),
  ].sort();

  return (
    <div className="flex flex-col gap-6">
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
      <TransactionTable transactions={filtered} />
    </div>
  );
};

export default Transactions;
