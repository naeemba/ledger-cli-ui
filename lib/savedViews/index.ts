import { SavedViewRepository } from './repository';
import { SavedViewService } from './service';
import { db } from '@/lib/db';

export const savedViewRepository = new SavedViewRepository(db);
export const savedViewService = new SavedViewService(savedViewRepository);

export { SavedViewRepository } from './repository';
export { SavedViewService } from './service';
export type { SavedViewPatch } from './repository';
export type { SaveResult, RenameResult } from './service';
export type { SavedViewInput } from './schema';
export {
  savedViewInputSchema,
  savedViewNameSchema,
  savedViewTargetPathSchema,
  canonicalizeTargetPath,
} from './schema';
