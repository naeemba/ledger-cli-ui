'use server';

import { requireUser } from '@/lib/auth/require-user';
import { dashboardWidgetsSchema } from '@/lib/dashboard/widgets';
import { rateLimit, WRITE, RATE_LIMIT_MESSAGE } from '@/lib/rate-limit';
import { userSettingService } from '@/lib/settings';
import { revalidatePath } from 'next/cache';

export type SetDashboardWidgetsResult =
  { ok: true } | { ok: false; message: string };

export const setDashboardWidgetsAction = async (
  value: unknown
): Promise<SetDashboardWidgetsResult> => {
  const user = await requireUser();
  if (!rateLimit(WRITE, user.id).allowed) {
    return { ok: false, message: RATE_LIMIT_MESSAGE };
  }
  const parsed = dashboardWidgetsSchema.safeParse(value);
  if (!parsed.success) {
    return { ok: false, message: 'Invalid widget preferences.' };
  }
  await userSettingService.saveDashboardWidgets(user.id, parsed.data);
  revalidatePath('/', 'layout');
  return { ok: true };
};
