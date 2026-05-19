import { createDbConnection } from './connection';
import { env } from '@/lib/env';

const dbPath = env.DATABASE_URL ?? `${env.DATA_DIR}/db.sqlite`;

export const db = createDbConnection(dbPath);

export { createDbConnection } from './connection';
export type { DbInstance } from './connection';
