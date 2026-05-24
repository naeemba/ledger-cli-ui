import { cache } from 'react';
import 'server-only';
import { getBaseCurrency } from './getBaseCurrency';
import { parseUnconverted } from './parseUnconverted';
import runLedger from '@/utils/runLedger';

export const getMissingRateCommodities = cache(
  async (): Promise<{ unconverted: string[] }> => {
    const base = await getBaseCurrency();
    const stdout = await runLedger([
      'balance',
      '--flat',
      '--no-total',
      '-X',
      base,
    ]);
    return { unconverted: parseUnconverted(stdout, base) };
  }
);
