import EditTransaction from '@/features/transactions/EditTransaction';

export const dynamic = 'force-dynamic';

export default async function EditTransactionPage({
  params,
}: {
  params: Promise<{ uid: string }>;
}) {
  const { uid } = await params;
  return <EditTransaction uid={uid} />;
}
