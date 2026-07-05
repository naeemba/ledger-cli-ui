import CurrenciesView from '@/features/currencies/CurrenciesView';
import { listMappingsAction } from '@/features/currencies/actions';
import { requireUser } from '@/lib/auth/require-user';

export const dynamic = 'force-dynamic';

export default async function CurrenciesPage() {
  await requireUser();
  const rows = await listMappingsAction();
  return <CurrenciesView rows={rows} />;
}
