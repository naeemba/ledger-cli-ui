import { randomBytes } from 'crypto';
import { describe, expect, it } from 'vitest';
import { decodeDek } from './transport';

describe('decodeDek', () => {
  it('decodes a base64 32-byte DEK', () => {
    const dek = randomBytes(32);
    expect(decodeDek(dek.toString('base64')).equals(dek)).toBe(true);
  });

  it('rejects a non-string', () => {
    expect(() => decodeDek(123)).toThrow();
    expect(() => decodeDek(undefined)).toThrow();
  });

  it('rejects a wrong-length DEK', () => {
    expect(() => decodeDek(randomBytes(16).toString('base64'))).toThrow();
    expect(() => decodeDek('')).toThrow();
  });
});
