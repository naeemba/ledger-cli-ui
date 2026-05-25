'use client';

import { RefreshCw } from 'lucide-react';
import { useTransition } from 'react';
import { toast } from 'sonner';
import { refreshPricesAction } from './actions/refreshPrices';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';

const RefreshPricesButton = () => {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const onClick = () => {
    startTransition(async () => {
      const result = await refreshPricesAction();
      if (result.status === 'success') {
        toast.success(`Prices refreshed — ${result.fetched} symbols`);
      } else if (result.status === 'partial') {
        toast.warning(
          `Prices refreshed — ${result.fetched} symbols; skipped: ${result.failed.join(', ')}`
        );
      } else {
        toast.error(`Refresh failed — ${result.message}`);
      }
      router.refresh();
    });
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onClick}
      disabled={pending}
      aria-label="Refresh prices"
    >
      <RefreshCw className={pending ? 'animate-spin' : ''} />
      Refresh prices
    </Button>
  );
};

export default RefreshPricesButton;
