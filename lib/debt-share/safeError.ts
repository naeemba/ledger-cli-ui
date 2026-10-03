/**
 * The only parts of an error that are safe to log for a debt share. An
 * execFile failure carries the ledger command line (with the person's name),
 * stderr (quotes journal lines) and a message repeating both, so none of those
 * may reach the logs.
 */
export const safeErrorFields = (
  error: unknown
): { errorName?: string; code?: string | number } => {
  if (typeof error !== 'object' || error === null) return {};
  const { name, code } = error as { name?: unknown; code?: unknown };
  return {
    ...(typeof name === 'string' ? { errorName: name } : {}),
    ...(typeof code === 'string' || typeof code === 'number' ? { code } : {}),
  };
};
