import type { TemplateRepository } from './repository';
import type { TemplateInput } from './schema';
import type { Template } from '@/db/schema/template';
import { isUniqueConflict } from '@/lib/db/isUniqueConflict';

export type SaveResult =
  | { ok: true; template: Template }
  | { ok: false; reason: 'name-conflict' };

export type RenameResult =
  | { ok: true; template: Template }
  | { ok: false; reason: 'name-conflict' | 'not-found' };

export class TemplateService {
  constructor(private readonly repo: TemplateRepository) {}

  /**
   * Save a new template. If a template with the same name exists, return
   * `name-conflict` unless `overwrite` is true — in which case the existing
   * row is updated (same id, new draft, bumped updatedAt).
   */
  async saveOrOverwrite(
    userId: string,
    input: TemplateInput,
    opts: { overwrite?: boolean } = {}
  ): Promise<SaveResult> {
    const existing = await this.repo.findByName(userId, input.name);
    if (existing) {
      if (!opts.overwrite) return { ok: false, reason: 'name-conflict' };
      const updated = await this.repo.update(userId, existing.id, {
        draft: input.draft,
      });
      if (!updated) return { ok: false, reason: 'name-conflict' };
      return { ok: true, template: updated };
    }
    try {
      const saved = await this.repo.save(userId, input);
      return { ok: true, template: saved };
    } catch (e) {
      if (isUniqueConflict(e)) return { ok: false, reason: 'name-conflict' };
      throw e;
    }
  }

  /**
   * Rename a template. Returns `not-found` when the id doesn't belong to the
   * user, or `name-conflict` when another template already owns the new name.
   */
  async rename(
    userId: string,
    id: string,
    name: string
  ): Promise<RenameResult> {
    const owned = await this.repo.find(userId, id);
    if (!owned) return { ok: false, reason: 'not-found' };
    try {
      const updated = await this.repo.update(userId, id, { name });
      if (!updated) return { ok: false, reason: 'not-found' };
      return { ok: true, template: updated };
    } catch (e) {
      if (isUniqueConflict(e)) return { ok: false, reason: 'name-conflict' };
      throw e;
    }
  }
}
