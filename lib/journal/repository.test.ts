import { promises as fs } from 'fs';
import path from 'path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getJournalDir } from './layout';
import { JournalRepository } from './repository';
import { resetObjectStore } from '@/lib/storage';
import {
  setupTestDb,
  teardownTestDb,
  type TestDbContext,
} from '@/lib/test-utils/db';

describe('JournalRepository.getFingerprint', () => {
  let ctx: TestDbContext;
  let repo: JournalRepository;

  beforeEach(async () => {
    ctx = await setupTestDb('repo-fp-');
    await ctx.insertUser('test-user', 'Test', 'test@example.com');
    repo = new JournalRepository(ctx.db);
    resetObjectStore();
    await fs.rm(getJournalDir('test-user'), { recursive: true, force: true });
  });

  afterEach(async () => {
    await teardownTestDb(ctx);
    resetObjectStore();
    await fs.rm(getJournalDir('test-user'), { recursive: true, force: true });
  });

  it('returns a 64-char hex fingerprint for a brand-new user', async () => {
    const fp = await repo.getFingerprint('test-user');
    expect(fp).toMatch(/^[a-f0-9]{64}$/);
  });

  it('changes the fingerprint after a file is added and pushed', async () => {
    const { pull, push } = await import('@/lib/storage');
    const before = await repo.getFingerprint('test-user');
    await pull('test-user');
    await fs.writeFile(
      path.join(getJournalDir('test-user'), 'main.ledger'),
      '2024-01-01 x\n    A  1\n    B\n'
    );
    await push('test-user');
    const after = await repo.getFingerprint('test-user');
    expect(after).not.toBe(before);
  });
});

describe('JournalRepository.setMainFile', () => {
  let ctx: TestDbContext;
  let repo: JournalRepository;

  beforeEach(async () => {
    ctx = await setupTestDb('repo-setmain-');
    await ctx.insertUser('test-user', 'Test', 'test@example.com');
    repo = new JournalRepository(ctx.db);
  });

  afterEach(async () => {
    await teardownTestDb(ctx);
  });

  it('creates the userSetting row when none exists (upsert insert path)', async () => {
    // Fresh user: no userSetting row yet — plain UPDATE would silently no-op,
    // leaving mainFile as the default 'main.ledger'. Upsert must CREATE the row.
    await repo.setMainFile('test-user', 'custom.ledger');
    const layout = await repo.getLayout('test-user');
    expect(layout.mainFile).toBe('custom.ledger');
  });

  it('updates the userSetting row when one already exists (upsert update path)', async () => {
    await repo.setMainFile('test-user', 'custom.ledger');
    await repo.setMainFile('test-user', 'other.ledger');
    const layout = await repo.getLayout('test-user');
    expect(layout.mainFile).toBe('other.ledger');
  });
});
