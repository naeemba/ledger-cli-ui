'use server';

import {
  accountDeletionService,
  type IssueResult,
} from '@/lib/account-deletion';
import { requireUser } from '@/lib/auth/require-user';
import { rateLimit, DESTRUCTIVE } from '@/lib/rate-limit';

export const requestAccountDeletionAction = async (): Promise<IssueResult> => {
  const user = await requireUser();
  if (!rateLimit(DESTRUCTIVE, user.id).allowed) {
    return { ok: false, reason: 'throttled' };
  }
  return accountDeletionService.issueCode(user.id, user.email);
};
