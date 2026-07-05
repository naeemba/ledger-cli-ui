'use server';

import type { UpsertMappingResult } from './types';
import { auditService, auditRequestMeta } from '@/lib/audit';
import { requireUser } from '@/lib/auth/require-user';
import { commodityMappingRepository } from '@/lib/prices';
import { normalizeCommoditySymbol } from '@/lib/prices/symbols';
import { rateLimit, WRITE, RATE_LIMIT_MESSAGE } from '@/lib/rate-limit';
import { revalidatePath } from 'next/cache';

export async function upsertMappingAction(input: {
  symbol: string;
  kind: 'crypto' | 'fiat' | 'manual';
  providerId: string | null;
}): Promise<UpsertMappingResult> {
  const user = await requireUser();
  if (!rateLimit(WRITE, user.id).allowed) {
    return { ok: false, message: RATE_LIMIT_MESSAGE };
  }

  const symbol = normalizeCommoditySymbol(input.symbol);
  if (!symbol) return { ok: false, message: 'Invalid commodity symbol' };
  if ((input.kind === 'crypto' || input.kind === 'fiat') && !input.providerId) {
    return {
      ok: false,
      message: 'A crypto or fiat mapping needs a provider id',
    };
  }

  await commodityMappingRepository.upsert({
    userId: user.id,
    symbol,
    kind: input.kind,
    providerId: input.kind === 'manual' ? null : input.providerId,
    source: 'user',
  });
  await auditService.record(user.id, {
    action: 'price.map',
    result: 'success',
    detail: { symbol, kind: input.kind },
    ...(await auditRequestMeta()),
  });
  revalidatePath('/currencies');
  return { ok: true };
}
