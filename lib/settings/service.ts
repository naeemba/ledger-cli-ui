import type { UserSettingRepository } from './repository';
import type { UserSetting } from '@/db/schema/userSetting';
import {
  serializeDashboardWidgets,
  type WidgetSetting,
} from '@/lib/dashboard/widgets';
import {
  serializeEntryTabOrder,
  type TabId,
} from '@/lib/transactions/entryTabs';

export class UserSettingService {
  constructor(private readonly repo: UserSettingRepository) {}

  async get(userId: string): Promise<UserSetting | null> {
    return this.repo.get(userId);
  }

  async saveBaseCurrency(userId: string, value: string): Promise<void> {
    await this.repo.upsertBaseCurrency(userId, value);
  }

  async saveEntryTabOrder(userId: string, order: TabId[]): Promise<void> {
    await this.repo.upsertEntryTabOrder(userId, serializeEntryTabOrder(order));
  }

  async saveDashboardWidgets(
    userId: string,
    widgets: WidgetSetting[]
  ): Promise<void> {
    await this.repo.upsertDashboardWidgets(
      userId,
      serializeDashboardWidgets(widgets)
    );
  }
}
