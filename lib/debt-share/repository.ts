import { and, eq } from 'drizzle-orm';
import { debtShare, type DebtShare, type NewDebtShare } from '@/db/schema';
import type { DbInstance } from '@/lib/db/connection';

export class DebtShareRepository {
  constructor(private readonly db: DbInstance) {}

  async listByUser(userId: string): Promise<DebtShare[]> {
    return this.db.select().from(debtShare).where(eq(debtShare.userId, userId));
  }

  /** Public lookup for /s/[shareId] — no owner filter, the id is the secret's handle. */
  async findById(id: string): Promise<DebtShare | null> {
    const rows = await this.db
      .select()
      .from(debtShare)
      .where(eq(debtShare.id, id))
      .limit(1);
    return rows[0] ?? null;
  }

  async create(input: NewDebtShare): Promise<void> {
    await this.db.insert(debtShare).values(input);
  }

  async updatePage(
    userId: string,
    id: string,
    sealedPage: string,
    updatedAt: Date
  ): Promise<void> {
    await this.db
      .update(debtShare)
      .set({ sealedPage, updatedAt })
      .where(and(eq(debtShare.userId, userId), eq(debtShare.id, id)));
  }

  async delete(userId: string, id: string): Promise<boolean> {
    const removed = await this.db
      .delete(debtShare)
      .where(and(eq(debtShare.userId, userId), eq(debtShare.id, id)))
      .returning({ id: debtShare.id });
    return removed.length > 0;
  }

  async deleteByUser(userId: string): Promise<void> {
    await this.db.delete(debtShare).where(eq(debtShare.userId, userId));
  }
}
