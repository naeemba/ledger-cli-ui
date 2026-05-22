import 'server-only';
import Filters from './Filters';
import TransactionTable from './TransactionTable';
import Help from '@/components/Help';
import { requireUser } from '@/lib/auth/require-user';
import { journalRepository, journalService } from '@/lib/journal';
import { getJournalCacheTag } from '@/lib/journal/layout';
import { type Transaction } from '@/lib/journal/parser';
import { unstable_cache } from 'next/cache';

type SearchParams = {
  start?: string;
  end?: string;
  account?: string;
  payee?: string;
  q?: string;
};

const buildLoader = (tag: string, mtimeMs: number) =>
  unstable_cache(
    async (userId: string): Promise<Transaction[]> => {
      const journal = await journalService.listTransactions(userId);
      return journal.transactions;
    },
    ['journal-transactions', tag, String(mtimeMs)],
    { revalidate: 60, tags: [tag] }
  );

const loadTransactions = async (userId: string) => {
  const mtimeMs = await journalRepository.getMaxMtime(userId);
  return buildLoader(getJournalCacheTag(userId), mtimeMs)(userId);
};

const applyFilters = (txs: Transaction[], params: SearchParams) => {
  const start = params.start ? Date.parse(params.start) : null;
  const end = params.end ? Date.parse(params.end) : null;
  const account = params.account?.toLowerCase().trim();
  const payee = params.payee?.toLowerCase().trim();
  const q = params.q?.toLowerCase().trim();
  return txs.filter((t) => {
    const ts = Date.parse(t.date);
    if (start !== null && ts < start) return false;
    if (end !== null && ts > end) return false;
    if (payee && t.payee.toLowerCase() !== payee) return false;
    if (
      account &&
      !t.postings.some((p) => p.account.toLowerCase().includes(account))
    )
      return false;
    if (q) {
      const hay = [t.payee, t.note ?? '', ...t.postings.map((p) => p.account)]
        .join(' ')
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
};

const Transactions = async ({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) => {
  const user = await requireUser();
  const params = await searchParams;
  const all = await loadTransactions(user.id);
  const filtered = applyFilters(all, params).sort((a, b) =>
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
      />
      <TransactionTable transactions={filtered} />
    </div>
  );
};

export default Transactions;
