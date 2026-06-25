import { randomBytes } from 'crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';
import {
  __resetSessionKeysForTest,
  hasSessionDek,
} from '@/lib/crypto/sessionKeys';

const existsMock = vi.fn();

vi.mock('@/lib/auth/require-user', () => ({
  requireUser: vi.fn(async () => ({ id: 'alice' })),
}));
vi.mock('@/lib/crypto', () => ({
  getUserCryptoRepository: () => ({ exists: existsMock }),
}));

const req = (body: unknown) =>
  new Request('http://localhost/api/crypto/unlock', {
    method: 'POST',
    body: JSON.stringify(body),
  }) as unknown as Parameters<typeof POST>[0];

beforeEach(() => {
  existsMock.mockResolvedValue(true);
});
afterEach(() => {
  __resetSessionKeysForTest();
  vi.clearAllMocks();
});

describe('POST /api/crypto/unlock', () => {
  it('stores the DEK and returns 204', async () => {
    const dek = randomBytes(32).toString('base64');
    const res = await POST(req({ dek }));
    expect(res.status).toBe(204);
    expect(hasSessionDek('alice')).toBe(true);
  });

  it('returns 409 when encryption is not set up', async () => {
    existsMock.mockResolvedValue(false);
    const res = await POST(req({ dek: randomBytes(32).toString('base64') }));
    expect(res.status).toBe(409);
    expect(hasSessionDek('alice')).toBe(false);
  });

  it('returns 400 on a malformed DEK', async () => {
    const res = await POST(req({ dek: 'too-short' }));
    expect(res.status).toBe(400);
    expect(hasSessionDek('alice')).toBe(false);
  });
});
