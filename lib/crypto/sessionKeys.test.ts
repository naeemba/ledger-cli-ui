// lib/crypto/sessionKeys.test.ts
import { randomBytes } from 'crypto';
import { afterEach, describe, expect, it } from 'vitest';
import {
  __resetSessionKeysForTest,
  dropSessionDek,
  getSessionDek,
  hasSessionDek,
  setSessionDek,
} from './sessionKeys';

afterEach(() => __resetSessionKeysForTest());

describe('sessionKeys', () => {
  it('stores and retrieves a DEK per user', () => {
    const dek = randomBytes(32);
    setSessionDek('alice', dek);
    expect(hasSessionDek('alice')).toBe(true);
    expect(getSessionDek('alice')!.equals(dek)).toBe(true);
    expect(getSessionDek('bob')).toBeUndefined();
  });

  it('drops a DEK', () => {
    setSessionDek('alice', randomBytes(32));
    dropSessionDek('alice');
    expect(hasSessionDek('alice')).toBe(false);
    expect(getSessionDek('alice')).toBeUndefined();
  });

  it('rejects a wrong-length DEK', () => {
    expect(() => setSessionDek('alice', randomBytes(16))).toThrow();
  });

  it('copies the buffer so external mutation cannot corrupt the stored key', () => {
    const dek = randomBytes(32);
    setSessionDek('alice', dek);
    dek.fill(0);
    expect(getSessionDek('alice')!.equals(Buffer.alloc(32))).toBe(false);
  });
});
