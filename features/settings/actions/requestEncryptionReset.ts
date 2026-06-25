'use server';

import { requireUser } from '@/lib/auth/require-user';
import { getUserCryptoRepository } from '@/lib/crypto';
import {
  encryptionResetService,
  type IssueResult,
} from '@/lib/crypto/resetChallenge';
import { rateLimit, DESTRUCTIVE } from '@/lib/rate-limit';

export type RequestEncryptionResetResult =
  | IssueResult
  | { ok: false; reason: 'not-set-up' };

export const requestEncryptionResetAction =
  async (): Promise<RequestEncryptionResetResult> => {
    const user = await requireUser();
    if (!rateLimit(DESTRUCTIVE, user.id).allowed) {
      return { ok: false, reason: 'throttled' };
    }
    const cryptoExists = await getUserCryptoRepository().exists(user.id);
    if (!cryptoExists) {
      return { ok: false, reason: 'not-set-up' };
    }
    return encryptionResetService.issueCode(user.id, user.email);
  };
