import { randomBytes } from 'crypto';
import { describe, expect, it } from 'vitest';
import { deriveMetaKey, derivePageKey, newShareId, seal, unseal } from './seal';

const dek = randomBytes(32);

describe('seal', () => {
  it('round-trips under the same key and share id', () => {
    const key = derivePageKey(dek, 'share-a');
    expect(unseal(key, 'share-a', seal(key, 'share-a', 'hello'))).toBe('hello');
  });

  it('fails when the blob is moved to another share id', () => {
    const key = derivePageKey(dek, 'share-a');
    const sealed = seal(key, 'share-a', 'hello');
    expect(() => unseal(key, 'share-b', sealed)).toThrow();
  });

  it('gives each share its own page key, and the meta key differs from both', () => {
    const a = derivePageKey(dek, 'share-a');
    const b = derivePageKey(dek, 'share-b');
    expect(a.equals(b)).toBe(false);
    expect(deriveMetaKey(dek).equals(a)).toBe(false);
    expect(derivePageKey(dek, 'share-a').equals(a)).toBe(true);
  });

  it('fails with a key from another DEK', () => {
    const sealed = seal(derivePageKey(dek, 's'), 's', 'hello');
    expect(() =>
      unseal(derivePageKey(randomBytes(32), 's'), 's', sealed)
    ).toThrow();
  });

  it('makes url-safe 16-byte share ids', () => {
    const id = newShareId();
    expect(id).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(newShareId()).not.toBe(id);
  });
});
