import { PricesView } from '@/features/prices';
import { requireUser } from '@/lib/auth/require-user';
import { priceService } from '@/lib/prices';

export const dynamic = 'force-dynamic';

const PricesPage = async () => {
  const user = await requireUser();
  const [prices, commodities, baseCurrency] = await Promise.all([
    priceService.listManualPrices(user.id),
    priceService.listNormalizedSymbolsForUser(user.id),
    priceService.resolveBaseCurrency(user.id),
  ]);

  return (
    <PricesView
      prices={prices}
      commodities={commodities}
      baseCurrency={baseCurrency}
    />
  );
};

export default PricesPage;
