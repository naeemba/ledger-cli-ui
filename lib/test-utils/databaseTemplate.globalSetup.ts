import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { createMigratedDatabase } from './migrations';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
  export interface ProvidedContext {
    migratedDatabaseTemplate: string;
  }
}

/**
 * Build the migrated test database once per run and save it as a data-dir
 * snapshot. Every `setupTestDb` then starts from a copy of it instead of
 * booting an empty Postgres and replaying every migration — that replay,
 * repeated for each of several hundred tests, was most of the suite's time.
 */
export default async function setup(project: TestProject) {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'ledger-db-template-')
  );
  const templatePath = path.join(directory, 'migrated.tar');
  const client = await createMigratedDatabase();
  const snapshot = await client.dumpDataDir('none');
  await client.close();
  await fs.writeFile(templatePath, Buffer.from(await snapshot.arrayBuffer()));
  project.provide('migratedDatabaseTemplate', templatePath);
  return async () => {
    await fs.rm(directory, { recursive: true, force: true });
  };
}
