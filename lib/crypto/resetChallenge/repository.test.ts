import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EncryptionResetChallengeRepository } from './repository';
import {
  setupTestDb,
  teardownTestDb,
  type TestDbContext,
} from '@/lib/test-utils/db';

describe('EncryptionResetChallengeRepository', () => {
  let ctx: TestDbContext;
  let repo: EncryptionResetChallengeRepository;
  const future = () => new Date(Date.now() + 600_000);

  beforeEach(async () => {
    ctx = await setupTestDb('enc-reset-repo-');
    await ctx.insertUser('alice', 'Alice', 'alice@example.com');
    repo = new EncryptionResetChallengeRepository(ctx.db);
  });

  afterEach(async () => {
    await teardownTestDb(ctx);
  });

  it('upsert inserts a row with attempts=0', async () => {
    await repo.upsert('alice', 'hash1', future());
    const row = await repo.get('alice');
    expect(row?.codeHash).toBe('hash1');
    expect(row?.attempts).toBe(0);
  });

  it('upsert replaces an existing row and resets attempts', async () => {
    await repo.upsert('alice', 'hash1', future());
    await repo.incrementAttempts('alice');
    await repo.upsert('alice', 'hash2', future());
    const row = await repo.get('alice');
    expect(row?.codeHash).toBe('hash2');
    expect(row?.attempts).toBe(0);
  });

  it('get returns null when no challenge exists', async () => {
    expect(await repo.get('alice')).toBeNull();
  });

  it('incrementAttempts returns the new count', async () => {
    await repo.upsert('alice', 'hash1', future());
    expect(await repo.incrementAttempts('alice')).toBe(1);
    expect(await repo.incrementAttempts('alice')).toBe(2);
  });

  it('delete removes the row', async () => {
    await repo.upsert('alice', 'hash1', future());
    await repo.delete('alice');
    expect(await repo.get('alice')).toBeNull();
  });
});
