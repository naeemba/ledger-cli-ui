import { eq } from 'drizzle-orm';
import {
  userCrypto,
  type NewUserCrypto,
  type UserCrypto,
} from '@/db/schema/userCrypto';
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
}
