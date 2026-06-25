// lib/crypto/fileCrypto.test.ts
import { randomBytes } from 'crypto';
import { describe, expect, it } from 'vitest';
import { decryptFile, encryptFile, isCiphertext, MAGIC } from './fileCrypto';

const dek = () => randomBytes(32);

describe('fileCrypto', () => {
  it('round-trips plaintext under the same dek + relPath', () => {
    const key = dek();
    const pt = Buffer.from('2026/01/01 Opening\n  Assets:Cash  $10\n', 'utf8');
    const ct = encryptFile(key, 'main.ledger', pt);
    expect(ct.subarray(0, 4).equals(MAGIC)).toBe(true);
    expect(ct.equals(pt)).toBe(false);
    expect(decryptFile(key, 'main.ledger', ct).equals(pt)).toBe(true);
  });

  it('isCiphertext detects the envelope and rejects plaintext', () => {
    const ct = encryptFile(dek(), 'main.ledger', Buffer.from('x'));
    expect(isCiphertext(ct)).toBe(true);
    expect(isCiphertext(Buffer.from('2026/01/01 Payee\n'))).toBe(false);
    expect(isCiphertext(Buffer.alloc(3))).toBe(false);
  });

  it('fails when the relPath (AAD/subkey) differs — no cross-file swap', () => {
    const key = dek();
    const ct = encryptFile(key, 'main.ledger', Buffer.from('secret'));
    expect(() => decryptFile(key, 'other.ledger', ct)).toThrow();
  });

  it('fails under a different dek', () => {
    const ct = encryptFile(dek(), 'main.ledger', Buffer.from('secret'));
    expect(() => decryptFile(dek(), 'main.ledger', ct)).toThrow();
  });

  it('fails when the ciphertext is tampered', () => {
    const key = dek();
    const ct = encryptFile(key, 'main.ledger', Buffer.from('secret'));
    ct[ct.length - 1] ^= 0xff; // flip a tag byte
    expect(() => decryptFile(key, 'main.ledger', ct)).toThrow();
  });
});
