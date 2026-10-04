import { decryptFile, encryptFile, isCiphertext } from './fileCrypto';
import { getSessionDek, LockedError } from './sessionKeys';

/**
 * Encrypt a journal file for upload with `dek`, the key the caller read once
 * for the whole upload. No key → the user is not encryption-enabled → upload
 * plaintext unchanged. Taking the key rather than looking it up per file means
 * a Lock halfway through an upload cannot send the remaining files in plaintext.
 */
export const encryptForUpload = (
  dek: Buffer | undefined,
  relPath: string,
  plaintext: Buffer
): Buffer => {
  if (isCiphertext(plaintext)) return plaintext; // never double-wrap already-ciphertext
  return dek ? encryptFile(dek, relPath, plaintext) : plaintext;
};

/**
 * Decrypt a downloaded journal file IFF it carries the LEJ1 envelope. Plaintext
 * bodies (legacy / mid-migration) pass through untouched. Ciphertext with no
 * session DEK is a locked read → LockedError.
 */
export const decryptFromDownload = (
  userId: string,
  relPath: string,
  body: Buffer
): Buffer => {
  if (!isCiphertext(body)) return body;
  const dek = getSessionDek(userId);
  if (!dek) throw new LockedError();
  return decryptFile(dek, relPath, body);
};
