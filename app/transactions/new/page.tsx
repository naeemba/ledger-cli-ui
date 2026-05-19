import NewTransaction from '@/features/transactions/NewTransaction';

export const dynamic = 'force-dynamic';

type SearchParams = { template?: string };

export default async function NewTransactionPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  return <NewTransaction templateId={params.template} />;
}
