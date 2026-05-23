// Set the env vars that `lib/env` validates at module-load time before any
// test file's imports kick in. Individual tests that need a real journal or
// DB still call `setupTestDb` to overwrite DATA_DIR / DATABASE_URL with a
// tmpdir-scoped value; this file only provides safe defaults so modules
// importing `lib/env` don't throw during test collection.

process.env.BETTER_AUTH_SECRET =
  process.env.BETTER_AUTH_SECRET ?? 'x'.repeat(32);
process.env.DATABASE_URL = process.env.DATABASE_URL ?? ':memory:';
process.env.DATA_DIR = process.env.DATA_DIR ?? '/tmp/ledger-cli-ui-tests';
