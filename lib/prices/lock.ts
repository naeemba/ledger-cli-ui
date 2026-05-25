let inflight: Promise<unknown> | null = null;

/**
 * Coalesce concurrent refresh calls. Second caller while one is in flight
 * gets the same promise — one fetch, one set of side effects. The slot
 * clears on settle (success or failure) so the next caller starts fresh.
 */
export const withPriceLock = <T>(fn: () => Promise<T>): Promise<T> => {
  if (inflight) return inflight as Promise<T>;
  const p = fn().finally(() => {
    if (inflight === p) inflight = null;
  });
  inflight = p;
  return p;
};

/** Test-only: clear the in-flight slot between tests. */
export const __resetPriceLockForTests = (): void => {
  inflight = null;
};
