import { CommodityDefinitionService } from './service';
import { db } from '@/lib/db';
import { JournalRepository } from '@/lib/journal/repository';

export { type CommodityDefinition, type CommodityBlock } from './blocks';
export {
  CommodityDefinitionService,
  type CommodityRow,
  type CommodityWriteResult,
} from './service';

export const commodityDefinitionService = new CommodityDefinitionService(
  new JournalRepository(db)
);
