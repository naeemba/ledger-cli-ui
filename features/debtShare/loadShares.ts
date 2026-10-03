import { debtShareService } from '@/lib/debt-share';
import type { PersonShareLink, ShareLink } from '@/lib/debt-share';
import { safeErrorFields } from '@/lib/debt-share/safeError';
import { createLogger } from '@/lib/log';
import { unstable_rethrow } from 'next/navigation';

const log = createLogger('debt-share');

/** The person's share link, or null. A failure must never break the debts page. */
export const loadShareLink = async (
  userId: string,
  person: string
): Promise<ShareLink | null> => {
  try {
    return await debtShareService.linkFor(userId, person);
  } catch (error) {
    unstable_rethrow(error);
    log.error({ ...safeErrorFields(error) }, 'failed to load debt share link');
    return null;
  }
};

/** Every share the owner holds, or none if the lookup fails. */
export const loadSharedLinks = async (
  userId: string
): Promise<PersonShareLink[]> => {
  try {
    return await debtShareService.sharedLinks(userId);
  } catch (error) {
    unstable_rethrow(error);
    log.error({ ...safeErrorFields(error) }, 'failed to load shared links');
    return [];
  }
};
