import { PricesTabs } from '@/features/prices';
import { requireUser } from '@/lib/auth/require-user';
import { priceService } from '@/lib/prices';

export const dynamic = 'force-dynamic';

type SearchParams = { base?: string };

const PricesPage = async ({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) => {
  const { base } = await searchParams;
  const baseMode = base === 'usd';
  const user = await requireUser();
  const [known, prices, commodities, baseCurrency] = await Promise.all([
    baseMode
      ? priceService.listKnownPricesInBase(user.id)
      : priceService.listKnownPrices(user.id),
    priceService.listManualPrices(user.id),
    priceService.listNormalizedSymbolsForUser(user.id),
    priceService.resolveBaseCurrency(user.id),
  ]);

  return (
    <PricesTabs
      known={known}
      prices={prices}
      commodities={commodities}
      baseCurrency={baseCurrency}
      baseMode={baseMode}
    />
  );
};

export default PricesPage;
