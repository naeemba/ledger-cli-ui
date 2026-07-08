import path from 'path';

export const DEFAULT_MAIN = 'main.ledger';
// Legacy price-db filename. Once owned by the price fetcher, it doubled as a
// hand-edited definitions file for early users — the fetcher then overwrote
// their declarations. Retained only to detect and migrate those legacy files.
export const PRICE_DB_NAME = 'price-db.ledger';
// System-owned file the price fetcher writes and `--price-db` points at. Kept
// separate from any user-authored file so regeneration can never clobber
// hand-maintained content.
export const GENERATED_PRICE_DB_NAME = 'generated-prices.ledger';
// Relocated home for user commodity/account declarations, included by the main
// journal so ledger loads them and the fetcher never touches them.
export const DEFINITIONS_NAME = 'definitions.ledger';
export const VALID_EXTS = ['.ledger', '.dat', '.journal', '.txt'];

// DATA_DIR is read lazily (via process.env) so this module stays free of
// module-load-time env validation. The Zod-validated `env` from `@/lib/env`
// is the source of truth in production; tests set process.env directly.
export const getJournalDir = (userId: string): string =>
  path.join(process.env.DATA_DIR ?? './data', 'journals', userId);

export const getJournalCacheTag = (userId: string): string =>
  `ledger:${userId}`;
