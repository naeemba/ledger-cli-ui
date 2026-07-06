'use server';

import type { JournalMapping } from './buildCommoditySuggestions';
import { requireUser } from '@/lib/auth/require-user';
import { commodityMappingRepository } from '@/lib/prices';
import { rateLimit, READ } from '@/lib/rate-limit';
import { getAvailableCurrencies } from '@/lib/settings/getAvailableCurrencies';

/**
 * The invariant-per-session inputs to a commodity search: the journal's own
 * commodity symbols and the user's saved mappings. Both are fixed for the life
 * of an open picker, so the combobox loads this once on open and threads it into
 * every subsequent {@link searchCommoditiesAction} call — keeping the `ledger
 * commodities` subprocess and the mappings query off the per-keystroke path.
 */
export type CommodityContext = {
  journal: string[];
  mappings: Map<string, JournalMapping>;
};

export async function loadCommodityContextAction(): Promise<CommodityContext> {
  const user = await requireUser();
  if (!rateLimit(READ, user.id).allowed) {
    return { journal: [], mappings: new Map() };
  }

  const [{ currencies }, mappings] = await Promise.all([
    getAvailableCurrencies(),
    commodityMappingRepository.mapForUser(user.id),
  ]);

  return { journal: currencies, mappings };
}
