import postgres from 'postgres';
import * as schema from '@/db/schema';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';

export type DbInstance = PostgresJsDatabase<typeof schema>;

export const createDbConnection = (url: string): DbInstance => {
  // postgres.js connects lazily on first query, so constructing the client here
  // opens no socket — safe to call without a reachable database (e.g. at build).
  const client = postgres(url);
  return drizzle(client, { schema });
};
