import { eq, sql } from 'drizzle-orm';
import {
  userCrypto,
  type ArgonParams,
  type NewUserCrypto,
  type UserCrypto,
} from '@/db/schema';
import type { DbInstance } from '@/lib/db/connection';

export class UserCryptoRepository {
  constructor(private readonly db: DbInstance) {}

  async get(userId: string): Promise<UserCrypto | null> {
    const rows = await this.db
      .select()
      .from(userCrypto)
      .where(eq(userCrypto.userId, userId))
      .limit(1);
    return rows[0] ?? null;
  }

  async exists(userId: string): Promise<boolean> {
    return (await this.get(userId)) !== null;
  }

  async create(input: NewUserCrypto): Promise<void> {
    await this.db.insert(userCrypto).values(input);
  }

  /** True once the bulk journal migration has completed for this user. */
  async hasMigrated(userId: string): Promise<boolean> {
    const row = await this.get(userId);
    return row?.migratedAt != null;
  }

  /** Stamp the row as migrated. Idempotent — re-stamping is a harmless no-op. */
  async markMigrated(userId: string): Promise<void> {
    await this.db
      .update(userCrypto)
      .set({ migratedAt: new Date() })
      .where(eq(userCrypto.userId, userId));
  }

  async updateWrapPassphrase(
    userId: string,
    wrapPassphrase: string,
    passSalt: string,
    argonParams: ArgonParams
  ): Promise<void> {
    await this.db
      .update(userCrypto)
      .set({ wrapPassphrase, passSalt, argonParams })
      .where(eq(userCrypto.userId, userId));
  }

  async updateWrapRecovery(
    userId: string,
    wrapRecovery: string
  ): Promise<void> {
    await this.db
      .update(userCrypto)
      .set({ wrapRecovery, recoveryCreatedAt: sql`now()` })
      .where(eq(userCrypto.userId, userId));
  }

  async delete(userId: string): Promise<void> {
    await this.db.delete(userCrypto).where(eq(userCrypto.userId, userId));
  }
}
