'use server';

import { updateCommoditySchema } from './schema';
import { auditService, auditRequestMeta } from '@/lib/audit';
import { requireUser } from '@/lib/auth/require-user';
import { commodityDefinitionService } from '@/lib/commodities';
import { rateLimit, WRITE, RATE_LIMIT_MESSAGE } from '@/lib/rate-limit';
import { revalidatePath } from 'next/cache';

export async function updateCommodityAction(
  input: unknown
): Promise<{ ok: true } | { ok: false; message: string }> {
  const user = await requireUser();
  if (!rateLimit(WRITE, user.id).allowed) {
    return { ok: false, message: RATE_LIMIT_MESSAGE };
  }
  const parsed = updateCommoditySchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? 'Invalid input',
    };
  }
  const result = await commodityDefinitionService.update(
    user.id,
    parsed.data.symbol,
    'raw' in parsed.data ? { raw: parsed.data.raw } : parsed.data.definition
  );
  await auditService.record(user.id, {
    action: 'commodity.update',
    result: result.ok ? 'success' : 'failure',
    detail: { symbol: parsed.data.symbol },
    ...(await auditRequestMeta()),
  });
  if (result.ok) revalidatePath('/currencies');
  return result;
}
