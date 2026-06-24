import { eq, sql } from 'drizzle-orm';
import {
  accountDeletionChallenge,
  type AccountDeletionChallenge,
} from '@/db/schema/accountDeletionChallenge';
import type { DbInstance } from '@/lib/db/connection';

export class AccountDeletionChallengeRepository {
  constructor(private readonly db: DbInstance) {}

  async upsert(
    userId: string,
    codeHash: string,
    expiresAt: Date
  ): Promise<void> {
    await this.db
      .insert(accountDeletionChallenge)
      .values({ userId, codeHash, expiresAt, attempts: 0 })
      .onConflictDoUpdate({
        target: accountDeletionChallenge.userId,
        set: { codeHash, expiresAt, attempts: 0, createdAt: sql`now()` },
      });
  }

  async get(userId: string): Promise<AccountDeletionChallenge | null> {
    const rows = await this.db
      .select()
      .from(accountDeletionChallenge)
      .where(eq(accountDeletionChallenge.userId, userId))
      .limit(1);
    return rows[0] ?? null;
  }

  async incrementAttempts(userId: string): Promise<number> {
    const rows = await this.db
      .update(accountDeletionChallenge)
      .set({ attempts: sql`${accountDeletionChallenge.attempts} + 1` })
      .where(eq(accountDeletionChallenge.userId, userId))
      .returning({ attempts: accountDeletionChallenge.attempts });
    return rows[0]?.attempts ?? 0;
  }

  async delete(userId: string): Promise<void> {
    await this.db
      .delete(accountDeletionChallenge)
      .where(eq(accountDeletionChallenge.userId, userId));
  }
}
