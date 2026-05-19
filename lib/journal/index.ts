import { JournalRepository } from './repository';
import { JournalService } from './service';
import { db } from '@/lib/db';

export const journalRepository = new JournalRepository(db);
export const journalService = new JournalService(journalRepository);

export { JournalRepository } from './repository';
export { JournalService } from './service';

export type { JournalLayout } from './repository';
export type {
  AddTransactionResult,
  BackfillResult,
  BackfillFileResult,
  WriteEditInput,
  WriteDeleteInput,
  WriteInput,
  WriteResult,
} from './service';

export {
  DEFAULT_MAIN,
  PRICE_DB_NAME,
  getJournalDir,
  getJournalCacheTag,
} from './layout';
