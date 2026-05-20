import { promises as fs } from 'fs';
import path from 'path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { fingerprintDraft } from './fingerprint';
import { getJournalDir } from './layout';
import { JournalRepository } from './repository';
import { JournalService } from './service';
import * as schema from '@/db/schema';
import { findUidInBlock } from '@/lib/journal/uid';
import {
  setupTestDb,
  teardownTestDb,
  type TestDbContext,
} from '@/lib/test-utils/db';
import { drizzle } from 'drizzle-orm/better-sqlite3';

const insertTestUser = (ctx: TestDbContext) => {
  ctx.sqlite
    .prepare(`INSERT INTO "user" ("id","name","email") VALUES (?,?,?)`)
    .run('test-user', 'Test', 'test@example.com');
};

describe('JournalService.addTransaction', () => {
  let ctx: TestDbContext;
  let service: JournalService;

  beforeEach(async () => {
    ctx = await setupTestDb('journal-add-');
    insertTestUser(ctx);
    const db = drizzle(ctx.sqlite, { schema });
    service = new JournalService(new JournalRepository(db));
  });

  afterEach(async () => {
    await teardownTestDb(ctx);
  });

  it('stamps a ULID on the new block', async () => {
    const userId = 'test-user';
    await fs.mkdir(getJournalDir(userId), { recursive: true });
    const result = await service.addTransaction(userId, {
      date: '2024-09-01',
      payee: 'lunch',
      status: 'none',
      postings: [
        { account: 'Expenses:Food', amount: '10', currency: 'USD' },
        { account: 'Assets:Cash', amount: '-10', currency: 'USD' },
      ],
    });
    expect(result.ok).toBe(true);
    const text = await fs.readFile(
      path.join(getJournalDir(userId), 'main.ledger'),
      'utf-8'
    );
    expect(findUidInBlock(text)).not.toBeNull();
  });

  it('returns fieldErrors on invalid input', async () => {
    const result = await service.addTransaction('test-user', {
      date: 'not-a-date',
      payee: 'lunch',
      status: 'none',
      postings: [
        { account: 'Expenses:Food', amount: '10', currency: 'USD' },
        { account: 'Assets:Cash', amount: '-10', currency: 'USD' },
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fieldErrors.date).toBeDefined();
  });
});

describe('JournalService.editTransaction', () => {
  let ctx: TestDbContext;
  let service: JournalService;

  beforeEach(async () => {
    ctx = await setupTestDb('journal-edit-');
    insertTestUser(ctx);
    const db = drizzle(ctx.sqlite, { schema });
    service = new JournalService(new JournalRepository(db));
  });

  afterEach(async () => {
    await teardownTestDb(ctx);
  });

  it('rewrites only the target block; rest byte-exact', async () => {
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

    const result = await service.editTransaction(userId, {
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
    const userId = 'test-user';
    const dir = getJournalDir(userId);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, 'main.ledger'),
      '2024-09-01 lunch\n    ; :uid: 01HZX5G5KJDS9HQRYK8E5T0DJC\n    Expenses:Food  USD 10\n    Assets:Cash\n'
    );

    const result = await service.editTransaction(userId, {
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
    if (!result.ok) expect(result.reason).toBe('stale');
  });

  it('returns not-found for unknown uid', async () => {
    const userId = 'test-user';
    await fs.mkdir(getJournalDir(userId), { recursive: true });
    await fs.writeFile(
      path.join(getJournalDir(userId), 'main.ledger'),
      '2024-09-01 lunch\n    Expenses:Food  USD 10\n    Assets:Cash\n'
    );

    const result = await service.editTransaction(userId, {
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
    if (!result.ok) expect(result.reason).toBe('not-found');
  });
});

describe('JournalService.deleteTransaction', () => {
  let ctx: TestDbContext;
  let service: JournalService;

  beforeEach(async () => {
    ctx = await setupTestDb('journal-del-');
    insertTestUser(ctx);
    const db = drizzle(ctx.sqlite, { schema });
    service = new JournalService(new JournalRepository(db));
  });

  afterEach(async () => {
    await teardownTestDb(ctx);
  });

  it('removes the block plus the trailing blank line', async () => {
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

    const result = await service.deleteTransaction(userId, {
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

    const result = await service.deleteTransaction(userId, {
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

describe('JournalService.backfillUids', () => {
  let ctx: TestDbContext;
  let service: JournalService;

  beforeEach(async () => {
    ctx = await setupTestDb('journal-bf-');
    insertTestUser(ctx);
    const db = drizzle(ctx.sqlite, { schema });
    service = new JournalService(new JournalRepository(db));
  });

  afterEach(async () => {
    await teardownTestDb(ctx);
  });

  it('inserts UID into every block lacking one', async () => {
    const userId = 'test-user';
    const dir = getJournalDir(userId);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, 'main.ledger'),
      [
        '2024-09-01 lunch',
        '    Expenses:Food  USD 10',
        '    Assets:Cash',
        '',
        '2024-09-02 coffee',
        '    Expenses:Coffee  USD 4',
        '    Assets:Cash',
        '',
      ].join('\n')
    );

    const result = await service.backfillUids(userId);
    expect(result.uidsAdded).toBe(2);
    expect(result.filesTouched).toBe(1);
  });

  it('is idempotent — a second pass adds nothing', async () => {
    const userId = 'test-user';
    const dir = getJournalDir(userId);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, 'main.ledger'),
      [
        '2024-09-01 lunch',
        '    Expenses:Food  USD 10',
        '    Assets:Cash',
        '',
      ].join('\n')
    );

    const first = await service.backfillUids(userId);
    expect(first.uidsAdded).toBe(1);

    const second = await service.backfillUids(userId);
    expect(second.uidsAdded).toBe(0);
    expect(second.filesTouched).toBe(0);
  });

  it('preserves byte-for-byte content outside the UID insertion', async () => {
    const userId = 'test-user';
    const dir = getJournalDir(userId);
    await fs.mkdir(dir, { recursive: true });
    const original =
      '2024/09/01 lunch\n\tExpenses:Food\t10 USD\n\tAssets:Cash\n';
    await fs.writeFile(path.join(dir, 'main.ledger'), original);

    await service.backfillUids(userId);
    const text = await fs.readFile(path.join(dir, 'main.ledger'), 'utf-8');
    const uid = findUidInBlock(text);
    expect(uid).not.toBeNull();
    const lines = text.split('\n');
    expect(lines[0]).toBe('2024/09/01 lunch');
    expect(lines[2]).toBe('\tExpenses:Food\t10 USD');
    expect(lines[3]).toBe('\tAssets:Cash');
    expect(lines[1]).toBe(`\t; :uid: ${uid}`);
  });
});
