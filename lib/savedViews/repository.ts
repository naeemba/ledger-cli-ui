import { and, eq, sql } from 'drizzle-orm';
import type { SavedViewInput } from './schema';
import { savedView, type SavedView } from '@/db/schema/savedView';
import type { DbInstance } from '@/lib/db/connection';
import { generateUid } from '@/lib/journal/uid';

export type SavedViewPatch = Partial<{ name: string; targetPath: string }>;

export class SavedViewRepository {
  constructor(private readonly db: DbInstance) {}

  async find(userId: string, id: string): Promise<SavedView | null> {
    const row = this.db
      .select()
      .from(savedView)
      .where(and(eq(savedView.userId, userId), eq(savedView.id, id)))
      .get();
    return row ?? null;
  }

  async findByName(userId: string, name: string): Promise<SavedView | null> {
    const row = this.db
      .select()
      .from(savedView)
      .where(and(eq(savedView.userId, userId), eq(savedView.name, name)))
      .get();
    return row ?? null;
  }

  async list(userId: string): Promise<SavedView[]> {
    return this.db
      .select()
      .from(savedView)
      .where(eq(savedView.userId, userId))
      .orderBy(sql`lower(${savedView.name})`)
      .all();
  }

  /** Inserts a new row. Throws on UNIQUE (userId, name) conflict. */
  async create(userId: string, input: SavedViewInput): Promise<SavedView> {
    return this.db
      .insert(savedView)
      .values({
        id: generateUid(),
        userId,
        name: input.name,
        targetPath: input.targetPath,
      })
      .returning()
      .get();
  }

  /** Returns null if no row matches; throws on UNIQUE rename conflict. */
  async update(
    userId: string,
    id: string,
    patch: SavedViewPatch
  ): Promise<SavedView | null> {
    const updates: SavedViewPatch & { updatedAt: Date } = {
      updatedAt: new Date(),
    };
    if (patch.name !== undefined) updates.name = patch.name;
    if (patch.targetPath !== undefined) updates.targetPath = patch.targetPath;
    const row = this.db
      .update(savedView)
      .set(updates)
      .where(and(eq(savedView.userId, userId), eq(savedView.id, id)))
      .returning()
      .get();
    return row ?? null;
  }

  async delete(userId: string, id: string): Promise<boolean> {
    const row = this.db
      .delete(savedView)
      .where(and(eq(savedView.userId, userId), eq(savedView.id, id)))
      .returning({ id: savedView.id })
      .get();
    return !!row;
  }
}
