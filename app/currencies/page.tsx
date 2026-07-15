import { listCommoditiesAction } from '@/features/commodities/actions';
import { CurrenciesTabs } from '@/features/currencies/CurrenciesTabs';
import { listMappingsAction } from '@/features/currencies/actions';
import { requireUser } from '@/lib/auth/require-user';
import { getAvailableCurrencies } from '@/lib/settings/getAvailableCurrencies';

export const dynamic = 'force-dynamic';

export default async function CurrenciesPage() {
  await requireUser();
  const [mappingRows, commodityRows, { currencies }] = await Promise.all([
    listMappingsAction(),
    listCommoditiesAction(),
    getAvailableCurrencies(),
  ]);
  return (
    <CurrenciesTabs
      mappingRows={mappingRows}
      commodityRows={commodityRows}
      observedSymbols={currencies}
    />
  );
}
