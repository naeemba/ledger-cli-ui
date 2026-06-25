import { decryptFile, encryptFile, isCiphertext } from './fileCrypto';
import { getSessionDek, LockedError } from './sessionKeys';

/**
 * Encrypt a journal file for upload IFF the user's session holds a DEK.
 * No DEK → the user is not encryption-enabled → upload plaintext unchanged.
 */
export const encryptForUpload = (
  userId: string,
  relPath: string,
  plaintext: Buffer
): Buffer => {
  if (isCiphertext(plaintext)) return plaintext; // never double-wrap already-ciphertext
  const dek = getSessionDek(userId);
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
