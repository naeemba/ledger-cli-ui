import { cache } from 'react';
import 'server-only';
import { userSettingRepository } from './instances';
import { getOptionalUser } from '@/lib/auth/require-user';
import {
  normalizeWidgets,
  parseDashboardWidgets,
  type WidgetSetting,
} from '@/lib/dashboard/widgets';
import { createLogger } from '@/lib/log';

const log = createLogger('settings');

export const getDashboardWidgets = cache(async (): Promise<WidgetSetting[]> => {
  const user = await getOptionalUser();
  if (user) {
    try {
      const row = await userSettingRepository.get(user.id);
      return parseDashboardWidgets(row?.dashboardWidgets ?? null);
    } catch (e) {
      // Reading widget preferences should never 500 the dashboard — degrade
      // to the default layout just like getEntryTabOrder does.
      log.error({ err: e }, 'failed to read dashboard widgets');
    }
  }
  return normalizeWidgets(null);
});
