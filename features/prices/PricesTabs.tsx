'use client';

import { useState } from 'react';
import { KnownPricesView } from './KnownPricesView';
import { PricesView } from './PricesView';
import type { ManualPrice } from '@/db/schema';
import { TabBar } from '@/features/transactions/entry/TabBar';
import type { KnownPrice } from '@/lib/prices';

type Props = {
  known: KnownPrice[];
  prices: ManualPrice[];
  commodities: string[];
  baseCurrency: string;
  baseMode: boolean;
};

const TABS = [
  { id: 'known', label: 'Known prices' },
  { id: 'manual', label: 'Manual entry' },
];

export const PricesTabs = ({
  known,
  prices,
  commodities,
  baseCurrency,
  baseMode,
}: Props) => {
  const [active, setActive] = useState('known');

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-4">
      <header>
        <h1 className="text-2xl font-semibold">Prices</h1>
      </header>
      <TabBar tabs={TABS} active={active} onSelect={setActive} />
      {active === 'known' ? (
        <KnownPricesView
          rows={known}
          baseMode={baseMode}
          baseCurrency={baseCurrency}
        />
      ) : (
        <>
          <p className="text-muted-foreground text-sm">
            Record exchange rates for commodities (e.g. KIRT) your price
            provider doesn&apos;t cover. Each rate is dated, so historical
            reports use the rate in effect at the time.
          </p>
          <PricesView
            prices={prices}
            commodities={commodities}
            baseCurrency={baseCurrency}
          />
        </>
      )}
    </div>
  );
};
