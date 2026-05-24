import { Info } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { getBaseCurrency, getMissingRateCommodities } from '@/lib/settings';

const BaseCurrencyBanner = async () => {
  const [base, { unconverted }] = await Promise.all([
    getBaseCurrency(),
    getMissingRateCommodities(),
  ]);

  if (unconverted.length === 0) return null;

  return (
    <Alert className="mx-auto mt-4 w-full max-w-7xl">
      <Info className="size-4" />
      <AlertDescription>
        Some amounts couldn&apos;t be converted to <strong>{base}</strong>.
        Missing exchange rates from: <strong>{unconverted.join(', ')}</strong>.
        Affected reports show original currencies inline.
      </AlertDescription>
    </Alert>
  );
};

export default BaseCurrencyBanner;
