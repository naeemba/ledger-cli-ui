'use server';

import { requireUser } from '@/lib/auth/require-user';
import { commodityDefinitionService } from '@/lib/commodities';
import type { CommodityRow } from '@/lib/commodities';
import { rateLimit, READ } from '@/lib/rate-limit';

export async function listCommoditiesAction(): Promise<CommodityRow[]> {
  const user = await requireUser();
  if (!rateLimit(READ, user.id).allowed) {
    return [];
  }
  return commodityDefinitionService.list(user.id);
}
