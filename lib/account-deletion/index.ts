import 'server-only';
import { purgeUserData } from './purge';
import { AccountDeletionChallengeRepository } from './repository';
import { AccountDeletionService } from './service';
import { APP_NAME } from '@/lib/app';
import { db } from '@/lib/db';
import { postalTransport } from '@/lib/email-transport';

const sendCode = async (email: string, code: string): Promise<void> => {
  const from = process.env.EMAIL_FROM;
  if (!from) {
    throw new Error('[account-deletion] EMAIL_FROM is not configured.');
  }
  const subject = `${APP_NAME}: confirm account deletion`;
  const text = [
    `Your account deletion code is ${code}.`,
    `It expires in 10 minutes.`,
    `If you didn't request this, ignore this email — nothing will happen.`,
  ].join('\n\n');
  const html =
    `<p>Your account deletion code is <strong style="font-size:1.25rem;letter-spacing:0.15em">${code}</strong>.</p>` +
    `<p>It expires in 10 minutes.</p>` +
    `<p>If you didn't request this, ignore this email — nothing will happen.</p>`;
  await postalTransport({ to: email, from, subject, html, text });
};

const accountDeletionChallengeRepository =
  new AccountDeletionChallengeRepository(db);

export const accountDeletionService = new AccountDeletionService(
  accountDeletionChallengeRepository,
  { sendCode, purge: (userId) => purgeUserData(userId, db) }
);

export { AccountDeletionChallengeRepository } from './repository';
export { AccountDeletionService } from './service';
export type { IssueResult, VerifyResult } from './service';
export { deletionCodeSchema, type DeletionCode } from './schema';
