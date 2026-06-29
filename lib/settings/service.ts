import type { UserSettingRepository } from './repository';
import type { UserSetting } from '@/db/schema/userSetting';
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
}
