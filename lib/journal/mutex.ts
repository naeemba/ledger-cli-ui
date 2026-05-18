const tails: Map<string, Promise<unknown>> = new Map();

export const withUserLock = async <T>(
  userId: string,
  fn: () => Promise<T>
): Promise<T> => {
  const prev = tails.get(userId) ?? Promise.resolve();
  const run = prev.then(fn, fn);
  tails.set(
    userId,
    run.catch(() => undefined)
  );
  return run;
};
