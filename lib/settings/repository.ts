import { eq } from 'drizzle-orm';
import { userSetting, type UserSetting } from '@/db/schema/userSetting';
import type { DbInstance } from '@/lib/db/connection';

export class UserSettingRepository {
  constructor(private readonly db: DbInstance) {}

  async get(userId: string): Promise<UserSetting | null> {
    const rows = await this.db
      .select()
      .from(userSetting)
      .where(eq(userSetting.userId, userId))
      .limit(1);
    return rows[0] ?? null;
  }

  async upsertBaseCurrency(userId: string, value: string): Promise<void> {
    await this.db
      .insert(userSetting)
      .values({ userId, baseCurrency: value })
      .onConflictDoUpdate({
        target: userSetting.userId,
        set: { baseCurrency: value, updatedAt: new Date() },
      });
  }
}
