import { randomBytes } from 'crypto';
import { describe, expect, it } from 'vitest';
import { openSharedPage } from './openSharedPage';
import type { SharedDebtPage } from '@/lib/debt-share/payload';
import { derivePageKey, seal } from '@/lib/debt-share/seal';

const page: SharedDebtPage = {
  version: 1,
  ownerName: 'Naeem',
  person: 'Bashir',
  net: [{ amount: '€ 100.00', direction: 'viewer-owes' }],
  rows: [
    {
      date: '2026-03-01',
      payee: 'He paid back',
      amount: '€ 100.00',
      balance: ['€ -100.00'],
    },
  ],
  generatedAt: '2026-10-03T14:02:00.000Z',
};

const dek = randomBytes(32);
const key = derivePageKey(dek, 'share-a');
const keyText = key.toString('base64url');

describe('openSharedPage', () => {
  it('opens what the server sealed', async () => {
    const sealed = seal(key, 'share-a', JSON.stringify(page));
    expect(await openSharedPage('share-a', sealed, keyText)).toEqual(page);
  });

  it('returns null for a wrong key, a wrong share id, or a bad key string', async () => {
    const sealed = seal(key, 'share-a', JSON.stringify(page));
    const otherKey = derivePageKey(dek, 'share-b').toString('base64url');
    expect(await openSharedPage('share-a', sealed, otherKey)).toBeNull();
    expect(await openSharedPage('share-b', sealed, keyText)).toBeNull();
    expect(await openSharedPage('share-a', sealed, 'not-a-key')).toBeNull();
    expect(await openSharedPage('share-a', sealed, '')).toBeNull();
  });

  it('returns null when the decrypted body is not a page', async () => {
    const sealed = seal(key, 'share-a', JSON.stringify({ version: 2 }));
    expect(await openSharedPage('share-a', sealed, keyText)).toBeNull();
  });
});
