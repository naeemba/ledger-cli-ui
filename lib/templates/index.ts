import { TemplateRepository } from './repository';
import { TemplateService } from './service';
import { db } from '@/lib/db';

export const templateRepository = new TemplateRepository(db);
export const templateService = new TemplateService(templateRepository);

export { TemplateRepository } from './repository';
export { TemplateService } from './service';
export type { SaveResult, RenameResult } from './service';
export type { TemplateUpdate } from './repository';
export type { TemplateDraft, TemplateInput } from './schema';
export {
  templateDraftSchema,
  templateInputSchema,
  templateNameSchema,
} from './schema';
