import { promises as fs } from 'fs';
import path from 'path';
import { PGlite } from '@electric-sql/pglite';
import { resolveMigrationsFolder } from '@naeemba/next-starter/db';

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

/**
 * A fresh PGlite database with the REAL migrations applied, so tests exercise
 * the same schema that ships: the package-owned auth track first (creates
 * `user`, which app FKs reference), then the app's own drizzle-kit migrations.
 * No hand-written DDL to drift.
 */
export const createMigratedDatabase = async (): Promise<PGlite> => {
  const client = new PGlite();
  await applyMigrations(client, resolveMigrationsFolder());
  await applyMigrations(client, path.join(process.cwd(), 'db/migrations'));
  return client;
};
