import { PricesTabs } from '@/features/prices';
import { requireUser } from '@/lib/auth/require-user';
import { priceService } from '@/lib/prices';
import { getBaseCurrency } from '@/lib/settings';

export const dynamic = 'force-dynamic';

type SearchParams = { base?: string };

const PricesPage = async ({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) => {
  const { base } = await searchParams;
  // `base=base` is a mode flag ("value into the display currency"), not the
  // currency code itself — the label and target both come from getBaseCurrency.
  const baseMode = base === 'base';
  const user = await requireUser();
  // The display currency the user picked (session cookie → saved setting →
  // default), the same resolver every report page uses. Distinct from the USD
  // pricing base that prices are stored and fetched in.
  const displayCurrency = await getBaseCurrency();
  const [known, prices, commodities] = await Promise.all([
    baseMode
      ? priceService.listKnownPricesInBase(user.id, displayCurrency)
      : priceService.listKnownPrices(user.id),
    priceService.listManualPrices(user.id),
    priceService.listNormalizedSymbolsForUser(user.id),
  ]);

  return (
    <PricesTabs
      known={known}
      prices={prices}
      commodities={commodities}
      baseCurrency={displayCurrency}
      baseMode={baseMode}
    />
  );
};

export default PricesPage;
