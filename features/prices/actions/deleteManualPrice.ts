'use server';

import { auditService, auditRequestMeta } from '@/lib/audit';
import { requireUser } from '@/lib/auth/require-user';
import { priceService } from '@/lib/prices';
import { rateLimit, WRITE } from '@/lib/rate-limit';
import { revalidatePath } from 'next/cache';

export async function deleteManualPriceAction(
  formData: FormData
): Promise<void> {
  const user = await requireUser();
  if (!rateLimit(WRITE, user.id).allowed) return;

  const raw = formData.get('id');
  const id = typeof raw === 'string' ? Number(raw) : NaN;
  if (!Number.isInteger(id) || id <= 0) return;

  await priceService.deleteManualPrice(user.id, id);
  await auditService.record(user.id, {
    action: 'price.delete',
    result: 'success',
    ...(await auditRequestMeta()),
  });
  revalidatePath('/prices');
}
