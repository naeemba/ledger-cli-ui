'use server';

import {
  accountDeletionService,
  type IssueResult,
} from '@/lib/account-deletion';
import { requireUser } from '@/lib/auth/require-user';

export const requestAccountDeletionAction = async (): Promise<IssueResult> => {
  const user = await requireUser();
  return accountDeletionService.issueCode(user.id, user.email);
};
