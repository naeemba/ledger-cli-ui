import { and, eq, sql } from 'drizzle-orm';
import type { SavedViewInput } from './schema';
import { savedView, type SavedView } from '@/db/schema/savedView';
import type { DbInstance } from '@/lib/db/connection';
import { generateUid } from '@/lib/journal/uid';

export type SavedViewPatch = Partial<{ name: string; targetPath: string }>;

export class SavedViewRepository {
  constructor(private readonly db: DbInstance) {}

  async find(userId: string, id: string): Promise<SavedView | null> {
    const rows = await this.db
      .select()
      .from(savedView)
      .where(and(eq(savedView.userId, userId), eq(savedView.id, id)))
      .limit(1);
    return rows[0] ?? null;
  }

  async findByName(userId: string, name: string): Promise<SavedView | null> {
    const rows = await this.db
      .select()
      .from(savedView)
      .where(and(eq(savedView.userId, userId), eq(savedView.name, name)))
      .limit(1);
    return rows[0] ?? null;
  }

  async list(userId: string): Promise<SavedView[]> {
    return this.db
      .select()
      .from(savedView)
      .where(eq(savedView.userId, userId))
      .orderBy(sql`lower(${savedView.name})`);
  }

  /** Inserts a new row. Throws on UNIQUE (userId, name) conflict. */
  async create(userId: string, input: SavedViewInput): Promise<SavedView> {
    const rows = await this.db
      .insert(savedView)
      .values({
        id: generateUid(),
        userId,
        name: input.name,
        targetPath: input.targetPath,
      })
      .returning();
    return rows[0];
  }

  /** Returns null if no row matches; throws on UNIQUE rename conflict. */
  async update(
    userId: string,
    id: string,
    patch: SavedViewPatch
  ): Promise<SavedView | null> {
    // updatedAt is bumped by the schema's $onUpdate, so it's left out here.
    const rows = await this.db
      .update(savedView)
      .set(patch)
      .where(and(eq(savedView.userId, userId), eq(savedView.id, id)))
      .returning();
    return rows[0] ?? null;
  }

  async delete(userId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(savedView)
      .where(and(eq(savedView.userId, userId), eq(savedView.id, id)))
      .returning({ id: savedView.id });
    return rows.length > 0;
  }
}
