// Re-export the package's lazy `db` proxy: it connects on first query (reading
// process.env.DATABASE_URL, never at import) so `next build` stays DB-free, and
// it applies the package's env-driven pool tuning (DATABASE_PREPARE / POOL_MAX /
// IDLE_TIMEOUT) via createDbOptionsFromEnv. Re-exporting it — rather than
// hand-rolling a second postgres()+drizzle() — means the app and package share
// one bootstrap that can't drift.
export { db } from '@naeemba/next-starter/db';
export { createDbConnection } from './connection';
export type { DbInstance } from './connection';
