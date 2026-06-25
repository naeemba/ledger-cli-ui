// lib/crypto/fileCrypto.ts
import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from 'crypto';
import { DEK_BYTES } from './constants';

// On-disk envelope: [magic "LEJ1"(4)][version(1)][nonce(12)][ciphertext][tag(16)]
export const MAGIC = Buffer.from('LEJ1', 'ascii');
export const VERSION = 1;
const NONCE_LEN = 12;
const TAG_LEN = 16;
const HEADER_LEN = MAGIC.length + 1 + NONCE_LEN; // 17

/** Per-file 256-bit subkey: HKDF-SHA256(DEK, info = relPath). Binds each file's
 * key to its path so ciphertexts can't be swapped between files. */
const subkeyFor = (dek: Buffer, relPath: string): Buffer =>
  Buffer.from(
    hkdfSync(
      'sha256',
      dek,
      Buffer.alloc(0),
      Buffer.from(relPath, 'utf8'),
      DEK_BYTES
    )
  );

/** AAD binds magic+version+relPath into the GCM tag (defence in depth). */
const aadFor = (relPath: string): Buffer =>
  Buffer.concat([MAGIC, Buffer.from([VERSION]), Buffer.from(relPath, 'utf8')]);

export const isCiphertext = (buf: Buffer): boolean =>
  buf.length >= HEADER_LEN + TAG_LEN &&
  buf.subarray(0, MAGIC.length).equals(MAGIC);

export const encryptFile = (
  dek: Buffer,
  relPath: string,
  plaintext: Buffer
): Buffer => {
  const nonce = randomBytes(NONCE_LEN);
  const cipher = createCipheriv('aes-256-gcm', subkeyFor(dek, relPath), nonce);
  cipher.setAAD(aadFor(relPath));
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([MAGIC, Buffer.from([VERSION]), nonce, ct, tag]);
};

export const decryptFile = (
  dek: Buffer,
  relPath: string,
  buf: Buffer
): Buffer => {
  if (!isCiphertext(buf)) throw new Error('Not a LEJ1 ciphertext file');
  const version = buf[MAGIC.length];
  if (version !== VERSION)
    throw new Error(`Unsupported crypto version ${version}`);
  const nonce = buf.subarray(MAGIC.length + 1, HEADER_LEN);
  const tag = buf.subarray(buf.length - TAG_LEN);
  const ct = buf.subarray(HEADER_LEN, buf.length - TAG_LEN);
  const decipher = createDecipheriv(
    'aes-256-gcm',
    subkeyFor(dek, relPath),
    nonce
  );
  decipher.setAAD(aadFor(relPath));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]);
};
