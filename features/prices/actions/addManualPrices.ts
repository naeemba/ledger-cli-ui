'use server';

import type { PriceActionState } from './types';
import { auditService, auditRequestMeta } from '@/lib/audit';
import { requireUser } from '@/lib/auth/require-user';
import { priceService } from '@/lib/prices';
import { manualPriceDraftSchema } from '@/lib/prices/manualSchema';
import { rateLimit, WRITE, RATE_LIMIT_MESSAGE } from '@/lib/rate-limit';
import { revalidatePath } from 'next/cache';

export async function addManualPricesAction(
  _prev: PriceActionState | null,
  formData: FormData
): Promise<PriceActionState> {
  const user = await requireUser();
  if (!rateLimit(WRITE, user.id).allowed) {
    return { ok: false, formError: RATE_LIMIT_MESSAGE };
  }

  const draftJson = formData.get('draft');
  if (typeof draftJson !== 'string') {
    return { ok: false, formError: 'Missing price payload' };
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(draftJson);
  } catch {
    return { ok: false, formError: 'Price payload is not valid JSON' };
  }

  const parsed = manualPriceDraftSchema.safeParse(parsedJson);
  if (!parsed.success) {
    return { ok: false, formError: 'Please fix the highlighted fields' };
  }

  const result = await priceService.addManualPrices(user.id, parsed.data);
  await auditService.record(user.id, {
    action: 'price.add',
    result: result.ok ? 'success' : 'failure',
    detail: result.ok ? { count: parsed.data.rows.length } : undefined,
    ...(await auditRequestMeta()),
  });
  if (!result.ok) return { ok: false, formError: result.formError };

  revalidatePath('/prices');
  return { ok: true };
}
