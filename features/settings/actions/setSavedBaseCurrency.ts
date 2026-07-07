'use server';

import { requireUser } from '@/lib/auth/require-user';
import { rateLimit, WRITE, RATE_LIMIT_MESSAGE } from '@/lib/rate-limit';
import { baseCurrencySchema, userSettingService } from '@/lib/settings';
import { revalidatePath } from 'next/cache';

export type SetSavedBaseCurrencyResult =
  { ok: true } | { ok: false; message: string };

export const setSavedBaseCurrencyAction = async (
  value: unknown
): Promise<SetSavedBaseCurrencyResult> => {
  const user = await requireUser();
  if (!rateLimit(WRITE, user.id).allowed) {
    return { ok: false, message: RATE_LIMIT_MESSAGE };
  }
  const parsed = baseCurrencySchema.safeParse(value);
  if (!parsed.success) {
    return { ok: false, message: 'Invalid currency code.' };
  }
  await userSettingService.saveBaseCurrency(user.id, parsed.data);
  revalidatePath('/', 'layout');
  return { ok: true };
};
