'use server';

import { requireUser } from '@/lib/auth/require-user';
import { priceService, type RefreshResult } from '@/lib/prices';

export const refreshPricesAction = async (): Promise<RefreshResult> => {
  const user = await requireUser();
  const result = await priceService.refreshAll();
  // Only re-project to the caller's file on a successful or partial run.
  // On 'failed', refreshAll deliberately preserves the last-good file.
  if (result.status !== 'failed') {
    await priceService.regenerateUserPriceDb(user.id);
  }
  return result;
};
