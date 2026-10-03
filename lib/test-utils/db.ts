import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { inject } from 'vitest';
import { createMigratedDatabase } from './migrations';
import * as schema from '@/db/schema';
import type { DbInstance } from '@/lib/db/connection';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';

export type TestDbContext = {
  client: PGlite;
  db: DbInstance;
  insertUser: (id: string, name?: string, email?: string) => Promise<void>;
  tmpDir: string;
};

// The migrated database snapshot the global setup built, read once per test
// worker. Absent when a test runs without that setup; then each database is
// migrated from scratch.
let templateBlob: Promise<Blob> | null = null;
const migratedTemplate = (): Promise<Blob> | null => {
  const templatePath = inject('migratedDatabaseTemplate');
  if (!templatePath) return null;
  templateBlob ??= fs.readFile(templatePath).then((bytes) => new Blob([bytes]));
  return templateBlob;
};

const openMigratedDatabase = async (): Promise<PGlite> => {
  const template = migratedTemplate();
  if (!template) return createMigratedDatabase();
  const client = new PGlite({ loadDataDir: await template });
  await client.waitReady;
  return client;
};

export const setupTestDb = async (
  prefix = 'ledger-test-'
): Promise<TestDbContext> => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  process.env.DATA_DIR = tmpDir;

  // The real migrations, applied once per run (see createMigratedDatabase).
  const client = await openMigratedDatabase();
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
