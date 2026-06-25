import { randomBytes } from 'crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { encryptFile, isCiphertext } from './fileCrypto';
import { decryptFromDownload, encryptForUpload } from './journalCipher';
import {
  LockedError,
  __resetSessionKeysForTest,
  setSessionDek,
} from './sessionKeys';

afterEach(() => __resetSessionKeysForTest());

describe('journalCipher', () => {
  it('encryptForUpload encrypts when the session holds a DEK', () => {
    setSessionDek('alice', randomBytes(32));
    const out = encryptForUpload('alice', 'main.ledger', Buffer.from('plain'));
    expect(isCiphertext(out)).toBe(true);
  });

  it('encryptForUpload passes through plaintext when no DEK (not enabled)', () => {
    const pt = Buffer.from('plain');
    expect(encryptForUpload('bob', 'main.ledger', pt).equals(pt)).toBe(true);
  });

  it('decryptFromDownload decrypts ciphertext when the DEK is present', () => {
    const dek = randomBytes(32);
    setSessionDek('alice', dek);
    const ct = encryptFile(dek, 'main.ledger', Buffer.from('secret'));
    expect(decryptFromDownload('alice', 'main.ledger', ct).toString()).toBe(
      'secret'
    );
  });

  it('decryptFromDownload passes through plaintext bodies', () => {
    const pt = Buffer.from('2026/01/01 Payee\n');
    expect(decryptFromDownload('bob', 'main.ledger', pt).equals(pt)).toBe(true);
  });

  it('decryptFromDownload throws LockedError on ciphertext with no DEK', () => {
    const ct = encryptFile(
      randomBytes(32),
      'main.ledger',
      Buffer.from('secret')
    );
    expect(() => decryptFromDownload('carol', 'main.ledger', ct)).toThrow(
      LockedError
    );
  });
});
