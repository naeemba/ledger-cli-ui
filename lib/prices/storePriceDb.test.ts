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
import { pull, push, resetObjectStore } from '@/lib/storage';
import {
  setupTestDb,
  teardownTestDb,
  type TestDbContext,
} from '@/lib/test-utils/db';
import { runLedgerForUser } from '@/utils/runLedgerForUser';

describe('the generated price database survives a journal sync', () => {
  let ctx: TestDbContext;
  let service: PriceService;
  let journalRepo: JournalRepository;

  beforeEach(async () => {
    resetObjectStore();
    ctx = await setupTestDb('prices-store-');
    journalRepo = new JournalRepository(ctx.db);
    service = new PriceService({
      db: ctx.db,
      commodityRepo: new CommodityPriceRepository(ctx.db),
      runRepo: new PriceFetchRunRepository(ctx.db),
      journalRepo,
      manualRepo: new ManualPriceRepository(ctx.db),
      mappingRepo: new CommodityMappingRepository(ctx.db),
    });
    await ctx.insertUser('alice', 'alice', 'alice@example.com');
    const dir = getJournalDir('alice');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, 'main.ledger'),
      '2026/10/04 Google One\n  Assets:Receivable:Bashir  AUD 4.66\n  Assets:Bank\n',
      'utf-8'
    );
    await push('alice');
  });

  afterEach(async () => {
    await teardownTestDb(ctx);
    resetObjectStore();
  });

  it('still converts with a manual price after the next page load pulls the journal', async () => {
    // Regression: the rebuilt price file was only written to disk. The next
    // pull deleted it (it was not in the store), ledger ran with no prices, and
    // a USD view of an AUD debt stayed in AUD.
    const result = await service.addManualPrices('alice', {
      date: '2026-10-03',
      quote: 'USD',
      rows: [{ symbol: 'AUD', price: 0.71 }],
    });
    expect(result).toEqual({ ok: true });

    await pull('alice');

    const stdout = await runLedgerForUser(
      'alice',
      ['balance', '-X', 'USD', '--format', '%(display_total)\n', 'Receivable'],
      journalRepo
    );
    // USD shows no decimals: it only appears in price lines, so ledger has
    // no posting to take its display precision from.
    expect(stdout.trim()).toBe('USD3');
  });
});
