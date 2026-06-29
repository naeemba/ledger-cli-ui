import { cache } from 'react';
import 'server-only';
import { userSettingRepository } from './instances';
import { getOptionalUser } from '@/lib/auth/require-user';
import { createLogger } from '@/lib/log';
import {
  DEFAULT_TAB_ORDER,
  parseEntryTabOrder,
  type TabId,
} from '@/lib/transactions/entryTabs';

const log = createLogger('settings');

export const getEntryTabOrder = cache(async (): Promise<TabId[]> => {
  const user = await getOptionalUser();
  if (user) {
    try {
      const row = await userSettingRepository.get(user.id);
      return parseEntryTabOrder(row?.entryTabOrder ?? null);
    } catch (e) {
      // Reading the tab order should never 500 the new/edit page — degrade to
      // the default order just like getBaseCurrency degrades to DEFAULT_CURRENCY.
      log.error({ err: e }, 'failed to read entry tab order');
    }
  }
  return [...DEFAULT_TAB_ORDER];
});
