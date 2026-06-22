import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import * as schema from '@/db/schema';
import type { DbInstance } from '@/lib/db/connection';
import { PGlite } from '@electric-sql/pglite';
import { resolveMigrationsFolder } from '@naeemba/next-starter/db';
import { drizzle } from 'drizzle-orm/pglite';

export type TestDbContext = {
  client: PGlite;
  db: DbInstance;
  insertUser: (id: string, name?: string, email?: string) => Promise<void>;
  tmpDir: string;
};

// Apply every `.sql` file in a drizzle migrations folder to the PGlite client,
// in filename order, splitting on drizzle's statement-breakpoint markers.
const applyMigrations = async (
  client: PGlite,
  folder: string
): Promise<void> => {
  const files = (await fs.readdir(folder))
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const file of files) {
    const sql = await fs.readFile(path.join(folder, file), 'utf-8');
    for (const statement of sql.split('--> statement-breakpoint')) {
      const trimmed = statement.trim();
      if (trimmed) await client.exec(trimmed);
    }
  }
};

export const setupTestDb = async (
  prefix = 'ledger-test-'
): Promise<TestDbContext> => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  process.env.DATA_DIR = tmpDir;

  const client = new PGlite();
  // Run the REAL migrations so tests exercise the same schema that ships: the
  // package-owned auth track first (creates `user`, which app FKs reference),
  // then the app's own drizzle-kit migrations. No hand-written DDL to drift.
  await applyMigrations(client, resolveMigrationsFolder());
  await applyMigrations(client, path.join(process.cwd(), 'db/migrations'));
  const db = drizzle(client, { schema }) as unknown as DbInstance;

  process.env.BETTER_AUTH_SECRET = 'x'.repeat(32);
  process.env.PRICE_REFRESH_ENABLED = 'false';

  const insertUser = async (
    id: string,
    name = id,
    email = `${id}@example.com`
  ): Promise<void> => {
    await client.query(
      `INSERT INTO "user" ("id","name","email") VALUES ($1,$2,$3)`,
      [id, name, email]
    );
  };

  return { client, db, insertUser, tmpDir };
};

export const teardownTestDb = async (ctx: TestDbContext): Promise<void> => {
  await ctx.client.close();
  await fs.rm(ctx.tmpDir, { recursive: true, force: true });
};
