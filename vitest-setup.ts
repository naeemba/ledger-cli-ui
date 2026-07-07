// Set the env vars that `lib/env` validates at module-load time before any
// test file's imports kick in. Individual tests that need a real journal or
// DB still call `setupTestDb` to overwrite DATA_DIR / DATABASE_URL with a
// tmpdir-scoped value; this file only provides safe defaults so modules
// importing `lib/env` don't throw during test collection.

process.env.BETTER_AUTH_SECRET =
  process.env.BETTER_AUTH_SECRET ?? 'x'.repeat(32);
// PGlite tests use an in-process DB — this placeholder just satisfies the
// Zod URL validator at module-load time; no real Postgres connection is made.
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://localhost/test';
process.env.DATA_DIR = process.env.DATA_DIR ?? '/tmp/ledger-cli-ui-tests';
process.env.BETTER_AUTH_URL =
  process.env.BETTER_AUTH_URL ?? 'http://localhost:3000';
// Magic-link delivery goes through the starter's built-in Postal transport,
// which reads these from process.env; placeholders satisfy the env-schema
// validators without contacting Postal.
process.env.POSTAL_API_URL =
  process.env.POSTAL_API_URL ?? 'https://postal.test';
process.env.POSTAL_API_KEY = process.env.POSTAL_API_KEY ?? 'test-key';
