'use server';

import { requireUser } from '@/lib/auth/require-user';
import { priceService, type RefreshResult } from '@/lib/prices';

export const refreshPricesAction = async (): Promise<RefreshResult> => {
  const user = await requireUser();
  const result = await priceService.refreshAll();
  // refreshAll already regenerates every user's file; this call ensures the
  // caller's file is fresh even if their `userId` happened to be enumerated
  // before another user that pushed their file into a transient bad state.
  await priceService.regenerateUserPriceDb(user.id);
  return result;
};
