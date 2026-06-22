import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
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

// Minimal stand-in for the package-owned auth `user` table plus the app tables.
// Postgres DDL mirrors db/schema and @naeemba/next-starter/schema closely enough
// for repository tests (FKs, uniqueness, defaults).
const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS "user" (
    "id" text PRIMARY KEY NOT NULL,
    "name" text NOT NULL DEFAULT '',
    "email" text NOT NULL UNIQUE,
    "emailVerified" boolean NOT NULL DEFAULT false,
    "image" text,
    "createdAt" timestamp NOT NULL DEFAULT now(),
    "updatedAt" timestamp NOT NULL DEFAULT now()
  );
  CREATE TABLE IF NOT EXISTS "userSetting" (
    "userId" text PRIMARY KEY NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
    "baseCurrency" text,
    "journalMain" text NOT NULL DEFAULT 'main.ledger',
    "updatedAt" timestamp NOT NULL DEFAULT now()
  );
  CREATE TABLE IF NOT EXISTS "template" (
    "id" text PRIMARY KEY NOT NULL,
    "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
    "name" text NOT NULL,
    "draft" jsonb NOT NULL,
    "createdAt" timestamp NOT NULL DEFAULT now(),
    "updatedAt" timestamp NOT NULL DEFAULT now()
  );
  CREATE UNIQUE INDEX IF NOT EXISTS "template_user_name" ON "template"("userId","name");
  CREATE TABLE IF NOT EXISTS "savedView" (
    "id" text PRIMARY KEY NOT NULL,
    "userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
    "name" text NOT NULL,
    "targetPath" text NOT NULL,
    "createdAt" timestamp NOT NULL DEFAULT now(),
    "updatedAt" timestamp NOT NULL DEFAULT now()
  );
  CREATE UNIQUE INDEX IF NOT EXISTS "savedView_user_name" ON "savedView"("userId","name");
  CREATE TABLE IF NOT EXISTS "commodity_price" (
    "id" serial PRIMARY KEY,
    "symbol" text NOT NULL,
    "quote" text NOT NULL,
    "price" real NOT NULL,
    "fetched_at" timestamp NOT NULL,
    "fetched_date" text NOT NULL,
    CONSTRAINT "commodity_price_unique_per_day" UNIQUE ("symbol","quote","fetched_date")
  );
  CREATE TABLE IF NOT EXISTS "price_fetch_run" (
    "id" serial PRIMARY KEY,
    "started_at" timestamp NOT NULL,
    "completed_at" timestamp,
    "status" text NOT NULL,
    "symbols_fetched" integer NOT NULL DEFAULT 0,
    "symbols_failed" integer NOT NULL DEFAULT 0,
    "error_message" text
  );
`;

export const setupTestDb = async (
  prefix = 'ledger-test-'
): Promise<TestDbContext> => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  process.env.DATA_DIR = tmpDir;

  const client = new PGlite();
  await client.exec(SCHEMA_SQL);
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
