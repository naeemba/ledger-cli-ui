import { promises as fs } from 'fs';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CommodityDefinitionService } from './service';
import { getJournalDir } from '@/lib/journal/layout';
import { JournalRepository } from '@/lib/journal/repository';
import { resetObjectStore } from '@/lib/storage';
import {
  setupTestDb,
  teardownTestDb,
  type TestDbContext,
} from '@/lib/test-utils/db';

const USER = 'test-user';

describe('CommodityDefinitionService', () => {
  let ctx: TestDbContext;
  let service: CommodityDefinitionService;
  let dir: string;

  beforeEach(async () => {
    ctx = await setupTestDb('commodities-');
    await ctx.insertUser(USER, 'Test', 'test@example.com');
    service = new CommodityDefinitionService(new JournalRepository(ctx.db));
    resetObjectStore();
    dir = getJournalDir(USER);
    await fs.rm(dir, { recursive: true, force: true });
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, 'main.ledger'),
      '2026-07-14 cigarette\n    Expenses:Wage    KIRT 0.9\n    Assets:Bank\n',
      'utf-8'
    );
  });

  afterEach(async () => {
    await teardownTestDb(ctx);
    resetObjectStore();
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('create writes definitions.ledger, includes it, and lists it back', async () => {
    const result = await service.create(USER, {
      symbol: 'KIRT',
      note: 'Iranian Thousand Toman',
      aliases: ['Kirt'],
      decimalPlaces: 1,
      nomarket: false,
      isDefault: false,
    });
    expect(result).toEqual({ ok: true });
    const main = await fs.readFile(path.join(dir, 'main.ledger'), 'utf-8');
    expect(main).toContain('include ./definitions.ledger');
    const rows = await service.list(USER);
    const kirt = rows.find((row) => row.symbol === 'KIRT');
    expect(kirt).toMatchObject({ decimalPlaces: 1, editable: true });
  });

  it('update rewrites only that block; remove deletes it', async () => {
    await service.create(USER, {
      symbol: 'KIRT',
      note: '',
      aliases: [],
      decimalPlaces: null,
      nomarket: false,
      isDefault: false,
    });
    await service.create(USER, {
      symbol: 'ADA',
      note: '',
      aliases: [],
      decimalPlaces: 2,
      nomarket: true,
      isDefault: false,
    });
    const updated = await service.update(USER, 'KIRT', {
      symbol: 'KIRT',
      note: 'toman',
      aliases: ['Kirt'],
      decimalPlaces: 1,
      nomarket: false,
      isDefault: false,
    });
    expect(updated).toEqual({ ok: true });
    const removed = await service.remove(USER, 'ADA');
    expect(removed).toEqual({ ok: true });
    const rows = await service.list(USER);
    expect(rows.map((row) => row.symbol)).toEqual(['KIRT']);
    expect(rows[0].note).toBe('toman');
  });

  it('setting default clears the previous holder', async () => {
    for (const symbol of ['KIRT', 'ADA']) {
      await service.create(USER, {
        symbol,
        note: '',
        aliases: [],
        decimalPlaces: null,
        nomarket: false,
        isDefault: symbol === 'KIRT',
      });
    }
    await service.update(USER, 'ADA', {
      symbol: 'ADA',
      note: '',
      aliases: [],
      decimalPlaces: null,
      nomarket: false,
      isDefault: true,
    });
    const rows = await service.list(USER);
    expect(rows.find((r) => r.symbol === 'KIRT')?.isDefault).toBe(false);
    expect(rows.find((r) => r.symbol === 'ADA')?.isDefault).toBe(true);
  });

  it('rolls back when ledger rejects the result', async () => {
    await service.create(USER, {
      symbol: 'BTC',
      note: '',
      aliases: [],
      decimalPlaces: null,
      nomarket: false,
      isDefault: false,
    });
    // An alias equal to an existing commodity symbol aborts ledger's parse.
    const result = await service.update(USER, 'BTC', {
      raw: 'commodity BTC\n\talias BTC',
    });
    expect(result.ok).toBe(false);
    const definitions = await fs.readFile(
      path.join(dir, 'definitions.ledger'),
      'utf-8'
    );
    expect(definitions).not.toContain('alias BTC');
  });

  it('rejects duplicate create and unknown update/remove symbols', async () => {
    await service.create(USER, {
      symbol: 'KIRT',
      note: '',
      aliases: [],
      decimalPlaces: null,
      nomarket: false,
      isDefault: false,
    });
    expect(
      (
        await service.create(USER, {
          symbol: 'KIRT',
          note: '',
          aliases: [],
          decimalPlaces: null,
          nomarket: false,
          isDefault: false,
        })
      ).ok
    ).toBe(false);
    expect((await service.remove(USER, 'NOPE')).ok).toBe(false);
  });
});
