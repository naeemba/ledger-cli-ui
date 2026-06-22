import { promises as fs } from 'fs';
import path from 'path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getJournalDir } from './layout';
import { JournalRepository } from './repository';
import {
  setupTestDb,
  teardownTestDb,
  type TestDbContext,
} from '@/lib/test-utils/db';

describe('JournalRepository.getMaxMtime', () => {
  let ctx: TestDbContext;
  let repo: JournalRepository;

  beforeEach(async () => {
    ctx = await setupTestDb('repo-mtime-');
    await ctx.insertUser('test-user', 'Test', 'test@example.com');
    repo = new JournalRepository(ctx.db);
    // Wipe journal dir so each test starts with a clean filesystem state.
    await fs.rm(getJournalDir('test-user'), { recursive: true, force: true });
  });

  afterEach(async () => {
    await teardownTestDb(ctx);
    await fs.rm(getJournalDir('test-user'), { recursive: true, force: true });
  });

  it('returns the stub file mtime for a brand-new user (calls ensureLayout)', async () => {
    const mtime = await repo.getMaxMtime('test-user');
    expect(mtime).toBeGreaterThan(0);
  });

  it('returns the main file mtime when there are no includes', async () => {
    const userId = 'test-user';
    await repo.ensureLayout(userId);
    const mainPath = path.join(getJournalDir(userId), 'main.ledger');
    const target = 1_700_000_000_000;
    await fs.utimes(mainPath, new Date(target), new Date(target));
    const mtime = await repo.getMaxMtime(userId);
    expect(mtime).toBe(target);
  });

  it('returns the max mtime across the include graph', async () => {
    const userId = 'test-user';
    const dir = getJournalDir(userId);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, 'main.ledger'),
      'include ./sub.ledger\n\n2024-01-01 main\n    Expenses:Food  USD 1\n    Assets:Cash\n'
    );
    await fs.writeFile(
      path.join(dir, 'sub.ledger'),
      '2024-01-02 sub\n    Expenses:Food  USD 2\n    Assets:Cash\n'
    );
    const older = 1_700_000_000_000;
    const newer = 1_800_000_000_000;
    await fs.utimes(
      path.join(dir, 'main.ledger'),
      new Date(older),
      new Date(older)
    );
    await fs.utimes(
      path.join(dir, 'sub.ledger'),
      new Date(newer),
      new Date(newer)
    );

    const mtime = await repo.getMaxMtime(userId);
    expect(mtime).toBe(newer);
  });

  it('reflects a sub-file change on the next call', async () => {
    const userId = 'test-user';
    const dir = getJournalDir(userId);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'main.ledger'), 'include ./sub.ledger\n');
    await fs.writeFile(path.join(dir, 'sub.ledger'), '');
    const first = 1_700_000_000_000;
    await fs.utimes(
      path.join(dir, 'main.ledger'),
      new Date(first),
      new Date(first)
    );
    await fs.utimes(
      path.join(dir, 'sub.ledger'),
      new Date(first),
      new Date(first)
    );
    expect(await repo.getMaxMtime(userId)).toBe(first);

    const later = 1_800_000_000_000;
    await fs.utimes(
      path.join(dir, 'sub.ledger'),
      new Date(later),
      new Date(later)
    );
    expect(await repo.getMaxMtime(userId)).toBe(later);
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
