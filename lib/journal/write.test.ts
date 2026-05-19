import { promises as fs } from 'fs';
import path from 'path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  setupTestDb,
  teardownTestDb,
  type TestDbContext,
} from '@/lib/test-utils/db';

describe('writeJournal — edit', () => {
  let ctx: TestDbContext;

  beforeEach(async () => {
    ctx = await setupTestDb('write-');
  });

  afterEach(async () => {
    await teardownTestDb(ctx);
  });

  it('rewrites only the target block; rest byte-exact', async () => {
    const { getJournalDir } = await import('@/lib/journals');
    const userId = 'test-user';
    const dir = getJournalDir(userId);
    await fs.mkdir(dir, { recursive: true });
    const before =
      '; header comment\n\n' +
      '2024-09-01 lunch\n' +
      '    ; :uid: 01HZX5G5KJDS9HQRYK8E5T0DJC\n' +
      '    Expenses:Food                            USD 10\n' +
      '    Assets:Cash                              USD -10\n' +
      '\n' +
      '2024-09-02 coffee\n' +
      '    ; :uid: 01HZX5G5KJDS9HQRYK8E5T0DKZ\n' +
      '    Expenses:Coffee                          USD 4\n' +
      '    Assets:Cash                              USD -4\n';
    await fs.writeFile(path.join(dir, 'main.ledger'), before);

    const { writeJournal } = await import('./write');
    const { fingerprintDraft } = await import('./fingerprint');
    const draftBefore = {
      date: '2024-09-01',
      payee: 'lunch',
      status: 'none' as const,
      uid: '01HZX5G5KJDS9HQRYK8E5T0DJC',
      postings: [
        { account: 'Expenses:Food', amount: '10', currency: 'USD' },
        { account: 'Assets:Cash', amount: '-10', currency: 'USD' },
      ],
    };
    const fp = fingerprintDraft(draftBefore);

    const result = await writeJournal(userId, {
      kind: 'edit',
      uid: '01HZX5G5KJDS9HQRYK8E5T0DJC',
      expectedFingerprint: fp,
      draft: {
        ...draftBefore,
        postings: [
          { account: 'Expenses:Food', amount: '12', currency: 'USD' },
          { account: 'Assets:Cash', amount: '-12', currency: 'USD' },
        ],
      },
    });
    expect(result.ok).toBe(true);

    const after = await fs.readFile(path.join(dir, 'main.ledger'), 'utf-8');
    expect(after).toContain('USD 12');
    expect(after).toContain('USD -12');
    expect(after).toContain('2024-09-02 coffee');
    expect(after).toContain('USD 4');
    expect(after.startsWith('; header comment\n\n')).toBe(true);
  });

  it('returns stale when fingerprint does not match', async () => {
    const { getJournalDir } = await import('@/lib/journals');
    const userId = 'test-user';
    const dir = getJournalDir(userId);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, 'main.ledger'),
      '2024-09-01 lunch\n    ; :uid: 01HZX5G5KJDS9HQRYK8E5T0DJC\n    Expenses:Food  USD 10\n    Assets:Cash\n'
    );
    const { writeJournal } = await import('./write');
    const result = await writeJournal(userId, {
      kind: 'edit',
      uid: '01HZX5G5KJDS9HQRYK8E5T0DJC',
      expectedFingerprint: 'deadbeef'.repeat(8),
      draft: {
        date: '2024-09-01',
        payee: 'lunch',
        status: 'none',
        uid: '01HZX5G5KJDS9HQRYK8E5T0DJC',
        postings: [
          { account: 'Expenses:Food', amount: '12', currency: 'USD' },
          { account: 'Assets:Cash', amount: '-12', currency: 'USD' },
        ],
      },
    });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe('stale');
  });

  it('returns not-found for unknown uid', async () => {
    const { getJournalDir } = await import('@/lib/journals');
    const userId = 'test-user';
    await fs.mkdir(getJournalDir(userId), { recursive: true });
    await fs.writeFile(
      path.join(getJournalDir(userId), 'main.ledger'),
      '2024-09-01 lunch\n    Expenses:Food  USD 10\n    Assets:Cash\n'
    );
    const { writeJournal } = await import('./write');
    const result = await writeJournal(userId, {
      kind: 'edit',
      uid: '01HZX5G5KJDS9HQRYK8E5T0XXX',
      expectedFingerprint: 'deadbeef'.repeat(8),
      draft: {
        date: '2024-09-01',
        payee: 'lunch',
        status: 'none',
        uid: '01HZX5G5KJDS9HQRYK8E5T0XXX',
        postings: [
          { account: 'Expenses:Food', amount: '10', currency: 'USD' },
          { account: 'Assets:Cash', amount: '-10', currency: 'USD' },
        ],
      },
    });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe('not-found');
  });
});

describe('writeJournal — delete', () => {
  let ctx: TestDbContext;

  beforeEach(async () => {
    ctx = await setupTestDb('write-del-');
  });

  afterEach(async () => {
    await teardownTestDb(ctx);
  });

  it('removes the block plus the trailing blank line', async () => {
    const { getJournalDir } = await import('@/lib/journals');
    const userId = 'test-user';
    const dir = getJournalDir(userId);
    await fs.mkdir(dir, { recursive: true });

    const before =
      '2024-09-01 lunch\n' +
      '    ; :uid: 01HZX5G5KJDS9HQRYK8E5T0DJC\n' +
      '    Expenses:Food  USD 10\n' +
      '    Assets:Cash\n' +
      '\n' +
      '2024-09-02 coffee\n' +
      '    Expenses:Coffee  USD 4\n' +
      '    Assets:Cash\n';
    await fs.writeFile(path.join(dir, 'main.ledger'), before);

    const { writeJournal } = await import('./write');
    const { fingerprintDraft } = await import('./fingerprint');

    const draft = {
      date: '2024-09-01',
      payee: 'lunch',
      status: 'none' as const,
      uid: '01HZX5G5KJDS9HQRYK8E5T0DJC',
      postings: [
        { account: 'Expenses:Food', amount: '10', currency: 'USD' },
        { account: 'Assets:Cash', amount: '', currency: '' },
      ],
    };
    const fp = fingerprintDraft(draft);

    const result = await writeJournal(userId, {
      kind: 'delete',
      uid: '01HZX5G5KJDS9HQRYK8E5T0DJC',
      expectedFingerprint: fp,
    });
    expect(result.ok).toBe(true);

    const after = await fs.readFile(path.join(dir, 'main.ledger'), 'utf-8');
    expect(after).toBe(
      '2024-09-02 coffee\n    Expenses:Coffee  USD 4\n    Assets:Cash\n'
    );
  });

  it('removes the leading blank line when block is last in file', async () => {
    const { getJournalDir } = await import('@/lib/journals');
    const userId = 'test-user';
    const dir = getJournalDir(userId);
    await fs.mkdir(dir, { recursive: true });

    const before =
      '2024-09-02 coffee\n' +
      '    Expenses:Coffee  USD 4\n' +
      '    Assets:Cash\n' +
      '\n' +
      '2024-09-01 lunch\n' +
      '    ; :uid: 01HZX5G5KJDS9HQRYK8E5T0DJC\n' +
      '    Expenses:Food  USD 10\n' +
      '    Assets:Cash\n';
    await fs.writeFile(path.join(dir, 'main.ledger'), before);

    const { writeJournal } = await import('./write');
    const { fingerprintDraft } = await import('./fingerprint');

    const draft = {
      date: '2024-09-01',
      payee: 'lunch',
      status: 'none' as const,
      uid: '01HZX5G5KJDS9HQRYK8E5T0DJC',
      postings: [
        { account: 'Expenses:Food', amount: '10', currency: 'USD' },
        { account: 'Assets:Cash', amount: '', currency: '' },
      ],
    };
    const fp = fingerprintDraft(draft);

    const result = await writeJournal(userId, {
      kind: 'delete',
      uid: '01HZX5G5KJDS9HQRYK8E5T0DJC',
      expectedFingerprint: fp,
    });
    expect(result.ok).toBe(true);

    const after = await fs.readFile(path.join(dir, 'main.ledger'), 'utf-8');
    expect(after).toBe(
      '2024-09-02 coffee\n    Expenses:Coffee  USD 4\n    Assets:Cash\n'
    );
  });
});
