import { createDbConnection, type DbInstance } from './connection';
import { env } from '@/lib/env';

let instance: DbInstance | undefined;

// Connect lazily on first property access, never at import time, so `next build`
// can evaluate route modules without a database connection being established.
const getDb = (): DbInstance => {
  if (!instance) instance = createDbConnection(env.DATABASE_URL);
  return instance;
};

export const db = new Proxy({} as DbInstance, {
  get: (_target, prop, receiver) =>
    Reflect.get(getDb() as object, prop, receiver),
});

export { createDbConnection } from './connection';
export type { DbInstance } from './connection';
