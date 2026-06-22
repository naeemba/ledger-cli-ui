import type { SavedViewRepository } from './repository';
import type { SavedViewInput } from './schema';
import type { SavedView } from '@/db/schema/savedView';
import { isUniqueConflict } from '@/lib/db/isUniqueConflict';

export type SaveResult =
  | { ok: true; view: SavedView }
  | { ok: false; reason: 'name-conflict' };

export type RenameResult =
  | { ok: true; view: SavedView }
  | { ok: false; reason: 'name-conflict' | 'not-found' };

export class SavedViewService {
  constructor(private readonly repo: SavedViewRepository) {}

  list(userId: string): Promise<SavedView[]> {
    return this.repo.list(userId);
  }

  /**
   * Names of a user's saved views. Used by render paths that only need the
   * `name` set (e.g. to detect conflicts in the Save dialog) so the projection
   * lives here instead of being re-spelled at every call site.
   */
  async listNames(userId: string): Promise<string[]> {
    const views = await this.repo.list(userId);
    return views.map((v) => v.name);
  }

  /**
   * Create a new saved view. If a row with the same name exists, return
   * `name-conflict` unless `overwrite` is true — in which case the existing
   * row is updated in place (same id and createdAt, new targetPath, bumped
   * updatedAt).
   */
  async saveOrOverwrite(
    userId: string,
    input: SavedViewInput,
    opts: { overwrite?: boolean } = {}
  ): Promise<SaveResult> {
    const existing = await this.repo.findByName(userId, input.name);
    if (existing) {
      if (!opts.overwrite) return { ok: false, reason: 'name-conflict' };
      const updated = await this.repo.update(userId, existing.id, {
        targetPath: input.targetPath,
      });
      if (!updated) return { ok: false, reason: 'name-conflict' };
      return { ok: true, view: updated };
    }
    try {
      const created = await this.repo.create(userId, input);
      return { ok: true, view: created };
    } catch (e) {
      if (isUniqueConflict(e)) return { ok: false, reason: 'name-conflict' };
      throw e;
    }
  }

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
      return { ok: true, view: updated };
    } catch (e) {
      if (isUniqueConflict(e)) return { ok: false, reason: 'name-conflict' };
      throw e;
    }
  }

  async delete(userId: string, id: string): Promise<void> {
    await this.repo.delete(userId, id);
  }
}
