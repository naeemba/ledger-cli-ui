import { cache } from 'react';
import { promises as fs } from 'fs';
import path from 'path';
import { eq, sql } from 'drizzle-orm';
import { DEFAULT_MAIN, PRICE_DB_NAME, getJournalDir } from './layout';
import { parseJournal, type ParsedJournal, type Transaction } from './parser';
import { userSetting } from '@/db/schema';
import type { DbInstance } from '@/lib/db/connection';
import { pullLocked, manifestRelName } from '@/lib/storage';

/**
 * Request-scoped dedup of the read-path pull. A single render fires ~8
 * concurrent reads (7× runLedger + recent-tx/stats), each of which needs the
 * canonical journal pulled into the local cache. Without this, the read-path
 * lock serializes them into N back-to-back ListObjectsV2 round-trips that all
 * return identical data. React's `cache()` coalesces same-userId callers in one
 * request to a single pull. Keyed by userId so distinct users don't collide.
 */
const cachedPull = cache(
  (userId: string): Promise<{ fingerprint: string }> => pullLocked(userId)
);

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

  /** Updates the user's journalMain pointer, creating the setting row if needed. */
  async setMainFile(userId: string, mainFile: string): Promise<void> {
    await this.db
      .insert(userSetting)
      .values({ userId, journalMain: mainFile })
      .onConflictDoUpdate({
        target: userSetting.userId,
        // sql`now()` (DB clock) to match the createdAt/updatedAt convention.
        set: { journalMain: mainFile, updatedAt: sql`now()` },
      });
  }

  /** Removes the user's journal files locally but PRESERVES the storage manifest
   * (.manifest.json), so a subsequent push can diff against canonical and replace
   * it atomically (upload new + delete orphans) without first wiping canonical. */
  async resetLocalJournal(userId: string): Promise<void> {
    const dir = getJournalDir(userId);
    await fs.mkdir(dir, { recursive: true });
    const entries = await fs
      .readdir(dir, { withFileTypes: true })
      .catch(() => []);
    await Promise.all(
      entries
        .filter((e) => e.name !== manifestRelName)
        .map((e) =>
          fs.rm(path.join(dir, e.name), { recursive: true, force: true })
        )
    );
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

  /** Pulls the canonical journal into the local cache and returns the content
   * fingerprint. Used as the query cache-key input so any change (local or in
   * Garage) invalidates `unstable_cache`. Also guarantees the local stub exists. */
  async getFingerprint(userId: string): Promise<string> {
    const { fingerprint } = await cachedPull(userId);
    await this.ensureLayout(userId);
    return fingerprint;
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
