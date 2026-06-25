import { randomBytes } from 'crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cryptoStatus } from './gate';
import {
  __resetSessionKeysForTest,
  setSessionDek,
} from '@/lib/crypto/sessionKeys';

const existsMock = vi.fn();
vi.mock('@/lib/crypto', () => ({
  getUserCryptoRepository: () => ({ exists: existsMock }),
}));

afterEach(() => {
  __resetSessionKeysForTest();
  vi.clearAllMocks();
});

describe('cryptoStatus', () => {
  it('unset when no row', async () => {
    existsMock.mockResolvedValue(false);
    expect(await cryptoStatus('a')).toBe('unset');
  });
  it('locked when row but no DEK', async () => {
    existsMock.mockResolvedValue(true);
    expect(await cryptoStatus('a')).toBe('locked');
  });
  it('ready when row and DEK', async () => {
    existsMock.mockResolvedValue(true);
    setSessionDek('a', randomBytes(32));
    expect(await cryptoStatus('a')).toBe('ready');
  });
});
