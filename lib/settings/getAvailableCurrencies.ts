import { cache } from 'react';
import 'server-only';
import { getBaseCurrency } from './getBaseCurrency';
import { parseCommodityList } from './parseCommodityList';
import runLedger from '@/utils/runLedger';

export const getAvailableCurrencies = cache(
  async (): Promise<{ currencies: string[]; base: string }> => {
    const [stdout, base] = await Promise.all([
      runLedger(['commodities']),
      getBaseCurrency(),
    ]);
    return { currencies: parseCommodityList(stdout, base), base };
  }
);
