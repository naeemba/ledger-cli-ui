'use server';

import { auditService, auditRequestMeta } from '@/lib/audit';
import { requireUser } from '@/lib/auth/require-user';
import { priceService } from '@/lib/prices';
import { rateLimit, WRITE, RATE_LIMIT_MESSAGE } from '@/lib/rate-limit';
import { revalidatePath } from 'next/cache';

export type DeleteManualPriceResult =
  { ok: true } | { ok: false; message: string };

export async function deleteManualPriceAction(
  id: number
): Promise<DeleteManualPriceResult> {
  const user = await requireUser();
  if (!rateLimit(WRITE, user.id).allowed) {
    return { ok: false, message: RATE_LIMIT_MESSAGE };
  }

  if (!Number.isInteger(id) || id <= 0) {
    return { ok: false, message: 'Invalid price id' };
  }

  let removed: boolean;
  try {
    removed = await priceService.deleteManualPrice(user.id, id);
  } catch (e) {
    await auditService.record(user.id, {
      action: 'price.delete',
      result: 'failure',
      ...(await auditRequestMeta()),
    });
    return {
      ok: false,
      message: e instanceof Error ? e.message : 'Could not delete price',
    };
  }

  await auditService.record(user.id, {
    action: 'price.delete',
    result: removed ? 'success' : 'failure',
    ...(await auditRequestMeta()),
  });

  if (!removed) {
    return { ok: false, message: 'Price not found' };
  }

  revalidatePath('/prices');
  return { ok: true };
}
