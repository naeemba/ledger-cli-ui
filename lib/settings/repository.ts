import { eq } from 'drizzle-orm';
import { userSetting, type UserSetting } from '@/db/schema/userSetting';
import type { DbInstance } from '@/lib/db/connection';

export class UserSettingRepository {
  constructor(private readonly db: DbInstance) {}

  async get(userId: string): Promise<UserSetting | null> {
    const row = this.db
      .select()
      .from(userSetting)
      .where(eq(userSetting.userId, userId))
      .get();
    return row ?? null;
  }

  async upsertBaseCurrency(userId: string, value: string): Promise<void> {
    this.db
      .insert(userSetting)
      .values({ userId, baseCurrency: value })
      .onConflictDoUpdate({
        target: userSetting.userId,
        set: { baseCurrency: value, updatedAt: new Date() },
      })
      .run();
  }
}
