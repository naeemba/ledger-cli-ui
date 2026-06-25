// lib/crypto/resetEncryption.test.ts
import { promises as fs } from 'fs';
import path from 'path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DEK_BYTES } from './constants';
import { resetUserEncryption } from './resetEncryption';
import {
  setSessionDek,
  hasSessionDek,
  __resetSessionKeysForTest,
} from './sessionKeys';
import { UserCryptoRepository } from './userCryptoRepository';
import {
  setupTestDb,
  teardownTestDb,
  type TestDbContext,
} from '@/lib/test-utils/db';

describe('resetUserEncryption', () => {
  let ctx: TestDbContext;
  let repo: UserCryptoRepository;

  beforeEach(async () => {
    ctx = await setupTestDb('crypto-reset-');
    await ctx.insertUser('alice', 'Alice', 'alice@example.com');
    repo = new UserCryptoRepository(ctx.db);
  });

  afterEach(async () => {
    __resetSessionKeysForTest();
    await teardownTestDb(ctx);
  });

  it('deletes the userCrypto row, calls both wipes, drops the DEK, and creates a stub journal', async () => {
    // Arrange: create a userCrypto row
    await repo.create({
      userId: 'alice',
      wrapPassphrase: 'd2FwUGFzcw==',
      passSalt: 'c2FsdA==',
      argonParams: { m: 65536, t: 3, p: 1 },
      wrapRecovery: 'd2FwUg==',
    });
    expect(await repo.exists('alice')).toBe(true);

    // Arrange: set a session DEK so we can verify it is dropped
    const fakeDek = Buffer.alloc(DEK_BYTES, 0xab);
    setSessionDek('alice', fakeDek);
    expect(hasSessionDek('alice')).toBe(true);

    // Arrange: fake injections to keep test hermetic
    const clearRemote = vi.fn().mockResolvedValue(undefined);
    const removeLocalJournal = vi.fn().mockResolvedValue(undefined);

    // Act
    await resetUserEncryption('alice', ctx.db, {
      clearRemote,
      removeLocalJournal,
    });

    // Assert: userCrypto row is gone (returns to 'unset' status)
    expect(await repo.exists('alice')).toBe(false);

    // Assert: both storage wipes were called with the correct userId
    expect(clearRemote).toHaveBeenCalledOnce();
    expect(clearRemote).toHaveBeenCalledWith('alice');
    expect(removeLocalJournal).toHaveBeenCalledOnce();
    expect(removeLocalJournal).toHaveBeenCalledWith('alice');

    // Assert: in-RAM DEK was dropped
    expect(hasSessionDek('alice')).toBe(false);

    // Assert: empty stub journal was recreated (ensureLayout ran)
    const journalPath = path.join(
      ctx.tmpDir,
      'journals',
      'alice',
      'main.ledger'
    );
    const stat = await fs.stat(journalPath);
    expect(stat.isFile()).toBe(true);
    const content = await fs.readFile(journalPath, 'utf-8');
    expect(content).toContain('; Ledger journal for user alice');
  });

  it('wipe order: clearRemote before removeLocalJournal before row delete', async () => {
    // Arrange
    await repo.create({
      userId: 'alice',
      wrapPassphrase: 'd2FwUGFzcw==',
      passSalt: 'c2FsdA==',
      argonParams: { m: 65536, t: 3, p: 1 },
      wrapRecovery: 'd2FwUg==',
    });

    const calls: string[] = [];
    const clearRemote = vi.fn().mockImplementation(async () => {
      calls.push('clearRemote');
    });
    const removeLocalJournal = vi.fn().mockImplementation(async () => {
      calls.push('removeLocalJournal');
    });

    // Act
    await resetUserEncryption('alice', ctx.db, {
      clearRemote,
      removeLocalJournal,
    });

    // Assert: order matches brief — remote wipe first, then local, then DB
    expect(calls).toEqual(['clearRemote', 'removeLocalJournal']);
    // Row must be gone (DB delete happened after both wipes)
    expect(await repo.exists('alice')).toBe(false);
  });

  it('user account is NOT deleted — only the userCrypto row is removed', async () => {
    // This is the key distinction from purgeUserData
    await repo.create({
      userId: 'alice',
      wrapPassphrase: 'd2FwUGFzcw==',
      passSalt: 'c2FsdA==',
      argonParams: { m: 65536, t: 3, p: 1 },
      wrapRecovery: 'd2FwUg==',
    });

    await resetUserEncryption('alice', ctx.db, {
      clearRemote: vi.fn().mockResolvedValue(undefined),
      removeLocalJournal: vi.fn().mockResolvedValue(undefined),
    });

    // userCrypto row is gone
    expect(await repo.exists('alice')).toBe(false);

    // But the user row itself still exists
    const { user } = await import('@naeemba/next-starter/schema');
    const { eq } = await import('drizzle-orm');
    const rows = await ctx.db.select().from(user).where(eq(user.id, 'alice'));
    expect(rows).toHaveLength(1);
  });
});
