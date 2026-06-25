import { eq, sql } from 'drizzle-orm';
import {
  encryptionResetChallenge,
  type EncryptionResetChallenge,
} from '@/db/schema/encryptionResetChallenge';
import type { DbInstance } from '@/lib/db/connection';

export class EncryptionResetChallengeRepository {
  constructor(private readonly db: DbInstance) {}

  async upsert(
    userId: string,
    codeHash: string,
    expiresAt: Date,
    createdAt?: Date
  ): Promise<void> {
    const insertValues = {
      userId,
      codeHash,
      expiresAt,
      attempts: 0,
      ...(createdAt && { createdAt }),
    };

    const updateSet = {
      codeHash,
      expiresAt,
      attempts: 0,
      ...(createdAt && { createdAt }),
    };

    await this.db
      .insert(encryptionResetChallenge)
      .values(insertValues)
      .onConflictDoUpdate({
        target: encryptionResetChallenge.userId,
        set: updateSet,
      });
  }

  async get(userId: string): Promise<EncryptionResetChallenge | null> {
    const rows = await this.db
      .select()
      .from(encryptionResetChallenge)
      .where(eq(encryptionResetChallenge.userId, userId))
      .limit(1);
    return rows[0] ?? null;
  }

  async incrementAttempts(userId: string): Promise<number> {
    const rows = await this.db
      .update(encryptionResetChallenge)
      .set({ attempts: sql`${encryptionResetChallenge.attempts} + 1` })
      .where(eq(encryptionResetChallenge.userId, userId))
      .returning({ attempts: encryptionResetChallenge.attempts });
    return rows[0]?.attempts ?? 0;
  }

  async delete(userId: string): Promise<void> {
    await this.db
      .delete(encryptionResetChallenge)
      .where(eq(encryptionResetChallenge.userId, userId));
  }
}
