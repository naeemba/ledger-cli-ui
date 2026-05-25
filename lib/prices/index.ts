import {
  CommodityPriceRepository,
  PriceFetchRunRepository,
} from './repository';
import { PriceService } from './service';
import { db } from '@/lib/db';
import { journalRepository } from '@/lib/journal';

export const commodityPriceRepository = new CommodityPriceRepository(db);
export const priceFetchRunRepository = new PriceFetchRunRepository(db);
export const priceService = new PriceService({
  db,
  commodityRepo: commodityPriceRepository,
  runRepo: priceFetchRunRepository,
  journalRepo: journalRepository,
});

export { PriceService } from './service';
export type { RefreshResult } from './service';
export {
  CommodityPriceRepository,
  PriceFetchRunRepository,
} from './repository';
export { fetchPrices } from './provider';
export type { QuotePair, PriceQuote, ProviderResult } from './provider';
export { renderPriceDb, hasGeneratedBanner, BANNER_MARKER } from './formatter';
export type { CommodityPriceRow } from './formatter';
