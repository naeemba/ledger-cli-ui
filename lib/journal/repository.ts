import { promises as fs } from 'fs';
import path from 'path';
import { eq } from 'drizzle-orm';
import { DEFAULT_MAIN, PRICE_DB_NAME, getJournalDir } from './layout';
import {
  parseJournal,
  resolveIncludes,
  type ParsedJournal,
  type Transaction,
} from './parser';
import { userSetting } from '@/db/schema';
import type { DbInstance } from '@/lib/db/connection';

export type JournalLayout = {
  dir: string;
  mainFile: string;
  mainPath: string;
  priceDbPath: string | null;
};

/**
 * File-level CRUD over the user's journal. No business logic, no validation,
 * no cache invalidation — those live in JournalService. Construct with a
 * DbInstance so tests can inject a fresh connection.
 */
export class JournalRepository {
  constructor(private readonly db: DbInstance) {}

  /** Resolves journal layout from the user row + filesystem. */
  async getLayout(userId: string): Promise<JournalLayout> {
    const rows = await this.db
      .select({ journalMain: userSetting.journalMain })
      .from(userSetting)
      .where(eq(userSetting.userId, userId))
      .limit(1);
    const mainFile = rows[0]?.journalMain ?? DEFAULT_MAIN;
    const dir = getJournalDir(userId);
    return {
      dir,
      mainFile,
      mainPath: path.join(dir, mainFile),
      priceDbPath: await this.findPriceDb(dir),
    };
  }

  /** Ensures the journal directory exists and the main file is at least a stub. */
  async ensureLayout(userId: string): Promise<JournalLayout> {
    const layout = await this.getLayout(userId);
    await fs.mkdir(layout.dir, { recursive: true });
    try {
      await fs.access(layout.mainPath);
    } catch {
      const stub = `; Ledger journal for user ${userId}\n; Created ${new Date().toISOString()}\n`;
      await fs.writeFile(layout.mainPath, stub, 'utf-8');
    }
    return layout;
  }

  /** Updates the user's journalMain pointer. */
  async setMainFile(userId: string, mainFile: string): Promise<void> {
    await this.db
      .update(userSetting)
      .set({ journalMain: mainFile })
      .where(eq(userSetting.userId, userId));
  }

  /** Wipes the journal directory and recreates it empty. Used by the import flow. */
  async emptyJournalDir(userId: string): Promise<void> {
    const dir = getJournalDir(userId);
    try {
      await fs.rm(dir, { recursive: true, force: true });
    } catch {
      // ignore
    }
    await fs.mkdir(dir, { recursive: true });
  }

  /** Reads a file by absolute path. */
  async readFile(absPath: string): Promise<string> {
    return fs.readFile(absPath, 'utf-8');
  }

  /** Atomic write via tmpfile + rename on the same filesystem. */
  async writeFileAtomic(absPath: string, content: string): Promise<void> {
    const tmp = absPath + '.tmp';
    await fs.writeFile(tmp, content, 'utf-8');
    await fs.rename(tmp, absPath);
  }

  /** Append-only write (atomic for sub-PIPE_BUF payloads). */
  async appendFile(absPath: string, content: string): Promise<void> {
    await fs.appendFile(absPath, content, 'utf-8');
  }

  /** Lists all transactions reachable from the user's main file. */
  async list(userId: string): Promise<ParsedJournal> {
    const { mainPath } = await this.getLayout(userId);
    return parseJournal(mainPath);
  }

  /** Finds a single transaction by UID across the user's journal. */
  async find(userId: string, uid: string): Promise<Transaction | null> {
    const { transactions } = await this.list(userId);
    return transactions.find((t) => t.uid === uid) ?? null;
  }

  /** Returns max mtimeMs across the user's include graph. Used as a cache-key
   * input so any file change (internal or external) invalidates `unstable_cache`. */
  async getMaxMtime(userId: string): Promise<number> {
    const { mainPath } = await this.ensureLayout(userId);
    const files = await resolveIncludes(mainPath);
    if (files.length === 0) return 0;
    const stats = await Promise.all(files.map((f) => fs.stat(f)));
    return Math.max(...stats.map((s) => s.mtimeMs));
  }

  private async findPriceDb(dir: string): Promise<string | null> {
    const candidate = path.join(dir, PRICE_DB_NAME);
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      return null;
    }
  }
}
