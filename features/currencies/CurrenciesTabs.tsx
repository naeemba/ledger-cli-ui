'use client';

import { useState } from 'react';
import CurrenciesView from './CurrenciesView';
import type { MappingRow } from './actions';
import PageContainer from '@/components/PageContainer';
import CommoditiesView from '@/features/commodities/CommoditiesView';
import { TabBar } from '@/features/transactions/entry/TabBar';
import type { CommodityRow } from '@/lib/commodities';

const TABS = [
  { id: 'mapping', label: 'Price mapping' },
  { id: 'commodities', label: 'Commodities' },
];

type Props = {
  mappingRows: MappingRow[];
  commodityRows: CommodityRow[];
  observedSymbols: string[];
};

export const CurrenciesTabs = ({
  mappingRows,
  commodityRows,
  observedSymbols,
}: Props) => {
  const [active, setActive] = useState('mapping');
  return (
    <PageContainer>
      <header>
        <h1 className="text-2xl font-semibold">Currencies</h1>
      </header>
      <TabBar tabs={TABS} active={active} onSelect={setActive} />
      {active === 'mapping' ? (
        <CurrenciesView rows={mappingRows} />
      ) : (
        <CommoditiesView
          rows={commodityRows}
          observedSymbols={observedSymbols}
        />
      )}
    </PageContainer>
  );
};
