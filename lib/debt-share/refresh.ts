import { safeErrorFields } from './safeError';
import { hasSessionDek } from '@/lib/crypto/sessionKeys';
import { createLogger } from '@/lib/log';

const log = createLogger('debt-share');

/**
 * Rebuild the owner's shared debt pages after a save. Never throws: a broken
 * rebuild must not fail the save that triggered it. Locked (no DEK, e.g. a
 * background job) means nothing to rebuild with, so it returns before touching
 * the database. The service is imported lazily because it reaches back through
 * the journal module, which imports push() — this file's only caller.
 *
 * Only the error name and code are logged: raw errors from ledger carry the
 * person's name and journal lines.
 */
export const refreshDebtShares = async (userId: string): Promise<void> => {
  if (!hasSessionDek(userId)) return;
  try {
    const { debtShareService } = await import('./index');
    await debtShareService.refresh(userId);
  } catch (err) {
    log.error({ ...safeErrorFields(err) }, 'debt share refresh failed');
  }
};
