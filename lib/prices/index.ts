import { ManualPriceRepository } from './manualRepository';
import { CommodityMappingRepository } from './mappingRepository';
import {
  CommodityPriceRepository,
  PriceFetchRunRepository,
} from './repository';
import { PriceService } from './service';
import { db } from '@/lib/db';
import { journalRepository } from '@/lib/journal';

export const commodityPriceRepository = new CommodityPriceRepository(db);
export const priceFetchRunRepository = new PriceFetchRunRepository(db);
export const manualPriceRepository = new ManualPriceRepository(db);
export const commodityMappingRepository = new CommodityMappingRepository(db);
export const priceService = new PriceService({
  db,
  commodityRepo: commodityPriceRepository,
  runRepo: priceFetchRunRepository,
  journalRepo: journalRepository,
  manualRepo: manualPriceRepository,
  mappingRepo: commodityMappingRepository,
});

export { PriceService } from './service';
export type { RefreshResult } from './service';
export {
  CommodityPriceRepository,
  PriceFetchRunRepository,
} from './repository';
export { ManualPriceRepository } from './manualRepository';
export { CommodityMappingRepository } from './mappingRepository';
export { fetchPricesUsd } from './provider';
export type {
  FetchPlan,
  CryptoTarget,
  FiatTarget,
  PriceQuote,
  ProviderResult,
} from './provider';
export { renderPriceDb, hasGeneratedBanner, BANNER_MARKER } from './formatter';
export type { CommodityPriceRow } from './formatter';
