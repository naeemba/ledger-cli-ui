/**
 * Map over `items` running at most `limit` async tasks at once, preserving
 * input order in the result. Use instead of `Promise.all(items.map(...))` when
 * each task holds a scarce resource — e.g. shelling out to a subprocess — so a
 * large input cannot spawn an unbounded number of them simultaneously.
 */
export const mapWithConcurrency = async <T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T, index: number) => Promise<R>
): Promise<R[]> => {
  const results = new Array<R>(items.length);
  let next = 0;
  const workerCount = Math.max(1, Math.min(limit, items.length));
  const workers = Array.from({ length: workerCount }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await task(items[index]!, index);
    }
  });
  await Promise.all(workers);
  return results;
};
