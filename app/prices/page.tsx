import { PricesTabs } from '@/features/prices';
import { requireUser } from '@/lib/auth/require-user';
import { priceService } from '@/lib/prices';
import { getBaseCurrency } from '@/lib/settings';

export const dynamic = 'force-dynamic';

type SearchParams = { quote?: string };

const PricesPage = async ({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) => {
  const { quote } = await searchParams;
  // Default view values every holding into the display currency through
  // ledger's own price graph (`-X`), so the price shown is ledger's — freshest,
  // bridged, identical to every balance report. `?quote=original` opts into the
  // raw per-commodity journal quote instead. The label and valuation target
  // both come from getBaseCurrency.
  const baseMode = quote !== 'original';
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
