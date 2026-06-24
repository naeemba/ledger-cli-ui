import 'server-only';
import { createHash, randomInt, timingSafeEqual } from 'crypto';
import type { AccountDeletionChallengeRepository } from './repository';

export const CODE_TTL_MS = 600_000; // 10 minutes
export const MAX_ATTEMPTS = 5;
export const RESEND_THROTTLE_MS = 30_000;

export type IssueResult = { ok: true } | { ok: false; reason: 'throttled' };

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: 'no-code' | 'expired' | 'too-many-attempts' }
  | { ok: false; reason: 'invalid'; remaining: number };

export type AccountDeletionDeps = {
  sendCode: (email: string, code: string) => Promise<void>;
  purge: (userId: string) => Promise<void>;
  now?: () => number;
};

const hashCode = (code: string): string =>
  createHash('sha256').update(code).digest('hex');

const constantTimeEqual = (a: string, b: string): boolean => {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
};

export class AccountDeletionService {
  private readonly now: () => number;

  constructor(
    private readonly repo: AccountDeletionChallengeRepository,
    private readonly deps: AccountDeletionDeps
  ) {
    this.now = deps.now ?? Date.now;
  }

  async issueCode(userId: string, email: string): Promise<IssueResult> {
    const existing = await this.repo.get(userId);
    if (
      existing &&
      this.now() - existing.createdAt.getTime() < RESEND_THROTTLE_MS
    ) {
      return { ok: false, reason: 'throttled' };
    }
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const nowTime = this.now();
    const expiresAt = new Date(nowTime + CODE_TTL_MS);
    const createdAt = new Date(nowTime);
    await this.repo.upsert(userId, hashCode(code), expiresAt, createdAt);
    await this.deps.sendCode(email, code);
    return { ok: true };
  }

  async verifyAndDelete(userId: string, code: string): Promise<VerifyResult> {
    const challenge = await this.repo.get(userId);
    if (!challenge) return { ok: false, reason: 'no-code' };

    if (challenge.expiresAt.getTime() < this.now()) {
      await this.repo.delete(userId);
      return { ok: false, reason: 'expired' };
    }

    if (!constantTimeEqual(hashCode(code), challenge.codeHash)) {
      const attempts = await this.repo.incrementAttempts(userId);
      if (attempts >= MAX_ATTEMPTS) {
        await this.repo.delete(userId);
        return { ok: false, reason: 'too-many-attempts' };
      }
      return {
        ok: false,
        reason: 'invalid',
        remaining: MAX_ATTEMPTS - attempts,
      };
    }

    await this.deps.purge(userId);
    // The challenge row is cascade-deleted with the user; nothing to clean up.
    return { ok: true };
  }
}
