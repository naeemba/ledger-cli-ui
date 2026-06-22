/**
 * True when `e` is a UNIQUE-constraint violation from the Postgres/PGlite
 * driver. drizzle-orm wraps every driver error in a `DrizzleQueryError`, so the
 * original `PostgresError` (code `23505` / "duplicate key value") sits on
 * `.cause` — both in production (postgres.js) and in tests (PGlite).
 */
export const isUniqueConflict = (e: unknown): boolean => {
  if (!(e instanceof Error)) return false;
  const cause = (e as { cause?: unknown }).cause;
  if (cause instanceof Error && /duplicate key value/i.test(cause.message))
    return true;
  return (
    cause != null &&
    typeof cause === 'object' &&
    (cause as { code?: string }).code === '23505'
  );
};
