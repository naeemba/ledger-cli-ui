import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from 'crypto';
import 'server-only';
import { DEK_BYTES } from '@/lib/crypto/constants';

// Layout of a sealed blob, base64: nonce (12) ‖ ciphertext ‖ GCM tag (16).
// WebCrypto's AES-GCM decrypt takes exactly ciphertext‖tag with the nonce as
// iv, so the browser opens it without reshuffling (features/debtShare/lib/
// openSharedPage.ts).
const NONCE_LENGTH = 12;
const TAG_LENGTH = 16;
const SHARE_ID_BYTES = 16;

const derive = (dek: Buffer, info: string): Buffer =>
  Buffer.from(
    hkdfSync(
      'sha256',
      dek,
      Buffer.alloc(0),
      Buffer.from(info, 'utf8'),
      DEK_BYTES
    )
  );

export const newShareId = (): string =>
  randomBytes(SHARE_ID_BYTES).toString('base64url');

/** The key in the link's fragment. Never stored: it exists only while the DEK does. */
export const derivePageKey = (dek: Buffer, shareId: string): Buffer =>
  derive(dek, `debt-share-page-v1:${shareId}`);

/** Seals who a share is for, so the database cannot say who you lend to. */
export const deriveMetaKey = (dek: Buffer): Buffer =>
  derive(dek, 'debt-share-meta-v1');

export const seal = (
  key: Buffer,
  shareId: string,
  plaintext: string
): string => {
  const nonce = randomBytes(NONCE_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  cipher.setAAD(Buffer.from(shareId, 'utf8'));
  const body = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  return Buffer.concat([nonce, body, cipher.getAuthTag()]).toString('base64');
};

export const unseal = (
  key: Buffer,
  shareId: string,
  sealed: string
): string => {
  const raw = Buffer.from(sealed, 'base64');
  if (raw.length < NONCE_LENGTH + TAG_LENGTH)
    throw new Error('sealed blob too short');
  const decipher = createDecipheriv(
    'aes-256-gcm',
    key,
    raw.subarray(0, NONCE_LENGTH)
  );
  decipher.setAAD(Buffer.from(shareId, 'utf8'));
  decipher.setAuthTag(raw.subarray(raw.length - TAG_LENGTH));
  return Buffer.concat([
    decipher.update(raw.subarray(NONCE_LENGTH, raw.length - TAG_LENGTH)),
    decipher.final(),
  ]).toString('utf8');
};
