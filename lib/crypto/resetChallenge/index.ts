import 'server-only';
import { EncryptionResetChallengeRepository } from './repository';
import { EncryptionResetService } from './service';
import { APP_NAME } from '@/lib/app';
import { resetUserEncryption } from '@/lib/crypto/resetEncryption';
import { db } from '@/lib/db';
import { postalTransport } from '@/lib/email-transport';
import { env } from '@/lib/env';

const sendCode = async (email: string, code: string): Promise<void> => {
  const from = env.EMAIL_FROM;
  const subject = `${APP_NAME}: confirm encryption reset`;
  const text = [
    `Your encryption reset code is ${code}.`,
    `It expires in 10 minutes.`,
    `Warning: confirming this will permanently delete your encrypted journal and reset encryption to "not set up".`,
    `If you didn't request this, ignore this email — nothing will happen.`,
  ].join('\n\n');
  const html =
    `<p>Your encryption reset code is <strong style="font-size:1.25rem;letter-spacing:0.15em">${code}</strong>.</p>` +
    `<p>It expires in 10 minutes.</p>` +
    `<p><strong>Warning:</strong> confirming this will permanently delete your encrypted journal and reset encryption to &ldquo;not set up&rdquo;.</p>` +
    `<p>If you didn't request this, ignore this email — nothing will happen.</p>`;
  await postalTransport({ to: email, from, subject, html, text });
};

const encryptionResetChallengeRepository =
  new EncryptionResetChallengeRepository(db);

export const encryptionResetService = new EncryptionResetService(
  encryptionResetChallengeRepository,
  { sendCode, reset: (userId) => resetUserEncryption(userId, db) }
);

export { EncryptionResetChallengeRepository } from './repository';
export { EncryptionResetService } from './service';
export type { IssueResult, VerifyResult } from './service';
export { resetCodeSchema, type ResetCode } from './schema';
