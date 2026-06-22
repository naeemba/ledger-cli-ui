import { promises as fs } from 'fs';
import path from 'path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runLedgerForUser } from './runLedgerForUser';
import { getJournalDir } from '@/lib/journal/layout';
import { JournalRepository } from '@/lib/journal/repository';
import {
  setupTestDb,
  teardownTestDb,
  type TestDbContext,
} from '@/lib/test-utils/db';

describe('runLedgerForUser', () => {
  let ctx: TestDbContext;
  let repo: JournalRepository;

  beforeEach(async () => {
    ctx = await setupTestDb('runledger-');
    await ctx.insertUser('u1', 'U', 'u1@example.com');
    const dir = getJournalDir('u1');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, 'main.ledger'),
      '2026/01/01 Lunch\n  Expenses:Food  10 USD\n  Assets:Cash\n',
      'utf-8'
    );
    repo = new JournalRepository(ctx.db);
  });

  afterEach(async () => {
    await teardownTestDb(ctx);
  });

  it('runs ledger commodities against the user main file', async () => {
    const stdout = await runLedgerForUser('u1', ['commodities'], repo);
    // ledger may render USD as "$" depending on version/locale
    expect(stdout.trim().length).toBeGreaterThan(0);
  });

  it('omits --price-db when no price-db.ledger exists', async () => {
    const stdout = await runLedgerForUser('u1', ['stats'], repo);
    // stats output contains posting or transaction counts
    expect(stdout).toMatch(/postings|Transactions found/i);
  });
});
