import Database from 'better-sqlite3';
import { and, eq, sql } from 'drizzle-orm';
import type { TemplateInput } from './schema';
import * as schema from '@/db/schema';
import { template, type Template } from '@/db/schema/template';
import { generateUid } from '@/lib/journal/uid';
import { drizzle } from 'drizzle-orm/better-sqlite3';

/** Returns a fresh drizzle instance bound to the current DATABASE_URL. */
const getDb = () => {
  const dbPath =
    process.env.DATABASE_URL ?? `${process.env.DATA_DIR}/db.sqlite`;
  const sqlite = new Database(dbPath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  return drizzle(sqlite, { schema });
};

export type SaveResult =
  | { ok: true; template: Template }
  | { ok: false; reason: 'name-conflict' };

export type RenameResult =
  | { ok: true }
  | { ok: false; reason: 'name-conflict' | 'not-found' };

export const listTemplates = async (userId: string): Promise<Template[]> =>
  getDb()
    .select()
    .from(template)
    .where(eq(template.userId, userId))
    .orderBy(sql`lower(${template.name})`)
    .all();

export const getTemplate = async (
  userId: string,
  id: string
): Promise<Template | null> => {
  const row = getDb()
    .select()
    .from(template)
    .where(and(eq(template.userId, userId), eq(template.id, id)))
    .get();
  return row ?? null;
};

const findByName = (userId: string, name: string): Template | null =>
  getDb()
    .select()
    .from(template)
    .where(and(eq(template.userId, userId), eq(template.name, name)))
    .get() ?? null;

export const saveTemplate = async (
  userId: string,
  input: TemplateInput,
  opts: { overwrite?: boolean } = {}
): Promise<SaveResult> => {
  const db = getDb();
  const existing = findByName(userId, input.name);
  if (existing) {
    if (!opts.overwrite) return { ok: false, reason: 'name-conflict' };
    const updated = db
      .update(template)
      .set({ draft: input.draft, updatedAt: new Date() })
      .where(and(eq(template.userId, userId), eq(template.id, existing.id)))
      .returning()
      .get();
    return { ok: true, template: updated };
  }
  try {
    const inserted = db
      .insert(template)
      .values({
        id: generateUid(),
        userId,
        name: input.name,
        draft: input.draft,
      })
      .returning()
      .get();
    return { ok: true, template: inserted };
  } catch (e) {
    if (e instanceof Error && /UNIQUE constraint failed/i.test(e.message)) {
      return { ok: false, reason: 'name-conflict' };
    }
    throw e;
  }
};

export const renameTemplate = async (
  userId: string,
  id: string,
  name: string
): Promise<RenameResult> => {
  const db = getDb();
  const owned = db
    .select({ id: template.id })
    .from(template)
    .where(and(eq(template.userId, userId), eq(template.id, id)))
    .get();
  if (!owned) return { ok: false, reason: 'not-found' };
  try {
    db.update(template)
      .set({ name, updatedAt: new Date() })
      .where(and(eq(template.userId, userId), eq(template.id, id)))
      .run();
    return { ok: true };
  } catch (e) {
    if (e instanceof Error && /UNIQUE constraint failed/i.test(e.message)) {
      return { ok: false, reason: 'name-conflict' };
    }
    throw e;
  }
};

export const deleteTemplate = async (
  userId: string,
  id: string
): Promise<void> => {
  getDb()
    .delete(template)
    .where(and(eq(template.userId, userId), eq(template.id, id)))
    .run();
};
