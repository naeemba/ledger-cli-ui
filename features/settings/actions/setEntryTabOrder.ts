'use server';

import { requireUser } from '@/lib/auth/require-user';
import { rateLimit, WRITE, RATE_LIMIT_MESSAGE } from '@/lib/rate-limit';
import { userSettingService } from '@/lib/settings';
import { entryTabOrderSchema } from '@/lib/transactions/entryTabs';
import { revalidatePath } from 'next/cache';

export type SetEntryTabOrderResult =
  | { ok: true }
  | { ok: false; message: string };

export const setEntryTabOrderAction = async (
  value: unknown
): Promise<SetEntryTabOrderResult> => {
  const user = await requireUser();
  if (!rateLimit(WRITE, user.id).allowed) {
    return { ok: false, message: RATE_LIMIT_MESSAGE };
  }
  const parsed = entryTabOrderSchema.safeParse(value);
  if (!parsed.success) {
    return { ok: false, message: 'Invalid tab order.' };
  }
  await userSettingService.saveEntryTabOrder(user.id, parsed.data);
  revalidatePath('/', 'layout');
  return { ok: true };
};
