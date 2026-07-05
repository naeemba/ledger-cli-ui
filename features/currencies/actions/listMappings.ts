'use server';

import type { MappingRow } from './types';
import { requireUser } from '@/lib/auth/require-user';
import { commodityMappingRepository, priceService } from '@/lib/prices';

export async function listMappingsAction(): Promise<MappingRow[]> {
  const user = await requireUser();
  const [mappings, symbols] = await Promise.all([
    commodityMappingRepository.listForUser(user.id),
    priceService.listNormalizedSymbolsForUser(user.id),
  ]);
  const inUse = new Set(symbols);
  const bySymbol = new Map(
    mappings.map((mapping) => [mapping.symbol, mapping])
  );
  // Union of mapped symbols and in-use symbols so unmapped-in-use rows surface.
  const allSymbols = new Set<string>([...bySymbol.keys(), ...inUse]);
  return [...allSymbols].sort().map((symbol) => {
    const mapping = bySymbol.get(symbol);
    return {
      symbol,
      kind: mapping?.kind ?? 'unmapped',
      providerId: mapping?.providerId ?? null,
      source: mapping?.source ?? 'none',
      inUse: inUse.has(symbol),
    };
  });
}
