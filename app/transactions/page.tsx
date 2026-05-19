import Transactions from '@/features/transactions/Transactions';

export const dynamic = 'force-dynamic';

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Parameters<typeof Transactions>[0]['searchParams'];
}) {
  return <Transactions searchParams={searchParams} />;
}
