import { createDb } from '@naeemba/next-starter/db';

// DbInstance is the package's drizzle handle. Repositories take it as a
// constructor arg so tests can inject a PGlite-backed instance. Deriving the
// type (and the factory) from the package keeps the app from carrying a second
// postgres.js + drizzle bootstrap that could drift from the package's.
export type DbInstance = ReturnType<typeof createDb>;

export { createDb as createDbConnection } from '@naeemba/next-starter/db';
