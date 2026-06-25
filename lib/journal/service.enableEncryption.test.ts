// lib/journal/service.enableEncryption.test.ts
import { randomBytes } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isCiphertext } from '@/lib/crypto/fileCrypto';
import {
  LockedError,
  __resetSessionKeysForTest,
  setSessionDek,
} from '@/lib/crypto/sessionKeys';
import { journalService } from '@/lib/journal';
import { getJournalDir } from '@/lib/journal/layout';
import { resetObjectStore, getObjectStore, push } from '@/lib/storage';
import { keyFor } from '@/lib/storage/manifest';
import {
  setupTestDb,
  teardownTestDb,
  type TestDbContext,
} from '@/lib/test-utils/db';

// resetObjectStore() + STORAGE_BACKEND=memory (default when not 's3') forces a
// fresh MemoryObjectStore for each test — mirrors quota-enforcement.test.ts.

describe('JournalService.enableEncryption', () => {
  let ctx: TestDbContext;
  beforeEach(async () => {
    ctx = await setupTestDb('enable-enc-');
    await ctx.insertUser('alice');
    resetObjectStore();
  });
  afterEach(async () => {
    __resetSessionKeysForTest();
    await teardownTestDb(ctx);
  });

  it('re-encrypts existing plaintext files and is idempotent', async () => {
    const userId = 'alice';
    const dir = getJournalDir(userId);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, 'main.ledger'),
      '2026/01/01 Opening\n  Assets:Cash  $10\n'
    );

    // Push the plaintext file to remote first (simulates pre-encryption state:
    // user already has unencrypted files on the remote store).
    await push(userId);

    setSessionDek(userId, randomBytes(32));
    const r1 = await journalService.enableEncryption(userId);
    expect(r1.encrypted).toBe(1);

    const remote = await getObjectStore().get(keyFor(userId, 'main.ledger'));
    expect(isCiphertext(remote.body)).toBe(true);

    // idempotent: pulling decrypts to plaintext locally; re-running re-encrypts the same content
    const r2 = await journalService.enableEncryption(userId);
    expect(r2.encrypted + r2.alreadyCiphertext).toBeGreaterThanOrEqual(1);
  });

  it('throws LockedError when no session DEK', async () => {
    const dir = getJournalDir('alice');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'main.ledger'), 'x');
    await expect(
      journalService.enableEncryption('alice')
    ).rejects.toBeInstanceOf(LockedError);
  });
});
