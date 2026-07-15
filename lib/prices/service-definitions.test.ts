import { promises as fs } from 'fs';
import path from 'path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ManualPriceRepository } from './manualRepository';
import { CommodityMappingRepository } from './mappingRepository';
import {
  CommodityPriceRepository,
  PriceFetchRunRepository,
} from './repository';
import { PriceService } from './service';
import { getJournalDir } from '@/lib/journal/layout';
import { JournalRepository } from '@/lib/journal/repository';
import { UserSettingRepository } from '@/lib/settings/repository';
import { push, resetObjectStore } from '@/lib/storage';
import {
  setupTestDb,
  teardownTestDb,
  type TestDbContext,
} from '@/lib/test-utils/db';

describe('PriceService.regenerateUserPriceDb', () => {
  let ctx: TestDbContext;
  let service: PriceService;

  beforeEach(async () => {
    resetObjectStore();
    ctx = await setupTestDb('prices-defs-');
    service = new PriceService({
      db: ctx.db,
      commodityRepo: new CommodityPriceRepository(ctx.db),
      runRepo: new PriceFetchRunRepository(ctx.db),
      journalRepo: new JournalRepository(ctx.db),
      manualRepo: new ManualPriceRepository(ctx.db),
      mappingRepo: new CommodityMappingRepository(ctx.db),
    });
  });

  afterEach(async () => {
    await teardownTestDb(ctx);
    resetObjectStore();
  });

  it('keeps a row whose canonical commodity is mixed-case when regenerating', async () => {
    // Regression for the membership test in regenerateUserPriceDb. A stored row
    // names the alias (`BTC`); the journal declares `commodity Bitcoin / alias
    // BTC`, so canonical('BTC') = 'Bitcoin' — the journal's raw, mixed case.
    // `userSymbols` comes from `ledger commodities`, which is upper-cased
    // ('BITCOIN'). Without normalizing the canonical name before the lookup,
    // `has('Bitcoin')` is false, the row is silently dropped, and Bitcoin gets
    // no price line.
    await ctx.insertUser('ivy', 'ivy', 'ivy@example.com');
    await new UserSettingRepository(ctx.db).upsertBaseCurrency('ivy', 'USD');
    await new JournalRepository(ctx.db).setMainFile('ivy', 'ledger.ledger');
    const dir = getJournalDir('ivy');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, 'ledger.ledger'),
      [
        'commodity Bitcoin',
        '\talias BTC',
        '\tnomarket',
        'include ./2025.ledger',
        '',
      ].join('\n'),
      'utf-8'
    );
    await fs.writeFile(
      path.join(dir, '2025.ledger'),
      '2025/01/01 x\n  Assets:Wallet  1 Bitcoin\n  Income\n',
      'utf-8'
    );
    // A fetched row stored under the alias, quoting the base as the DB always does.
    await new CommodityPriceRepository(ctx.db).insert([
      {
        symbol: 'BTC',
        quote: 'USD',
        price: 50000,
        fetchedAt: new Date('2026-07-07T23:59:59Z'),
        fetchedDate: '2026-07-07',
      },
    ]);
    await push('ivy');

    await service.regenerateUserPriceDb('ivy');

    const generated = await fs.readFile(
      path.join(dir, 'generated-prices.ledger'),
      'utf-8'
    );
    // The row survived the mixed-case membership test and renders under the
    // canonical commodity, never the alias.
    expect(generated).toMatch(/^P .* Bitcoin 50000 USD$/m);
    expect(generated).not.toMatch(/\bBTC\b/);
  });
});
