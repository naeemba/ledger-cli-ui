import path from 'path';

export const DEFAULT_MAIN = 'main.ledger';
export const PRICE_DB_NAME = 'price-db.ledger';
export const VALID_EXTS = ['.ledger', '.dat', '.journal', '.txt'];

// DATA_DIR is read lazily (via process.env) so this module stays free of
// module-load-time env validation. The Zod-validated `env` from `@/lib/env`
// is the source of truth in production; tests set process.env directly.
export const getJournalDir = (userId: string): string =>
  path.join(process.env.DATA_DIR ?? './data', 'journals', userId);

export const getJournalCacheTag = (userId: string): string =>
  `ledger:${userId}`;
