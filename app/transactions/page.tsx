import Transactions from '@/features/transactions/Transactions';

export const dynamic = 'force-dynamic';

type SearchParams = {
  start?: string;
  end?: string;
  account?: string;
  payee?: string;
  q?: string;
};

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  return <Transactions searchParams={searchParams} />;
}
