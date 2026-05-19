import { and, eq, sql } from 'drizzle-orm';
import type { TemplateDraft, TemplateInput } from './schema';
import { template, type Template } from '@/db/schema/template';
import type { DbInstance } from '@/lib/db/connection';
import { generateUid } from '@/lib/journal/uid';

export type TemplateUpdate = Partial<{ name: string; draft: TemplateDraft }>;

export class TemplateRepository {
  constructor(private readonly db: DbInstance) {}

  async find(userId: string, id: string): Promise<Template | null> {
    const row = this.db
      .select()
      .from(template)
      .where(and(eq(template.userId, userId), eq(template.id, id)))
      .get();
    return row ?? null;
  }

  async findByName(userId: string, name: string): Promise<Template | null> {
    const row = this.db
      .select()
      .from(template)
      .where(and(eq(template.userId, userId), eq(template.name, name)))
      .get();
    return row ?? null;
  }

  async list(userId: string): Promise<Template[]> {
    return this.db
      .select()
      .from(template)
      .where(eq(template.userId, userId))
      .orderBy(sql`lower(${template.name})`)
      .all();
  }

  /** Inserts a new row. Throws on UNIQUE constraint violation. */
  async save(userId: string, input: TemplateInput): Promise<Template> {
    return this.db
      .insert(template)
      .values({
        id: generateUid(),
        userId,
        name: input.name,
        draft: input.draft,
      })
      .returning()
      .get();
  }

  /** Updates name and/or draft. Returns null if no row matches. Throws on UNIQUE violation. */
  async update(
    userId: string,
    id: string,
    patch: TemplateUpdate
  ): Promise<Template | null> {
    const updates: { name?: string; draft?: TemplateDraft; updatedAt: Date } = {
      updatedAt: new Date(),
    };
    if (patch.name !== undefined) updates.name = patch.name;
    if (patch.draft !== undefined) updates.draft = patch.draft;
    const row = this.db
      .update(template)
      .set(updates)
      .where(and(eq(template.userId, userId), eq(template.id, id)))
      .returning()
      .get();
    return row ?? null;
  }

  async delete(userId: string, id: string): Promise<void> {
    this.db
      .delete(template)
      .where(and(eq(template.userId, userId), eq(template.id, id)))
      .run();
  }
}
