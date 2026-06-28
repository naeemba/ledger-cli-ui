import { and, eq } from 'drizzle-orm';
import {
  cryptoPasskeyWrap,
  type CryptoPasskeyWrap,
  type NewCryptoPasskeyWrap,
} from '@/db/schema';
import type { DbInstance } from '@/lib/db/connection';

export class PasskeyWrapRepository {
  constructor(private readonly db: DbInstance) {}

  async listByUser(userId: string): Promise<CryptoPasskeyWrap[]> {
    return this.db
      .select()
      .from(cryptoPasskeyWrap)
      .where(eq(cryptoPasskeyWrap.userId, userId));
  }

  /** Insert a wrap, or replace it if this (user, credential) already has one. */
  async create(input: NewCryptoPasskeyWrap): Promise<void> {
    await this.db
      .insert(cryptoPasskeyWrap)
      .values(input)
      .onConflictDoUpdate({
        target: [cryptoPasskeyWrap.userId, cryptoPasskeyWrap.credentialId],
        set: { wrap: input.wrap, label: input.label },
      });
  }

  async deleteByCredential(
    userId: string,
    credentialId: string
  ): Promise<void> {
    await this.db
      .delete(cryptoPasskeyWrap)
      .where(
        and(
          eq(cryptoPasskeyWrap.userId, userId),
          eq(cryptoPasskeyWrap.credentialId, credentialId)
        )
      );
  }
}
