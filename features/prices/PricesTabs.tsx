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
}: Props) => {
  const [active, setActive] = useState('known');

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-4">
      <header>
        <h1 className="text-2xl font-semibold">Prices</h1>
      </header>
      <TabBar tabs={TABS} active={active} onSelect={setActive} />
      {active === 'known' ? (
        <KnownPricesView rows={known} />
      ) : (
        <PricesView
          prices={prices}
          commodities={commodities}
          baseCurrency={baseCurrency}
        />
      )}
    </div>
  );
};
